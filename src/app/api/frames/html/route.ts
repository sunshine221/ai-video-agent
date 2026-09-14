import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { generateFrameHtml } from '@/lib/ai/html';
import { generateAndSaveTTS } from '@/lib/ai/tts';
import { startJob, subscribe, getRunningJob, type Emit } from '@/lib/ai/job-manager';
import { getStyleById, getDefaultStyle } from '@/lib/styles/presets';
import { getVideoSource, upsertFrame } from '@/lib/frames';
import type { Outline, FrameOutline } from '@/types';

const MAX_REPAIR_ROUNDS = 2; // 主生成后，最多再补齐几轮失败分镜

const schema = z.object({
  projectId: z.string().uuid(),
  frameIds: z.array(z.string()).optional(),
});

/**
 * POST /api/frames/html
 * 流式生成 HTML 动画分镜。SSE 推送进度。
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: '参数错误' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
  const { projectId, frameIds } = parsed.data;

  const project = await prisma.project.findUnique({ where: { uuid: projectId } });
  if (!project || !project.outline) {
    return new Response(JSON.stringify({ error: '项目或大纲不存在' }), { status: 404, headers: { 'content-type': 'application/json' } });
  }
  const outline = project.outline as unknown as Outline;
  const videoSource = await getVideoSource(projectId, outline);

  const targetFrames = frameIds?.length
    ? outline.frames.filter(f => frameIds.includes(f.id))
    : outline.frames;

  const stylePreset = getStyleById(project.styleId) || getDefaultStyle();
  const globalScript = outline.frames.map(f => `[#${f.index}] ${f.title}: ${f.narration}`).join('\n');

  // 生成逻辑：在后台独立运行，通过 emit 上报进度，signal 用于响应显式中断。
  // 与 HTTP 请求解耦 —— 客户端断开不会中止它。
  const runner = async (emit: Emit, signal: AbortSignal) => {
      emit('start', { total: targetFrames.length });
      const newSources = [...videoSource.frames];

      // 取某分镜之前最近一张已生成的 HTML，用于保持风格连续
      function previousHtmlFor(frameId: string): string | null {
        const pos = outline.frames.findIndex(f => f.id === frameId);
        for (let i = pos - 1; i >= 0; i--) {
          const code = newSources[i]?.htmlCode;
          if (code) return code;
        }
        return null;
      }

      // 生成单个分镜（HTML + TTS + 写库），成功返回 true
      async function generateOne(frame: FrameOutline, current: number): Promise<boolean> {
        const idx = outline.frames.findIndex(f => f.id === frame.id);
        emit('progress', { frameId: frame.id, phase: 'html', current, total: targetFrames.length });
        try {
          // 1) HTML 动画
          const htmlCode = await generateFrameHtml({
            globalScript,
            stylePrompt: stylePreset.prompt,
            frame,
            previousHtml: previousHtmlFor(frame.id),
          });

          if (signal.aborted) return false;

          // 2) TTS
          emit('progress', { frameId: frame.id, phase: 'tts', current, total: targetFrames.length });
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

          // 3) 写库（仅 upsert 当前分镜这一行，避免整列写放大/并发覆盖）
          newSources[idx] = {
            id: frame.id,
            htmlCode,
            audioPath: audioUrl,
            audioDuration,
          };
          await upsertFrame(projectId, frame.id, idx, {
            htmlCode,
            audioPath: audioUrl ?? null,
            audioDuration: audioDuration ?? null,
          });
          return true;
        } catch (err) {
          console.error(`[frame ${frame.id}] HTML 生成失败`, err);
          emit('frame_error', { frameId: frame.id, message: (err as Error).message });
          return false;
        }
      }

      let completed = 0;

      // ===== 主生成：逐镜生成，已生成的跳过 =====
      for (const frame of targetFrames) {
        if (signal.aborted) {
          emit('aborted', { reason: '用户中断' });
          break;
        }

        const idx = outline.frames.findIndex(f => f.id === frame.id);
        if (newSources[idx]?.htmlCode) {
          completed++;
          emit('skip', { frameId: frame.id, current: completed, total: targetFrames.length });
          continue;
        }

        const ok = await generateOne(frame, completed);
        if (signal.aborted) break;
        if (ok) {
          completed++;
          const src = newSources[idx];
          emit('frame_done', {
            frameId: frame.id,
            current: completed,
            total: targetFrames.length,
            audioPath: src?.audioPath,
            audioDuration: src?.audioDuration,
          });
        }
      }

      // ===== 兜底校验补全：主生成后，检查是否仍有缺失分镜，多轮重试补齐 =====
      for (let round = 1; round <= MAX_REPAIR_ROUNDS && !signal.aborted; round++) {
        const missing = targetFrames.filter(f => {
          const idx = outline.frames.findIndex(o => o.id === f.id);
          return !newSources[idx]?.htmlCode;
        });
        if (missing.length === 0) break;

        emit('repair', { round, missing: missing.length, total: targetFrames.length });

        for (const frame of missing) {
          if (signal.aborted) break;
          const ok = await generateOne(frame, completed);
          if (ok) {
            completed++;
            const idx = outline.frames.findIndex(o => o.id === frame.id);
            const src = newSources[idx];
            emit('frame_done', {
              frameId: frame.id,
              current: completed,
              total: targetFrames.length,
              audioPath: src?.audioPath,
              audioDuration: src?.audioDuration,
              repaired: true,
            });
          }
        }
      }

      // 统计最终仍失败的分镜
      const failed = targetFrames.filter(f => {
        const idx = outline.frames.findIndex(o => o.id === f.id);
        return !newSources[idx]?.htmlCode;
      });
      const succeeded = targetFrames.length - failed.length;

      emit('done', {
        completed: succeeded,
        total: targetFrames.length,
        failed: failed.map(f => f.id),
      });
  };

  // 启动（或复用）后台任务：任务独立于本请求运行。
  // 若已有运行中的任务（例如用户刷新后再次点击），直接复用并接入观察，不重复生成。
  const job = getRunningJob(projectId, 'html') ?? startJob(projectId, 'html', runner);

  // SSE 流仅作为「观察者」：回放已发生的事件 + 接收后续实时事件。
  // 客户端断开只取消订阅，不影响后台任务。
  const stream = new ReadableStream({
    start(controllerStream) {
      const enc = new TextEncoder();
      let unsubscribe: () => void = () => {};
      const send = (ev: { event: string; data: unknown }) => {
        try {
          controllerStream.enqueue(
            enc.encode(`event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`),
          );
        } catch {
          // 流已关闭，忽略
        }
        // 收到终止事件后关闭本次 SSE 连接（不影响任务）
        if (ev.event === 'done' || ev.event === 'aborted' || ev.event === 'error') {
          unsubscribe();
          try {
            controllerStream.close();
          } catch {
            /* already closed */
          }
        }
      };
      unsubscribe = subscribe(job, send);

      // 客户端断开：仅取消订阅，任务继续在后台跑
      req.signal.addEventListener('abort', () => {
        unsubscribe();
        try {
          controllerStream.close();
        } catch {
          /* already closed */
        }
      });
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
