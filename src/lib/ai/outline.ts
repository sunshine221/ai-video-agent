import { callAIJson } from './client';
import {
  OUTLINE_SYSTEM_IMAGE,
  OUTLINE_SYSTEM_HTML,
  buildOutlineEditSystem,
  normalizeOutline,
} from '@/lib/prompts/outline';
import { renderBriefForOutline } from './brief';
import type { CreativeBrief, Outline, ProjectType } from '@/types';

/**
 * 从“创作简报”派生大纲。
 *
 * 关键设计：
 * 1. 大纲**只从简报派生**，不再把上一版大纲（产物）喂回模型，避免主题漂移。
 * 2. 生成后对照简报做**确定性校验**（分镜数、时长），不符则带纠正反馈自动重试一次。
 */
export async function generateOutline(
  type: ProjectType,
  brief: CreativeBrief,
): Promise<Outline> {
  const system = type === 'image' ? OUTLINE_SYSTEM_IMAGE : OUTLINE_SYSTEM_HTML;
  const baseUser = buildOutlineUserPrompt(brief);

  // 第一次生成
  let outline = normalizeOutline(
    await callAIJson<Partial<Outline>>({ system, user: baseUser, temperature: 0.8, maxRetries: 1 }),
  );

  // 对照简报校验；不符则把问题作为纠正反馈，重试一次
  const issues = validateOutlineAgainstBrief(outline, brief);
  if (issues.length > 0) {
    const fixUser = `${baseUser}

【上一版不符合要求，请修正后重新输出】
${issues.map(i => `- ${i}`).join('\n')}`;
    outline = normalizeOutline(
      await callAIJson<Partial<Outline>>({ system, user: fixUser, temperature: 0.6, maxRetries: 1 }),
    );
  }

  return outline;
}

/**
 * 编辑大纲：一个通用能力覆盖增/删/改/重排/改数量等一切结构与文字编辑。
 *
 * - 没有当前大纲（首次创作）→ 直接走 generateOutline 从简报生成。
 * - 有当前大纲 → 把 简报 + 当前大纲 + 用户诉求交给 AI 改写整份大纲；
 *   靠提示词硬约束“只改用户要求的、其余（含 id）原样保留”，
 *   保留 id 让未改分镜的画面/音频不丢；新增分镜 id 置空由 normalizeOutline 补。
 * - 改写后同样对照简报做确定性校验，不符则带纠正反馈重试一次。
 */
export async function editOutline(opts: {
  type: ProjectType;
  brief: CreativeBrief;
  currentOutline: Outline | null;
  userRequest: string;
  conversationContext?: string;
}): Promise<Outline> {
  const { type, brief, currentOutline, userRequest, conversationContext } = opts;

  // 首次创作：没有可编辑的大纲，直接从简报生成
  if (!currentOutline || currentOutline.frames.length === 0) {
    return generateOutline(type, brief);
  }

  const system = buildOutlineEditSystem(type as 'image' | 'html');
  const baseUser = buildEditUserPrompt({ brief, currentOutline, userRequest, conversationContext });

  let outline = normalizeOutline(
    await callAIJson<Partial<Outline>>({ system, user: baseUser, temperature: 0.4, maxRetries: 1 }),
  );

  const issues = validateOutlineAgainstBrief(outline, brief);
  if (issues.length > 0) {
    const fixUser = `${baseUser}

【上一版不符合要求，请修正后重新输出（依然遵守：未改动分镜原样保留其 id）】
${issues.map(i => `- ${i}`).join('\n')}`;
    outline = normalizeOutline(
      await callAIJson<Partial<Outline>>({ system, user: fixUser, temperature: 0.3, maxRetries: 1 }),
    );
  }

  return outline;
}

function buildEditUserPrompt(opts: {
  brief: CreativeBrief;
  currentOutline: Outline;
  userRequest: string;
  conversationContext?: string;
}): string {
  const { brief, currentOutline, userRequest, conversationContext } = opts;
  const history = conversationContext ? `【对话历史上下文】\n${conversationContext}\n\n` : '';
  return `${history}【创作简报（主题/时长/数量等约束的事实来源）】
${renderBriefForOutline(brief)}

【当前完整大纲 JSON】
${JSON.stringify(currentOutline, null, 2)}

【用户本次修改要求】
${userRequest}

请按系统提示词，输出修改后的完整大纲 JSON。切记：用户没要求改的分镜（含其 id）原样保留，新增分镜 id 留空字符串。`;
}

function buildOutlineUserPrompt(brief: CreativeBrief): string {
  return `【创作简报（唯一事实来源，必须严格遵守）】
${renderBriefForOutline(brief)}

请严格按上述简报生成大纲：
- 主题必须紧扣「${brief.topic}」，不要替换成某个具体案例/定理/公式（除非简报里已明确点名）。
${brief.durationSec ? `- 总时长必须贴近 ${brief.durationSec} 秒，分镜数量与旁白长度都要据此裁剪。\n` : ''}${brief.targetFrameCount ? `- 分镜数量应为 ${brief.targetFrameCount} 个。\n` : ''}请输出大纲 JSON。`;
}

/**
 * 对照简报做确定性校验，返回不符合项的描述列表（空数组表示通过）。
 * 只校验可确定判定的硬指标（分镜数、时长），主题漂移靠提示词约束，不在此做 LLM 二次判断。
 */
export function validateOutlineAgainstBrief(outline: Outline, brief: CreativeBrief): string[] {
  const issues: string[] = [];

  if (brief.targetFrameCount && outline.frames.length !== brief.targetFrameCount) {
    issues.push(
      `分镜数量必须是 ${brief.targetFrameCount} 个，当前是 ${outline.frames.length} 个，请调整为 ${brief.targetFrameCount} 个。`,
    );
  }

  if (brief.durationSec && outline.totalDuration) {
    // 允许 ±40% 偏差；短视频尤其不能被撑长
    const target = brief.durationSec;
    const ratio = outline.totalDuration / target;
    if (ratio > 1.4 || ratio < 0.6) {
      issues.push(
        `总时长必须贴近 ${target} 秒，当前约 ${outline.totalDuration} 秒，请增减旁白/分镜使其接近 ${target} 秒。`,
      );
    }
  }

  return issues;
}
