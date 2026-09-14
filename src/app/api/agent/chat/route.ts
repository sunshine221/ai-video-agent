import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { analyzeIntent } from '@/lib/ai/intent';
import { generateOutline } from '@/lib/ai/outline';
import {
  modifyFrameContent,
  generateNewFrameContent,
  insertFrameIntoOutline,
} from '@/lib/ai/frame-ops';
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
import type {
  IntentResult,
  ProjectDetail,
  Outline,
  VideoSource,
  FrameOutline,
  ProjectType,
} from '@/types';

const schema = z.object({
  projectId: z.string().uuid(),
  content: z.string().min(1).max(2000),
});

const RECENT_HISTORY_ROUNDS = 3;

/**
 * POST /api/agent/chat
 * Agent 入口：接收用户提示词，意图分析后路由到具体能力。
 *
 * 路由：
 * - generate_outline / regenerate_outline → 生成新大纲
 * - regenerate_frame → 修改某个分镜的内容 + 重新生成画面/声音
 * - add_frame → 生成新分镜 + 插入 + 重新生成画面/声音
 * - delete_frame → 占位（暂未实现）
 * - unknown → 友好提示
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: '参数错误' }, { status: 400 });
    }
    const { projectId, content } = parsed.data;

    const project = await prisma.project.findUnique({ where: { uuid: projectId } });
    if (!project) return NextResponse.json({ error: '项目不存在' }, { status: 404 });

    // 1) 写入用户消息
    const userMessage = await prisma.message.create({
      data: {
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
    let projectUpdate: Partial<{ title: string; outline: Outline }> = {};
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
      case 'generate_outline':
      case 'regenerate_outline': {
        const outline = await generateOutline(project.type as 'image' | 'html', content, {
          conversationContext: intent.action === 'regenerate_outline' ? conversationContext : undefined,
          currentOutline: intent.action === 'regenerate_outline'
            ? ((project.outline as unknown as Outline) ?? null)
            : null,
        });
        projectUpdate.outline = outline;
        if (intent.action === 'generate_outline' && !project.outline) {
          projectUpdate.title = outline.title;
        }
        // 大纲重建：清掉旧分镜产物、重新对齐（新大纲的帧尚无产物）
        outlineToSync = outline;
        assistantContent = `已为您生成大纲《${outline.title}》，共 ${outline.frames.length} 个分镜。`;
        assistantMetadata = { kind: 'outline', outline };
        break;
      }

      case 'regenerate_frame': {
        const result = await handleRegenerateFrame({
          projectId,
          projectType: project.type as ProjectType,
          styleId: project.styleId,
          currentOutline: (project.outline as unknown as Outline) ?? null,
          params: intent.params,
          conversationContext,
        });
        if (result.outline) projectUpdate.outline = result.outline;
        assistantContent = result.message;
        break;
      }

      case 'add_frame': {
        const result = await handleAddFrame({
          projectId,
          projectType: project.type as ProjectType,
          styleId: project.styleId,
          currentOutline: (project.outline as unknown as Outline) ?? null,
          params: intent.params,
          userHint: content,
          conversationContext,
        });
        if (result.outline) projectUpdate.outline = result.outline;
        assistantContent = result.message;
        if (result.outline) {
          assistantMetadata = { kind: 'outline', outline: result.outline };
        }
        break;
      }

      case 'delete_frame':
        assistantContent = '删除分镜功能开发中，您可以先让我"重新生成大纲"再选。';
        break;

      default:
        assistantContent = `抱歉，我暂时还不理解您的指令。\n\n我能做的：\n• 创作新视频（输入主题即可）\n• 重新生成大纲\n• 修改某个分镜（"第 3 镜的旁白里加上年份"）\n• 新增分镜（"在第 2 镜后面加一个分镜讲讲爱因斯坦"）\n\n请试试："做一个 3 分钟介绍黑洞的视频"`;
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

  // 1-based frameIndex → 0-based
  const frameIndex1 = Number(params.frameIndex) || 0;
  const frameIndex0 = frameIndex1 - 1;
  if (frameIndex0 < 0 || frameIndex0 >= currentOutline.frames.length) {
    return { message: `分镜编号 ${frameIndex1} 不存在（当前共 ${currentOutline.frames.length} 个分镜）。` };
  }

  const targetFrame = currentOutline.frames[frameIndex0];
  const modification = String(params.modification || '').trim();

  // 1) AI 修改分镜内容（narration / prompts）
  let updated: Partial<FrameOutline> = {};
  try {
    updated = await modifyFrameContent({
      type: projectType,
      outline: currentOutline,
      frameIndex: frameIndex0,
      userModification: modification,
      conversationContext,
    });
  } catch (err) {
    console.error('[modifyFrameContent] 失败', err);
    return { message: `AI 修改分镜内容失败：${(err as Error).message}` };
  }

  const newFrames = currentOutline.frames.map((f, i) =>
    i === frameIndex0
      ? {
          ...f,
          title: updated.title || f.title,
          narration: updated.narration || f.narration,
          imagePrompt: projectType === 'image' ? (updated.imagePrompt || f.imagePrompt) : f.imagePrompt,
          htmlPrompt: projectType === 'html' ? (updated.htmlPrompt || f.htmlPrompt) : f.htmlPrompt,
        }
      : f,
  );
  const newOutline: Outline = { ...currentOutline, frames: newFrames };

  // 2) 先清空该分镜的旧产物（让生成逻辑走"新生成"分支）
  await resetFrameMedia(projectId, targetFrame.id);

  try {
    await regenerateFrameMedia({
      projectId,
      projectType,
      styleId,
      outline: newOutline,
      frame: newFrames[frameIndex0],
    });
    return {
      outline: newOutline,
      message: `已修改并重新生成分镜 #${frameIndex1}《${newFrames[frameIndex0].title}》的画面和旁白。`,
    };
  } catch (err) {
    console.error('[regenerateFrameMedia] 失败', err);
    // 即便画面生成失败，也保留已修改的大纲
    return {
      outline: newOutline,
      message: `已修改分镜内容，但画面/旁白生成失败：${(err as Error).message}`,
    };
  }
}

// =============================================================================
// 内部：新增分镜
// =============================================================================

async function handleAddFrame(opts: {
  projectId: string;
  projectType: ProjectType;
  styleId: string | null;
  currentOutline: Outline | null;
  params: Record<string, unknown>;
  userHint: string;
  conversationContext: string;
}): Promise<{
  outline?: Outline;
  message: string;
}> {
  const { projectId, projectType, styleId, currentOutline, params, userHint, conversationContext } = opts;

  if (!currentOutline) {
    return { message: '当前项目还没有大纲，请先生成大纲。' };
  }

  const afterIndex1 = Math.max(0, Number(params.afterIndex) || 0);

  // 1) AI 生成新分镜内容
  let newContent;
  try {
    newContent = await generateNewFrameContent({
      type: projectType,
      outline: currentOutline,
      userHint: userHint,
      afterIndex: afterIndex1,
      conversationContext,
    });
  } catch (err) {
    console.error('[generateNewFrameContent] 失败', err);
    return { message: `AI 生成新分镜内容失败：${(err as Error).message}` };
  }

  // AI 可能会回填更合适的 afterIndex
  const finalAfterIndex1 = newContent.afterIndex > 0 ? newContent.afterIndex : afterIndex1;

  // 2) 构造新分镜
  const newFrame: FrameOutline = {
    id: crypto.randomUUID(),
    index: 0, // 会在 insertFrameIntoOutline 中重排
    title: newContent.title,
    narration: newContent.narration,
    imagePrompt: projectType === 'image' ? newContent.imagePrompt : undefined,
    htmlPrompt: projectType === 'html' ? newContent.htmlPrompt : undefined,
  };

  // 3) 插入到大纲
  const { outline: newOutline, insertAt } = insertFrameIntoOutline(currentOutline, newFrame, finalAfterIndex1);

  // 4) 写库：先落新大纲，再同步 frame 表顺序（新帧此时尚无产物行）
  await prisma.project.update({
    where: { uuid: projectId },
    data: { outline: newOutline as any },
  });
  await syncFramesToOutline(projectId, newOutline);

  // 5) 生成新分镜的画面 / 旁白
  const posLabel = insertAt + 1; // 1-based
  const afterLabel = finalAfterIndex1 > 0 ? `第 ${finalAfterIndex1} 镜之后` : '合适的位置';
  try {
    await regenerateFrameMedia({
      projectId,
      projectType,
      styleId,
      outline: newOutline,
      frame: newOutline.frames[insertAt],
    });
    return {
      outline: newOutline,
      message: `已在${afterLabel}插入新分镜 #${posLabel}《${newFrame.title}》，并完成画面和旁白生成。`,
    };
  } catch (err) {
    console.error('[addFrame] media 失败', err);
    return {
      outline: newOutline,
      message: `已插入新分镜 #${posLabel}《${newFrame.title}》，但画面/旁白生成失败：${(err as Error).message}`,
    };
  }
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

  // 1) 画面
  if (projectType === 'image') {
    const imgResult = await generateAndSaveImage({
      projectId,
      frameId: frame.id,
      prompt: frame.imagePrompt || frame.title,
    });
    patch.imagePath = imgResult.url;
  } else {
    // ⭐ 关键：HTML 模式必须使用项目选中的视觉风格，而不是默认风格
    const stylePreset = getStyleById(styleId) || getDefaultStyle();
    const globalScript = outline.frames.map(f => `[#${f.index}] ${f.title}: ${f.narration}`).join('\n');
    const prevIdx = idx - 1;
    const previousFrame = prevIdx >= 0 ? outline.frames[prevIdx] : null;
    // 取前一个分镜已生成的 htmlCode（如果有），用于保持风格连续
    const previousHtml = previousFrame
      ? await getFrameHtml(projectId, previousFrame.id)
      : null;

    const htmlCode = await generateFrameHtml({
      globalScript,
      stylePrompt: stylePreset.prompt,
      frame,
      previousHtml: previousHtml || null,
    });
    patch.htmlCode = htmlCode;
  }

  // 2) TTS
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

  // 3) 单帧 upsert
  await upsertFrame(projectId, frame.id, idx >= 0 ? idx : 0, patch);
}
