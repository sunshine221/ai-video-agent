import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { analyzeIntent } from '@/lib/ai/intent';
import { editOutline } from '@/lib/ai/outline';
import { updateBrief } from '@/lib/ai/brief';
import { modifyFrameContent } from '@/lib/ai/frame-ops';
import { generateAndSaveImage } from '@/lib/ai/image';
import { generateFrameHtml } from '@/lib/ai/html';
import { generateAndSaveTTS } from '@/lib/ai/tts';
import { getStyleById, getDefaultStyle } from '@/lib/styles/presets';
import {
  getVideoSource,
  syncFramesToOutline,
  resetFrameMedia,
  upsertFrame,
  getFrameHtml,
} from '@/lib/frames';
import { assertProjectAccess } from '@/lib/session';
import { newId } from '@/lib/id';
import type {
  IntentResult,
  ProjectDetail,
  Outline,
  VideoSource,
  FrameOutline,
  ProjectType,
  CreativeBrief,
} from '@/types';

const schema = z.object({
  projectId: z.string().min(1),
  content: z.string().min(1).max(2000),
});

const RECENT_HISTORY_ROUNDS = 3;

/**
 * POST /api/agent/chat
 * Agent 入口：接收用户提示词，意图分析后路由到具体能力。
 *
 * 路由（收敛后 4 个能力）：
 * - edit_outline    → 大纲的一切文字/结构编辑（创作/重做/增删镜/改数量/改文字/重排）；
 *                     只动大纲，未改分镜的画面音频靠保留 id 不丢；仅为新增分镜自动生成媒体。
 * - regenerate_media → 明确要求重做某一镜的画面/配音（可带内容修改）。
 * - clarify         → 真歧义时反问。
 * - unknown         → 友好提示。
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: '参数错误' }, { status: 400 });
    }
    const { projectId, content } = parsed.data;

    const access = await assertProjectAccess(projectId);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.status === 401 ? '未登录' : '项目不存在' },
        { status: access.status },
      );
    }

    const project = await prisma.project.findUnique({ where: { uuid: projectId } });
    if (!project) return NextResponse.json({ error: '项目不存在' }, { status: 404 });

    // 1) 写入用户消息
    const userMessage = await prisma.message.create({
      data: {
        id: newId(),
        projectId,
        role: 'user',
        content,
        metadata: { kind: 'text' },
      },
    });

    // 2) 意图分析
    let intent: IntentResult;
    let assistantContent = '';
    let assistantMetadata: any = { kind: 'text' };
    let projectUpdate: Partial<{ title: string; outline: Outline; brief: CreativeBrief }> = {};
    // 大纲结构变化时，需要在 project 更新后同步 frame 表（删除多余行、对齐顺序）
    let outlineToSync: Outline | null = null;
    const conversationContext = await buildConversationContext(projectId, RECENT_HISTORY_ROUNDS);

    try {
      intent = await analyzeIntent(projectId, content);
    } catch (err) {
      console.error('[intent] 失败', err);
      intent = { action: 'unknown', reason: '意图分析失败', params: {} };
    }

    // 3) 按 action 路由
    switch (intent.action) {
      case 'edit_outline': {
        const result = await handleEditOutline({
          projectId,
          projectType: project.type as ProjectType,
          styleId: project.styleId,
          hadOutline: !!project.outline,
          currentOutline: (project.outline as unknown as Outline) ?? null,
          currentBrief: (project.brief as unknown as CreativeBrief) ?? null,
          userRequest: String(intent.params?.request || content),
          rawContent: content,
          conversationContext,
        });
        projectUpdate.brief = result.brief;
        projectUpdate.outline = result.outline;
        if (!project.outline) projectUpdate.title = result.outline.title;
        outlineToSync = result.outline;
        assistantContent = result.message;
        assistantMetadata = { kind: 'outline', outline: result.outline };
        break;
      }

      case 'regenerate_media': {
        const result = await handleRegenerateFrame({
          projectId,
          projectType: project.type as ProjectType,
          styleId: project.styleId,
          currentOutline: (project.outline as unknown as Outline) ?? null,
          params: intent.params,
          conversationContext,
        });
        if (result.outline) {
          projectUpdate.outline = result.outline;
          // 大纲有变更：把新大纲随消息发回，前端渲染大纲卡片让用户直接看到新旁白/画面
          assistantMetadata = { kind: 'outline', outline: result.outline };
        }
        assistantContent = result.message;
        break;
      }

      case 'clarify': {
        const question = String(intent.params?.question || '').trim();
        assistantContent = question
          || '我不太确定您的意思，能再说明一下吗？例如：修改某一镜的文字、重做某一镜的画面、还是增删分镜？';
        break;
      }

      default:
        assistantContent = `抱歉，我暂时还不理解您的指令。\n\n我能做的：\n• 创作新视频（输入主题即可）\n• 重新生成 / 修改大纲：改文字、增删分镜、改分镜数量、调整顺序（"把第 3 镜旁白加上年份"、"在第 2 镜后加一镜讲爱因斯坦"、"3 镜改成 2 镜"）\n• 重做某个分镜的画面/配音（"第 3 镜画面重新生成"）\n\n请试试："做一个 3 分钟介绍黑洞的视频"`;
    }

    // 4) 更新项目（如有）
    let updatedProject = project;
    if (Object.keys(projectUpdate).length) {
      updatedProject = await prisma.project.update({
        where: { uuid: projectId },
        data: projectUpdate as any,
      });
    }
    // 大纲结构变化时，同步 frame 表（删除多余分镜、对齐顺序）
    if (outlineToSync) {
      await syncFramesToOutline(projectId, outlineToSync);
    }

    // 5) 写助手消息
    const assistantMessage = await prisma.message.create({
      data: {
        id: newId(),
        projectId,
        role: 'assistant',
        content: assistantContent,
        metadata: assistantMetadata,
      },
    });

    // 6) 返回（videoSource 从 frame 表聚合，按 outline 顺序对齐）
    const finalOutline = (updatedProject.outline as unknown as Outline) ?? null;
    const detail: ProjectDetail = {
      uuid: updatedProject.uuid,
      title: updatedProject.title,
      type: updatedProject.type as 'image' | 'html',
      styleId: updatedProject.styleId,
      outline: finalOutline,
      videoSource: finalOutline ? await getVideoSource(projectId, finalOutline) : null,
      createdAt: updatedProject.createdAt.toISOString(),
      updatedAt: updatedProject.updatedAt.toISOString(),
      hasOutline: !!updatedProject.outline,
    };

    return NextResponse.json({
      userMessage: { ...userMessage, createdAt: userMessage.createdAt.toISOString() },
      assistantMessage: { ...assistantMessage, createdAt: assistantMessage.createdAt.toISOString() },
      project: detail,
      intent,
    });
  } catch (err) {
    console.error('[POST /api/agent/chat]', err);
    return NextResponse.json({ error: 'AI 处理失败' }, { status: 500 });
  }
}

// =============================================================================
// 内部：修改分镜
// =============================================================================

async function handleRegenerateFrame(opts: {
  projectId: string;
  projectType: ProjectType;
  styleId: string | null;
  currentOutline: Outline | null;
  params: Record<string, unknown>;
  conversationContext: string;
}): Promise<{
  outline?: Outline;
  message: string;
}> {
  const { projectId, projectType, styleId, currentOutline, params, conversationContext } = opts;

  if (!currentOutline) {
    return { message: '当前项目还没有大纲，请先生成大纲。' };
  }

  const total = currentOutline.frames.length;
  // 解析 1-based 分镜编号列表（兼容旧的单个 frameIndex 字段），去重并校验范围
  const requested = parseFrameIndexes(params);
  if (requested.length === 0) {
    return { message: '没有识别到要重做的分镜编号，请说明是哪一镜（如“第 3 镜”“1、2、3 镜”）。' };
  }
  const valid = requested.filter(n => n >= 1 && n <= total);
  const invalid = requested.filter(n => n < 1 || n > total);
  if (valid.length === 0) {
    return { message: `分镜编号 ${invalid.join('、')} 不存在（当前共 ${total} 个分镜）。` };
  }

  const modification = String(params.modification || '').trim();

  // 逐镜处理：先用 AI 重写内容（旁白+画面描述），再清旧产物并重生成画面/配音。
  // 每一镜的修改都累积进 workingOutline，供后续镜的上下文/风格连续参考。
  let workingOutline: Outline = currentOutline;
  const doneFrames: string[] = [];   // 成功的“#i《标题》”
  const contentFailed: number[] = []; // AI 改内容失败的镜号
  const mediaFailed: number[] = [];   // 内容已改但画面/配音生成失败的镜号

  for (const frameIndex1 of valid) {
    const frameIndex0 = frameIndex1 - 1;

    let updated: Partial<FrameOutline> = {};
    try {
      updated = await modifyFrameContent({
        type: projectType,
        outline: workingOutline,
        frameIndex: frameIndex0,
        userModification: modification,
        conversationContext,
      });
    } catch (err) {
      console.error('[modifyFrameContent] 失败', frameIndex1, err);
      contentFailed.push(frameIndex1);
      continue;
    }

    const newFrames = workingOutline.frames.map((f, i) =>
      i === frameIndex0
        ? {
            ...f,
            title: updated.title || f.title,
            narration: updated.narration || f.narration,
            imagePrompt: projectType === 'image' ? (updated.imagePrompt || f.imagePrompt) : f.imagePrompt,
            visualSummary: projectType === 'html' ? (updated.visualSummary ?? f.visualSummary) : f.visualSummary,
            layout: projectType === 'html' ? (updated.layout ?? f.layout) : f.layout,
            animation: projectType === 'html' ? (updated.animation ?? f.animation) : f.animation,
            transition: projectType === 'html' ? (updated.transition ?? f.transition) : f.transition,
          }
        : f,
    );
    workingOutline = { ...workingOutline, frames: newFrames };
    const frame = newFrames[frameIndex0];

    // 先清空旧产物（让生成逻辑走“新生成”分支）
    await resetFrameMedia(projectId, frame.id);
    try {
      await regenerateFrameMedia({ projectId, projectType, styleId, outline: workingOutline, frame });
      doneFrames.push(`#${frameIndex1}《${frame.title}》`);
    } catch (err) {
      console.error('[regenerateFrameMedia] 失败', frameIndex1, err);
      mediaFailed.push(frameIndex1);
    }
  }

  // 组织回复：大纲有变更就把大纲重新发回（由调用方渲染大纲卡片），文字里补充成功/失败明细
  const parts: string[] = [];
  if (doneFrames.length) {
    parts.push(`已重新生成 ${doneFrames.length} 个分镜的旁白和画面：${doneFrames.join('、')}。`);
  }
  if (mediaFailed.length) {
    parts.push(`分镜 ${mediaFailed.join('、')} 的文字已更新，但画面/配音生成失败。`);
  }
  if (contentFailed.length) {
    parts.push(`分镜 ${contentFailed.join('、')} 内容修改失败，已跳过。`);
  }
  if (invalid.length) {
    parts.push(`分镜编号 ${invalid.join('、')} 不存在，已忽略。`);
  }

  // 只要 workingOutline 相对原大纲有变化（有任一镜进入过重写），就回传新大纲
  const changed = workingOutline !== currentOutline;
  return {
    outline: changed ? workingOutline : undefined,
    message: parts.join('\n') || '没有可重做的分镜。',
  };
}

/**
 * 从意图参数里解析 1-based 分镜编号列表。
 * 兼容三种形态：frameIndexes 数组、单个 frameIndexes 数字、旧字段 frameIndex。
 * 结果去重并保持出现顺序。
 */
