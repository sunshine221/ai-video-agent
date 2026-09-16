/**
 * 分镜修改/新增的 AI 能力
 *
 * 提供：
 * - modifyFrameContent()    修改某个分镜的旁白/画面提示词
 * - generateNewFrameContent() 生成一个新分镜（标题/旁白/画面提示词）
 *
 * 这两个函数都只动 outline 层面的内容，不直接生成画面/声音。
 * 画面/声音由调用方通过 /api/frames/{image,html} + /api/tts 触发。
 */

import { v4 as uuid } from 'uuid';
import { callAIJson } from './client';
import type { FrameOutline, Outline, ProjectType } from '@/types';

// =============================================================================
// 修改分镜内容
// =============================================================================

const MODIFY_FRAME_SYSTEM = `你是一位视频脚本编辑。你需要根据用户的修改需求，调整一个已有分镜的"旁白"和"画面提示词"。

## 输入
- 完整脚本（让 AI 理解上下文）
- 当前分镜的标题/旁白/画面提示词
- 上一分镜、下一分镜的标题/旁白（保证衔接顺畅）
- 用户的修改需求

## ⭐ 旁白与画面描述的联动规则（最高优先级，务必遵守）
画面（画面提示词 / 画面设计）是对旁白内容的可视化呈现，**旁白是内容来源，画面依附于旁白**。据此：
- **本次修改改动了旁白** → 画面描述**必须**随新旁白重新设计，让画面表达的信息与新旁白一致；**禁止**沿用与旧旁白对应的旧画面描述。
- **本次修改只涉及画面（画面提示词 / 画面设计）、旁白未变** → 旁白**必须原样返回、一字不改**，只调整画面描述。
- 判断依据是用户这次的修改需求指向什么：指向旁白/内容/文案的，视为旁白改动；只指向画面/视觉/布局/动效的，视为画面改动。

## 输出要求
- 输出严格 JSON：
{
  "title": "调整后的分镜标题（不超过 15 字）",
  "narration": "调整后的旁白（中文，15-60 字）",
  "imagePrompt": "调整后的画面提示词（image 模式：英文 30-100 词，包含全局画风前缀）",
  "visualSummary": "html 模式：这一镜的核心视觉主张（一句话）",
  "layout": "html 模式：空间构图（主体位置/主次/留白，不写颜色）",
  "animation": "html 模式：动作与分步节奏（不写死秒数、不写颜色）",
  "transition": "html 模式：如何衔接下一镜"
}
- 只输出当前模式需要的字段：image 模式必填 imagePrompt；html 模式必填 visualSummary/layout/animation/transition 四个字段（不要输出 imagePrompt）
- html 模式的四个字段禁止出现任何颜色/背景/配色/材质/色调描述，也不要写死动画秒数（风格由全局模板统一）
- 修改后的内容要和上下文（上一镜/下一镜/整体脚本）自然衔接
- 不要任何 JSON 之外的内容
`;

