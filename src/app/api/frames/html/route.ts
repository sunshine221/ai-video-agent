import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { generateFrameHtml } from '@/lib/ai/html';
import { generateAndSaveTTS } from '@/lib/ai/tts';
import { getOrCreate, clear } from '@/lib/ai/abort-registry';
import { getStyleById, getDefaultStyle } from '@/lib/styles/presets';
import type { Outline, VideoSource } from '@/types';

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
  const videoSource = (project.videoSource as unknown as VideoSource) || { frames: [] };

  const targetFrames = frameIds?.length
    ? outline.frames.filter(f => frameIds.includes(f.id))
    : outline.frames;

  const controller = getOrCreate(projectId, 'html');
  const signal = controller.signal;

  const stylePreset = getStyleById(project.styleId) || getDefaultStyle();
  const globalScript = outline.frames.map(f => `[#${f.index}] ${f.title}: ${f.narration}`).join('\n');

  const stream = new ReadableStream({
    async start(controllerStream) {
      const enc = new TextEncoder();
      function emit(event: string, data: any) {
        controllerStream.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      emit('start', { total: targetFrames.length });
      let completed = 0;
      const newSources = [...videoSource.frames];
      let previousHtml: string | null = null;

      for (const frame of targetFrames) {
        if (signal.aborted) {
          emit('aborted', { reason: '用户中断' });
          break;
        }

        const idx = outline.frames.findIndex(f => f.id === frame.id);
        const existing = newSources[idx];
        if (existing?.htmlCode) {
          previousHtml = existing.htmlCode;
          completed++;
          emit('skip', { frameId: frame.id, current: completed, total: targetFrames.length });
          continue;
        }

        emit('progress', { frameId: frame.id, current: completed, total: targetFrames.length, phase: 'html' });

        try {
          // 1) HTML 动画
          const htmlCode = await generateFrameHtml({
            globalScript,
            stylePrompt: stylePreset.prompt,
            frame,
            previousHtml,
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

          // 3) 写库
          newSources[idx] = {
            id: frame.id,
            htmlCode,
            audioPath: audioUrl,
            audioDuration,
          };
          await prisma.project.update({
            where: { uuid: projectId },
            data: { videoSource: { frames: newSources } as any },
          });

          previousHtml = htmlCode;
          completed++;
          emit('frame_done', {
            frameId: frame.id,
            current: completed,
            total: targetFrames.length,
            audioPath: audioUrl,
            audioDuration,
          });
        } catch (err) {
          console.error(`[frame ${frame.id}] HTML 生成失败`, err);
          emit('frame_error', { frameId: frame.id, message: (err as Error).message });
        }
      }

      emit('done', { completed, total: targetFrames.length });
      clear(projectId, 'html');
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
