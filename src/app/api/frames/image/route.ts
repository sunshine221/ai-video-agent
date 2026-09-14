import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { generateAndSaveImage } from '@/lib/ai/image';
import { generateAndSaveTTS } from '@/lib/ai/tts';
import { getOrCreate, clear } from '@/lib/ai/abort-registry';
import { getVideoSource, upsertFrame } from '@/lib/frames';
import type { Outline } from '@/types';

const schema = z.object({
  projectId: z.string().uuid(),
  frameIds: z.array(z.string()).optional(),   // 不传则生成全部
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
  const { projectId, frameIds } = parsed.data;

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
        if (existing?.imagePath) {
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
