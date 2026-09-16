import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { startJob, subscribe, getRunningJob, type Emit } from '@/lib/ai/job-manager';
import { getVideoSource } from '@/lib/frames';
import { assertProjectAccess } from '@/lib/session';
import { runExport } from '@/lib/export';
import type { Outline, ProjectType } from '@/types';

// 渲染 + ffmpeg 需要 Node 运行时（非 edge），且耗时较长
export const runtime = 'nodejs';
export const maxDuration = 3600;

const schema = z.object({
  projectId: z.string().min(1),
  showSubtitle: z.boolean().optional(),
});

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * POST /api/export
 * 服务端渲染并合成带声音的 MP4，SSE 推送进度，完成时返回下载 URL。
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError('参数错误', 400);
  const { projectId, showSubtitle } = parsed.data;

  const access = await assertProjectAccess(projectId);
  if (!access.ok) {
    return jsonError(access.status === 401 ? '未登录' : '项目不存在', access.status);
  }

  const project = await prisma.project.findUnique({ where: { uuid: projectId } });
  if (!project || !project.outline) return jsonError('项目或大纲不存在', 404);

  const outline = project.outline as unknown as Outline;
  const videoSource = await getVideoSource(projectId, outline);
  const projectType = project.type as ProjectType;

  const runner = async (emit: Emit, signal: AbortSignal) => {
    await runExport(
      {
        projectId,
        projectType,
        title: project.title,
        outline,
        videoSource,
        showSubtitle: showSubtitle ?? true,
      },
      emit,
      signal,
    );
  };

  // 复用运行中的导出任务（避免重复触发），否则启动新任务
  const job = getRunningJob(projectId, 'export') ?? startJob(projectId, 'export', runner);

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
          /* 流已关闭 */
        }
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
