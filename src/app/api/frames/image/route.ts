import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { generateAndSaveImage } from '@/lib/ai/image';
import { generateAndSaveTTS } from '@/lib/ai/tts';
import { getOrCreate, clear } from '@/lib/ai/abort-registry';
import { getVideoSource, upsertFrame } from '@/lib/frames';
import { assertProjectAccess } from '@/lib/session';
import { runDeterministicChecks } from '@/lib/ai/review';
import type { Outline } from '@/types';

const MAX_REVIEW_ROUNDS = 2; // 终检后，每帧最多自动修复几轮

const schema = z.object({
  projectId: z.string().min(1),
  frameIds: z.array(z.string()).optional(),   // 不传则生成全部
  regen: z.boolean().optional(),              // 显式重新生成：跳过"已有产物"的 skip
});

/**
 * POST /api/frames/image
 * 流式生成图片分镜。SSE 推送进度。
 * body: { projectId, frameIds?: string[] }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: '参数错误' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
  const { projectId, frameIds, regen } = parsed.data;

  const access = await assertProjectAccess(projectId);
  if (!access.ok) {
    return new Response(
      JSON.stringify({ error: access.status === 401 ? '未登录' : '项目不存在' }),
      { status: access.status, headers: { 'content-type': 'application/json' } },
    );
  }

  const project = await prisma.project.findUnique({ where: { uuid: projectId } });
  if (!project || !project.outline) {
    return new Response(JSON.stringify({ error: '项目或大纲不存在' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  }
  const outline = project.outline as unknown as Outline;
  const videoSource = await getVideoSource(projectId, outline);

  // 确定要生成哪些帧
  const targetFrames = frameIds?.length
    ? outline.frames.filter(f => frameIds.includes(f.id))
    : outline.frames;

  // 创建/复用 AbortController
  const controller = getOrCreate(projectId, 'image');
  const signal = controller.signal;

  // 流式响应
  const stream = new ReadableStream({
    async start(controllerStream) {
      const enc = new TextEncoder();
      function emit(event: string, data: any) {
        const line = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controllerStream.enqueue(enc.encode(line));
      }

      emit('start', { total: targetFrames.length });
      let completed = 0;
      const newSources = [...videoSource.frames];

      for (const frame of targetFrames) {
        if (signal.aborted) {
          emit('aborted', { reason: '用户中断' });
          break;
        }

        const idx = outline.frames.findIndex(f => f.id === frame.id);
        const existing = newSources[idx];
        if (!regen && existing?.imagePath) {
          completed++;
          emit('skip', { frameId: frame.id, current: completed, total: targetFrames.length });
          continue;
        }

        emit('progress', { frameId: frame.id, current: completed, total: targetFrames.length, phase: 'image' });

        try {
          // 1) 图片
          const imgResult = await generateAndSaveImage({
            projectId,
            frameId: frame.id,
            prompt: frame.imagePrompt || frame.title,
            abortSignal: signal,
          });

          if (signal.aborted) break;

          // 2) TTS
          emit('progress', { frameId: frame.id, current: completed, total: targetFrames.length, phase: 'tts' });
          let audioUrl: string | undefined;
          let audioDuration: number | undefined;
          try {
            const ttsResult = await generateAndSaveTTS({
              projectId,
              frameId: frame.id,
              text: frame.narration,
              abortSignal: signal,
            });
            audioUrl = ttsResult.url;
            audioDuration = ttsResult.duration;
          } catch (ttsErr) {
            console.error('[TTS] 失败', ttsErr);
          }

          // 3) 写库（仅 upsert 当前分镜这一行）
          newSources[idx] = {
            id: frame.id,
            imagePath: imgResult.url,
            audioPath: audioUrl,
            audioDuration,
          };
          await upsertFrame(projectId, frame.id, idx, {
            imagePath: imgResult.url,
            audioPath: audioUrl ?? null,
            audioDuration: audioDuration ?? null,
          });

          completed++;
          emit('frame_done', {
            frameId: frame.id,
            current: completed,
            total: targetFrames.length,
            imagePath: imgResult.url,
            audioPath: audioUrl,
            audioDuration,
          });
        } catch (err) {
          console.error(`[frame ${frame.id}] 失败`, err);
          emit('frame_error', { frameId: frame.id, message: (err as Error).message });
          // 继续下一帧，不整体中断
        }
      }

      // ===== 终检（Review）：图片模式只做确定性校验 + 自动修复，有界重试 =====
      const targetIds = new Set(targetFrames.map(f => f.id));
      emit('review_start', { total: targetFrames.length });
      for (let round = 1; round <= MAX_REVIEW_ROUNDS && !signal.aborted; round++) {
        const issues = runDeterministicChecks(outline, newSources, 'image')
          .filter(it => targetIds.has(it.frameId) && it.category !== 'empty_narration');
        if (issues.length === 0) break;
        emit('review_round', { round, issues: issues.length, total: targetFrames.length });

        for (const issue of issues) {
          if (signal.aborted) break;
          const idx = outline.frames.findIndex(o => o.id === issue.frameId);
          if (idx < 0) continue;
          const frame = outline.frames[idx];
          emit('review_issue', { frameId: frame.id, category: issue.category, severity: issue.severity, issue: issue.issue });
          try {
            // 缺音频只补 TTS；缺画面则重生成图片 + TTS
            if (issue.category === 'missing_audio') {
              const tts = await generateAndSaveTTS({ projectId, frameId: frame.id, text: frame.narration, abortSignal: signal });
              newSources[idx] = { ...newSources[idx], id: frame.id, audioPath: tts.url, audioDuration: tts.duration };
              await upsertFrame(projectId, frame.id, idx, { audioPath: tts.url, audioDuration: tts.duration });
            } else if (issue.category === 'missing_media') {
              const img = await generateAndSaveImage({ projectId, frameId: frame.id, prompt: frame.imagePrompt || frame.title, abortSignal: signal });
              let audioUrl = newSources[idx]?.audioPath;
              let audioDur = newSources[idx]?.audioDuration;
              if (!audioUrl) {
                try {
                  const tts = await generateAndSaveTTS({ projectId, frameId: frame.id, text: frame.narration, abortSignal: signal });
                  audioUrl = tts.url; audioDur = tts.duration;
                } catch (e) { console.error('[review] TTS 补齐失败', (e as Error).message); }
              }
              newSources[idx] = { id: frame.id, imagePath: img.url, audioPath: audioUrl, audioDuration: audioDur };
              await upsertFrame(projectId, frame.id, idx, { imagePath: img.url, audioPath: audioUrl ?? null, audioDuration: audioDur ?? null });
            }
            emit('review_fixed', { frameId: frame.id, category: issue.category });
          } catch (err) {
            console.error(`[review] 修复失败 ${frame.id}`, (err as Error).message);
          }
        }
      }
      const unresolved = runDeterministicChecks(outline, newSources, 'image')
        .filter(it => targetIds.has(it.frameId) && it.category !== 'empty_narration');
      emit('review_done', { unresolved: unresolved.map(it => ({ frameId: it.frameId, issue: it.issue })) });

      emit('done', { completed, total: targetFrames.length });
      clear(projectId, 'image');
      controllerStream.close();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      'connection': 'keep-alive',
    },
  });
}