export async function modifyFrameContent(opts: {
  type: ProjectType;
  outline: Outline;
  frameIndex: number;       // 0-based 索引
  userModification: string;
  conversationContext?: string;
}): Promise<Partial<FrameOutline>> {
  const { type, outline, frameIndex, userModification, conversationContext } = opts;
  const frame = outline.frames[frameIndex];
  if (!frame) throw new Error(`分镜索引越界: ${frameIndex}`);

  const prev = frameIndex > 0 ? outline.frames[frameIndex - 1] : null;
  const next = frameIndex < outline.frames.length - 1 ? outline.frames[frameIndex + 1] : null;

  const globalScript = outline.frames
    .map(f => `[#${f.index}] ${f.title}: ${f.narration}`)
    .join('\n');
  const stylePrefix = type === 'image' && outline.globalStyle
    ? `[全局画风] ${outline.globalStyle}\n\n`
    : '';
  const historyBlock = conversationContext
    ? `【对话历史上下文】\n${conversationContext}\n\n`
    : '';

  const userPrompt = `${stylePrefix}${historyBlock}【完整脚本】
${globalScript}

【待修改分镜 (#${frame.index})】
标题：${frame.title}
旁白：${frame.narration}
${type === 'image'
    ? `画面提示词：${frame.imagePrompt || ''}`
    : `视觉主张：${frame.visualSummary || ''}\n布局构图：${frame.layout || ''}\n动作与分步：${frame.animation || ''}\n与下一镜衔接：${frame.transition || ''}`}

【上一分镜】${prev ? `#${prev.index} ${prev.title}：${prev.narration}` : '（无）'}
【下一分镜】${next ? `#${next.index} ${next.title}：${next.narration}` : '（无）'}

【用户修改需求】
${userModification || '（无明确修改要求，请基于上下文做合理润色）'}

请按系统提示词要求，输出调整后的 JSON。`;

  return callAIJson<Partial<FrameOutline>>({
    system: MODIFY_FRAME_SYSTEM,
    user: userPrompt,
    temperature: 0.6,
    maxRetries: 1,
  });
}

// =============================================================================
// 新增分镜内容
// =============================================================================

const ADD_FRAME_SYSTEM = `你是一位视频脚本编辑。你需要根据当前视频的脚本和已有大纲，并结合用户的需求，创作一个**新的分镜**。

## 输入
- 当前视频的完整脚本（逐字稿 + 分镜大纲）
- 用户的新分镜需求（可能指定了位置，也可能只描述了内容）
- 用户指定的插入位置 afterIndex（1-based，表示"在第 N 镜之后插入"；0 表示未指定）

## 输出要求
- 输出严格 JSON：
{
  "title": "新分镜标题（不超过 15 字）",
  "narration": "新分镜旁白（中文，15-60 字）",
  "imagePrompt": "画面提示词（image 模式：英文 30-100 词，包含全局画风前缀）",
  "visualSummary": "html 模式：这一镜的核心视觉主张（一句话）",
  "layout": "html 模式：空间构图（主体位置/主次/留白，不写颜色）",
  "animation": "html 模式：动作与分步节奏（不写死秒数、不写颜色）",
  "transition": "html 模式：如何衔接下一镜",
  "afterIndex": 在第几镜之后插入（1-based；如果 afterIndex=0 则 AI 自己决定最合适的位置）
}
- 旁白和画面设计要和上下文衔接自然，不要重复已有分镜的内容
- image 模式必填 imagePrompt；html 模式必填 visualSummary/layout/animation/transition（不要输出 imagePrompt）
- html 模式的四个字段禁止出现任何颜色/背景/配色/材质/色调描述，也不要写死动画秒数
- 保持与全局画风/视觉风格一致
- 不要任何 JSON 之外的内容
`;

export interface NewFrameContent {
  title: string;
  narration: string;
  imagePrompt?: string;
  visualSummary?: string;
  layout?: string;
  animation?: string;
  transition?: string;
  afterIndex: number;       // 1-based，AI 决定时也回填
}

export async function generateNewFrameContent(opts: {
  type: ProjectType;
  outline: Outline;
  userHint: string;
  afterIndex: number;       // 1-based；0 表示未指定
  conversationContext?: string;
}): Promise<NewFrameContent> {
  const { type, outline, userHint, afterIndex, conversationContext } = opts;

  const globalScript = outline.frames
    .map(f => `[#${f.index}] ${f.title}: ${f.narration}`)
    .join('\n');
  const stylePrefix = type === 'image' && outline.globalStyle
    ? `[全局画风] ${outline.globalStyle}\n\n`
    : '';
  const historyBlock = conversationContext
    ? `【对话历史上下文】\n${conversationContext}\n\n`
    : '';

  const userPrompt = `${stylePrefix}${historyBlock}【当前视频脚本】
${globalScript}

【已有分镜大纲】
${outline.frames.map(f => `#${f.index} ${f.title}: ${f.narration}`).join('\n')}

【用户指定插入位置】在第 ${afterIndex === 0 ? '?（未指定，由你决定）' : afterIndex} 镜之后

【用户对新分镜的需求】
${userHint || '（未明确，由你根据上下文判断合适的内容）'}

请按系统提示词要求，输出新分镜的 JSON（务必回填 afterIndex 字段）。`;

  return callAIJson<NewFrameContent>({
    system: ADD_FRAME_SYSTEM,
    user: userPrompt,
    temperature: 0.7,
    maxRetries: 1,
  });
}

// =============================================================================
// 大纲操作工具
// =============================================================================

/**
 * 在 outline.frames 的指定位置之后插入新分镜（1-based afterIndex）
 * - 同步重排 index（1-based 顺序号）
 * - 返回新的 outline 和插入位置在 outline.frames 中的 0-based 索引
 */
export function insertFrameIntoOutline(
  outline: Outline,
  newFrame: FrameOutline,
  afterIndex: number,     // 1-based
): { outline: Outline; insertAt: number } {
  // 1-based afterIndex → 0-based 插入点（在第 N 镜之后 = 插在 0-based 位置 N）
  // 边界：afterIndex=0 → 插到最前面；afterIndex>=total → 插到最后面
  const total = outline.frames.length;
  const insertAt = Math.max(0, Math.min(afterIndex, total));

  const newId = newFrame.id || uuid();
  const newFrames: FrameOutline[] = [
    ...outline.frames.slice(0, insertAt),
    { ...newFrame, id: newId },
    ...outline.frames.slice(insertAt),
  ].map((f, i) => ({ ...f, index: i + 1 }));

  return {
    outline: { ...outline, frames: newFrames },
    insertAt,
  };
}

/**
 * 重排 videoSource.frames 使其与 outline.frames 对齐
 * - 如果 outline 多了/少了帧，对应位置补 {id} 或 删除
 */
export function realignVideoSource(
  outline: Outline,
  videoSource: { frames: Array<{ id: string; [k: string]: unknown }> },
): typeof videoSource {
  const oldById = new Map(videoSource.frames.map(f => [f.id, f]));
  const newFrames = outline.frames.map(f => {
    const existing = oldById.get(f.id);
    return existing ? { ...existing } : { id: f.id };
  });
  return { frames: newFrames };
}