function parseFrameIndexes(params: Record<string, unknown>): number[] {
  const raw: unknown[] = [];
  const list = params.frameIndexes;
  if (Array.isArray(list)) raw.push(...list);
  else if (list != null) raw.push(list);
  if (params.frameIndex != null) raw.push(params.frameIndex);

  const seen = new Set<number>();
  const result: number[] = [];
  for (const v of raw) {
    const n = Math.trunc(Number(v));
    if (Number.isFinite(n) && n > 0 && !seen.has(n)) {
      seen.add(n);
      result.push(n);
    }
  }
  return result;
}

// =============================================================================
// 内部：编辑大纲（创作/重做/增删镜/改数量/改文字/重排 的统一入口）
//
// 关键设计：
// - 简报是事实来源：先把用户这句话增量合并进简报，再据简报编辑大纲。
// - editOutline 只产出新大纲文字/结构。
// - 媒体重生成规则：新增分镜、或旁白/画面描述有改动的分镜，都重做画面+配音；
//   仅调整顺序/标题（不影响画面配音）的分镜保留原媒体不动。
// =============================================================================

async function handleEditOutline(opts: {
  projectId: string;
  projectType: ProjectType;
  styleId: string | null;
  hadOutline: boolean;
  currentOutline: Outline | null;
  currentBrief: CreativeBrief | null;
  userRequest: string;
  rawContent: string;
  conversationContext: string;
}): Promise<{ brief: CreativeBrief; outline: Outline; message: string }> {
  const {
    projectId, projectType, styleId, hadOutline,
    currentOutline, currentBrief, userRequest, rawContent, conversationContext,
  } = opts;

  // 1) 简报增量更新（用原始用户输入，保证主题/时长/数量等约束准确）
  const brief = await updateBrief(currentBrief, rawContent);

  // 2) 从简报 + 当前大纲派生新大纲
  const outline = await editOutline({
    type: projectType,
    brief,
    currentOutline,
    userRequest,
    conversationContext,
  });

  // 3) 首次创作：无旧大纲，全部帧都是新的，交由用户后续触发生成，不在此自动生成
  if (!hadOutline) {
    return {
      brief,
      outline,
      message: `已为您生成大纲《${outline.title}》，共 ${outline.frames.length} 个分镜。`,
    };
  }

  // 4) 找出内容有改动的分镜：新增的、或旁白/画面描述有改动的
  const oldById = new Map((currentOutline?.frames ?? []).map(f => [f.id, f]));
  const changedFrames = outline.frames.filter(f => {
    const old = oldById.get(f.id);
    return !old || frameContentChanged(projectType, old, f);
  });

  // 5) 对齐 frame 表：删除被移除的分镜、更新顺序（不生成媒体）
  await syncFramesToOutline(projectId, outline);

  if (changedFrames.length === 0) {
    // 仅顺序/标题变化，不影响画面配音：不动任何媒体
    return {
      brief,
      outline,
      message: `已更新大纲《${outline.title}》，共 ${outline.frames.length} 个分镜（画面和配音无需变动）。`,
    };
  }

  // 6) 清空改动分镜的旧产物（旧画面/配音已与新文字不符）。
  //    ⚠️ 不在此同步重生成——单张 HTML/图片就要调大模型数十秒，整份大纲串行会阻塞
  //    聊天请求数分钟，前端表现为“没有回复”。媒体交由用户点「重新生成」走异步流式
  //    生成（带进度、可中断），与“首次创作”分支保持一致。
  for (const frame of changedFrames) {
    await resetFrameMedia(projectId, frame.id);
  }

  return {
    brief,
    outline,
    message: `已更新大纲《${outline.title}》，共 ${outline.frames.length} 个分镜，其中 ${changedFrames.length} 个分镜内容有改动。请点击「重新生成」按钮生成对应的画面和配音（未改动的分镜保持不变）。`,
  };
}

