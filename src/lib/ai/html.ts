import { callAIJson } from './client';
import type { FrameOutline } from '@/types';

export const FRAME_HTML_SYSTEM = `你是一位网页动画视频设计工程师。你需要为视频的单个分镜设计一段 HTML 动画。

## 输入
- 全局脚本
- 视觉风格（用户选择或默认）
- 当前分镜的标题、旁白、画面提示词
- 上一分镜的 HTML 代码（用于保持视觉风格一致），首帧为"无"

## 输出要求
- 输出严格 JSON：{ "html": "完整 HTML 文档" }
- HTML 文档必须是完整可独立运行的（含 <!DOCTYPE html>）
- 用 HTML + CSS + JS（内联）实现动画；可用 SVG、Canvas
- 动画时长默认 3-8 秒，与旁白大致匹配
- ⭐ 关键内容（标题/正文/主体图形）必须在开场 1.5 秒内出现或开始出现，让观众第一时间看到重点
- ⭐ 任何单个元素的入场动画 delay 不得超过 2 秒；严禁出现 5 秒以上才淡入的关键文字/主体
- ⭐ 所有关键文字与主体图形在动画结束时应处于"可见、静止"状态，不得停在透明/未入场状态
- 文字要大（标题 ≥ 48px，正文 ≥ 24px），主色对比强
- 适配视频画面（16:9，宽 1280px，高 720px）
- 不要使用任何外部 CDN 或外部资源（除 inline）
- 不要使用 alert/prompt/confirm
- 动画应该自动循环（loop）或持续到结束时静止
- 风格保持与上一帧一致

## 严格 JSON 输出
{ "html": "<!DOCTYPE html>..." }
`;

export async function generateFrameHtml(opts: {
  globalScript: string;
  stylePrompt: string;
  frame: FrameOutline;
  previousHtml: string | null;
}): Promise<string> {
  const { globalScript, stylePrompt, frame, previousHtml } = opts;
  const userPrompt = `【全局脚本】\n${globalScript}\n\n【视觉风格】\n${stylePrompt}\n\n【当前分镜】\n标题：${frame.title}\n旁白：${frame.narration}\n画面提示：${frame.htmlPrompt || ''}\n\n【上一分镜 HTML（无则填"无"）】\n${previousHtml || '无'}\n\n请按系统提示词要求，输出 JSON：{ "html": "..." }`;

  const res = await callAIJson<{ html: string }>({
    system: FRAME_HTML_SYSTEM,
    user: userPrompt,
    temperature: 0.8,
    maxRetries: 2,
    maxTokens: 16000, // HTML 动画通常上万字符，避免输出被截断
  });
  const html = sanitizeHtml(res.html || '');
  if (!html.trim()) throw new Error('生成的 HTML 为空');
  return html;
}

/**
 * 清理 AI 返回的 HTML：
 * - 去掉外部资源引用
 * - 强制 sandbox 友好（移除 <base>、target=_blank、form 等）
 */
function sanitizeHtml(html: string): string {
  let cleaned = html;
  // 移除外部 <script src="..."> 和 <link rel="stylesheet" href="...">
  cleaned = cleaned.replace(/<script[^>]+src=["'][^"']*["'][^>]*>\s*<\/script>/gi, '');
  cleaned = cleaned.replace(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi, '');
  cleaned = cleaned.replace(/<img[^>]+src=["']https?:\/\/[^"']*["'][^>]*>/gi, ''); // 不允许外部图片
  cleaned = cleaned.replace(/<base[^>]*>/gi, '');
  return cleaned;
}
