import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { generateFrameHtml } from '@/lib/ai/html';
import { generateAndSaveTTS } from '@/lib/ai/tts';
import { startJob, subscribe, getRunningJob, type Emit } from '@/lib/ai/job-manager';
import { getStyleById, getDefaultStyle } from '@/lib/styles/presets';
import { getVideoSource, upsertFrame } from '@/lib/frames';
import { assertProjectAccess } from '@/lib/session';
import {
  runDeterministicChecks,
  runLlmReview,
  fixSimpleHtml,
  type ReviewIssue,
} from '@/lib/ai/review';
import type { Outline, FrameOutline } from '@/types';

const MAX_REPAIR_ROUNDS = 2; // 主生成后，最多再补齐几轮失败分镜
const MAX_REVIEW_ROUNDS = 2; // 终检后，每帧最多自动修复几轮

const schema = z.object({
  projectId: z.string().min(1),
  frameIds: z.array(z.string()).optional(),
  regen: z.boolean().optional(),   // 显式重新生成：跳过"已有产物"的 skip
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
    return new Response(JSON.stringify({ error: '项目或大纲不存在' }), { status: 404, headers: { 'content-type': 'application/json' } });
  }
  const outline = project.outline as unknown as Outline;
  const videoSource = await getVideoSource(projectId, outline);

  const targetFrames = frameIds?.length
    ? outline.frames.filter(f => frameIds.includes(f.id))
    : outline.frames;

  const stylePreset = (await getStyleById(project.styleId)) || (await getDefaultStyle());
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

      // 首帧 HTML 作为全局风格基准 —— 后续所有分镜都锚定它，避免风格逐帧漂移
      function firstHtmlBase(frameId: string): string | null {
        const firstCode = newSources[0]?.htmlCode;
        if (firstCode && outline.frames[0]?.id !== frameId) return firstCode;
        return null;
      }

      // 生成单个分镜（TTS + HTML + 写库），成功返回 true
      // ⚠️ 顺序：先 TTS 拿到真实音频时长，再据此生成时长匹配的 HTML 动画
      async function generateOne(frame: FrameOutline, current: number): Promise<boolean> {
        const idx = outline.frames.findIndex(f => f.id === frame.id);
        try {
          // 1) TTS（先做，拿到真实音频时长）
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

          if (signal.aborted) return false;

          // 2) HTML 动画（时长对齐真实旁白，锚定首帧风格）
          emit('progress', { frameId: frame.id, phase: 'html', current, total: targetFrames.length });
          const htmlCode = await generateFrameHtml({
            globalScript,
            stylePrompt: stylePreset.prompt,
            frame,
            previousHtml: previousHtmlFor(frame.id),
            firstHtml: firstHtmlBase(frame.id),
            durationSec: audioDuration,
          });

          if (signal.aborted) return false;

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
        if (!regen && newSources[idx]?.htmlCode) {
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

      // ===== 终检（Review）：全片视角检查并自动修复，有界重试 + 优雅降级 =====
      const targetIds = new Set(targetFrames.map(f => f.id));

      // 针对单个问题执行修复，成功返回 true
      async function fixIssue(issue: ReviewIssue): Promise<boolean> {
        const idx = outline.frames.findIndex(o => o.id === issue.frameId);
        if (idx < 0) return false;
        const frame = outline.frames[idx];

        // 仅缺音频：只重跑 TTS，避免浪费重生成 HTML
        if (issue.category === 'missing_audio') {
          try {
            const tts = await generateAndSaveTTS({
              projectId,
              frameId: frame.id,
              text: frame.narration,
              abortSignal: signal,
            });
            newSources[idx] = { ...newSources[idx], id: frame.id, audioPath: tts.url, audioDuration: tts.duration };
            await upsertFrame(projectId, frame.id, idx, { audioPath: tts.url, audioDuration: tts.duration });
            return true;
          } catch (err) {
            console.error('[review] TTS 修复失败', (err as Error).message);
            return false;
          }
        }

        // 旁白为空：内容层缺失，无法自动补，跳过（记为未解决）
        if (issue.category === 'empty_narration') return false;

        // typo / layout：尝试 LLM 局部修复；失败则回退整帧重生成
        if ((issue.category === 'typo' || issue.category === 'layout') && newSources[idx]?.htmlCode) {
          const fixed = await fixSimpleHtml(newSources[idx]!.htmlCode!, issue.issue);
          if (fixed) {
            newSources[idx] = { ...newSources[idx], id: frame.id, htmlCode: fixed };
            await upsertFrame(projectId, frame.id, idx, { htmlCode: fixed });
            return true;
          }
        }

        // 其余（missing_media / bad_steps / cross_frame / style_drift 或局部修失败）：整帧重生成
        return generateOne(frame, completed);
      }

      emit('review_start', { total: targetFrames.length });
      let prevSignature = ''; // 上一轮问题指纹，用于识别"修了没进展"
      for (let round = 1; round <= MAX_REVIEW_ROUNDS && !signal.aborted; round++) {
        // 收集问题：确定性校验 + LLM 全片审查（仅对已生成 HTML 的目标帧）
        const deterministic = runDeterministicChecks(outline, newSources, 'html')
          .filter(it => targetIds.has(it.frameId));

        const reviewable = outline.frames
          .filter(f => targetIds.has(f.id) && newSources[outline.frames.findIndex(o => o.id === f.id)]?.htmlCode)
          .map(f => {
            const idx = outline.frames.findIndex(o => o.id === f.id);
            return { id: f.id, index: f.index, title: f.title, narration: f.narration, htmlCode: newSources[idx]!.htmlCode! };
          });
        let llm: ReviewIssue[] = [];
        try {
          llm = await runLlmReview(reviewable, stylePreset.prompt);
        } catch (err) {
          console.error('[review] LLM 审查失败，跳过本轮', (err as Error).message);
        }

        // 去重：同帧同类别只留一条
        const all = [...deterministic, ...llm];
        const seen = new Set<string>();
        const issues = all.filter(it => {
          const k = `${it.frameId}:${it.category}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });

        if (issues.length === 0) break;

        // 若本轮问题集与上一轮完全相同，说明上一轮的修复无效（同样的问题又冒出来），
        // 再修一次也是同样结果 —— 直接跳出，避免"发现→修复→仍在→再发现"的死循环。
        const signature = issues.map(it => `${it.frameId}:${it.category}`).sort().join('|');
        if (signature === prevSignature) {
          console.warn('[review] 本轮问题与上一轮一致，判定修复无进展，停止重试');
          break;
        }
        prevSignature = signature;

        emit('review_round', { round, issues: issues.length, total: targetFrames.length });

        for (const issue of issues) {
          if (signal.aborted) break;
          emit('review_issue', { frameId: issue.frameId, category: issue.category, severity: issue.severity, issue: issue.issue });
          const ok = await fixIssue(issue);
          if (ok) emit('review_fixed', { frameId: issue.frameId, category: issue.category });
        }
      }

      // 终检后仍存在的问题（优雅降级：不阻塞，如实告知）
      const unresolved = runDeterministicChecks(outline, newSources, 'html')
        .filter(it => targetIds.has(it.frameId));
      emit('review_done', { unresolved: unresolved.map(it => ({ frameId: it.frameId, issue: it.issue })) });

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
      // 显式告知 nginx 等反向代理不要缓冲此响应，否则 SSE 进度事件会被攒住，
      // 前端在任务结束前看不到任何逐帧进度（表现为“卡住无反应”）。
      'x-accel-buffering': 'no',
    },
  });
}