/** 判断分镜的“旁白/画面描述”是否有改动（标题变化不算，因为不影响画面/配音） */
function frameContentChanged(type: ProjectType, a: FrameOutline, b: FrameOutline): boolean {
  if ((a.narration || '') !== (b.narration || '')) return true;
  if (type === 'image') {
    return (a.imagePrompt || '') !== (b.imagePrompt || '');
  }
  return (
    (a.visualSummary || '') !== (b.visualSummary || '') ||
    (a.layout || '') !== (b.layout || '') ||
    (a.animation || '') !== (b.animation || '') ||
    (a.transition || '') !== (b.transition || '')
  );
}

async function buildConversationContext(projectId: string, recentRounds: number): Promise<string> {
  const messages = await prisma.message.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' },
    select: { role: true, content: true },
  });

  const normalized = messages
    .map(message => ({
      role: message.role as 'user' | 'assistant',
      content: message.content.trim(),
    }))
    .filter(message => message.content);

  if (normalized.length === 0) return '';

  const firstUser = normalized.find(message => message.role === 'user');
  const rounds: Array<{ user: string; assistants: string[] }> = [];
  let currentRound: { user: string; assistants: string[] } | null = null;

  for (const message of normalized) {
    if (message.role === 'user') {
      if (currentRound) rounds.push(currentRound);
      currentRound = { user: message.content, assistants: [] };
      continue;
    }

    if (!currentRound) {
      currentRound = { user: '', assistants: [message.content] };
    } else {
      currentRound.assistants.push(message.content);
    }
  }

  if (currentRound) rounds.push(currentRound);

  const recent = rounds
    .filter((round, index) => !(index === 0 && firstUser && round.user === firstUser.content))
    .slice(-recentRounds);

  const parts: string[] = [];

  if (firstUser) {
    parts.push('【最开始的用户需求】');
    parts.push(firstUser.content);
  }

  if (recent.length > 0) {
    parts.push(`【最近${recent.length}轮对话】`);
    recent.forEach((round, index) => {
      parts.push(`第${index + 1}轮`);
      if (round.user) {
        parts.push(`用户：${round.user}`);
      }
      round.assistants.forEach(reply => {
        parts.push(`助手：${reply}`);
      });
    });
  }

  return parts.join('\n');
}

// =============================================================================
// 内部：单个分镜的画面/HTML + TTS 重新生成
// =============================================================================

async function regenerateFrameMedia(opts: {
  projectId: string;
  projectType: ProjectType;
  styleId: string | null;
  outline: Outline;
  frame: FrameOutline;
}): Promise<void> {
  const { projectId, projectType, styleId, outline, frame } = opts;
  const idx = outline.frames.findIndex(f => f.id === frame.id);
  const patch: {
    htmlCode?: string;
    imagePath?: string;
    audioPath?: string | null;
    audioDuration?: number | null;
  } = {};

  // 1) TTS（先做，拿到真实音频时长，供 HTML 动画对齐时长使用）
  let audioDuration: number | undefined;
  if (projectType === 'image') {
    const imgResult = await generateAndSaveImage({
      projectId,
      frameId: frame.id,
      prompt: frame.imagePrompt || frame.title,
    });
    patch.imagePath = imgResult.url;

    try {
      const ttsResult = await generateAndSaveTTS({
        projectId,
        frameId: frame.id,
        text: frame.narration,
      });
      patch.audioPath = ttsResult.url;
      patch.audioDuration = ttsResult.duration;
    } catch (ttsErr) {
      console.error('[regenerateFrameMedia TTS] 失败', ttsErr);
    }
  } else {
    // TTS 先行，HTML 动画时长据此对齐旁白
    try {
      const ttsResult = await generateAndSaveTTS({
        projectId,
        frameId: frame.id,
        text: frame.narration,
      });
      patch.audioPath = ttsResult.url;
      patch.audioDuration = ttsResult.duration;
      audioDuration = ttsResult.duration;
    } catch (ttsErr) {
      console.error('[regenerateFrameMedia TTS] 失败', ttsErr);
    }

    // ⭐ 关键：HTML 模式必须使用项目选中的视觉风格，而不是默认风格
    const stylePreset = (await getStyleById(styleId)) || (await getDefaultStyle());
    const globalScript = outline.frames.map(f => `[#${f.index}] ${f.title}: ${f.narration}`).join('\n');
    const prevIdx = idx - 1;
    const previousFrame = prevIdx >= 0 ? outline.frames[prevIdx] : null;
    // 取前一个分镜已生成的 htmlCode（如果有），用于保持风格连续
    const previousHtml = previousFrame
      ? await getFrameHtml(projectId, previousFrame.id)
      : null;
    // 首帧 HTML 作为全局风格基准（当前帧不是首帧时才取）
    const firstFrame = outline.frames[0];
    const firstHtml =
      firstFrame && firstFrame.id !== frame.id
        ? await getFrameHtml(projectId, firstFrame.id)
        : null;

    const htmlCode = await generateFrameHtml({
      globalScript,
      stylePrompt: stylePreset.prompt,
      frame,
      previousHtml: previousHtml || null,
      firstHtml: firstHtml || null,
      durationSec: audioDuration,
    });
    patch.htmlCode = htmlCode;
  }

  // 3) 单帧 upsert
  await upsertFrame(projectId, frame.id, idx >= 0 ? idx : 0, patch);
}
