/**
 * 创作简报（Creative Brief）维护层
 *
 * 简报是项目的“唯一事实来源”：只记录用户到底想要什么（主题/时长/分镜数/基调/约束），
 * 与生成产物（outline/frame）解耦。每轮对话增量更新它，大纲一律从它派生，
 * 从根上消除“主题漂移”和“重新生成时被旧产物带偏”的问题。
 */

import { callAIJson } from './client';
import type { CreativeBrief } from '@/types';

const BRIEF_SYSTEM_PROMPT = `你是一个视频创作智能体的“需求管理器”。你的唯一职责：把用户的最新一句话，合并进一份已有的“创作简报(JSON)”，输出更新后的完整简报。

## 简报字段
{
  "topic": "视频主题（必填，尽量贴合用户原话；宽泛主题就保持宽泛，不要自作主张替换成某个具体案例/定理/公式）",
  "durationSec": 用户明确说的时长秒数（数字；用户没说就沿用旧值或省略）,
  "targetFrameCount": 用户明确要的分镜数（数字；用户没说就沿用旧值或省略）,
  "tone": "风格基调，如 极简科普 / 活泼 / 严肃（用户没说就沿用旧值或省略）",
  "audience": "目标受众（可省略）",
  "constraints": ["其他硬约束，字符串数组，可为空"]
}

## 合并规则（重要）
- **增量合并**：用户这次只提到某几项，就只更新那几项，其余字段保持旧简报的值不变。
- **不要漂移主题**：如果用户没有明确要求换主题，topic 保持不变。用户说“主题应该是X”才改成 X。
- **宽泛主题保持宽泛**：例如用户说“数学方程”，topic 就是“数学方程”这一通用概念；**禁止**把它具体化成“勾股定理”等某个特例。若担心生成时被具体化，可在 constraints 里加一条“讲通用概念，不要替换成某个具体定理/公式实例”。
- **时长/分镜数以用户明说的为准**：用户说“15秒”“2个分镜”就写进 durationSec / targetFrameCount；用户没提就别乱填。
- topic 永远不能为空；若旧简报为空且用户这次也没给主题，就根据用户这句话尽量提炼一个贴切的主题。

## 输出
- 只输出更新后的完整简报 JSON，不要任何多余文字。`;

/**
 * 把用户最新输入合并进旧简报，返回更新后的简报。
 * @param current 旧简报（可为 null，表示项目还没有简报）
 * @param userInput 用户最新一句话
 */
export async function updateBrief(
  current: CreativeBrief | null,
  userInput: string,
): Promise<CreativeBrief> {
  const user = `【已有简报】\n${current ? JSON.stringify(current, null, 2) : '（暂无，请新建）'}\n\n【用户最新输入】\n"${userInput}"\n\n请按规则输出更新后的完整简报 JSON。`;

  const raw = await callAIJson<Partial<CreativeBrief>>({
    system: BRIEF_SYSTEM_PROMPT,
    user,
    temperature: 0.2,
    maxRetries: 1,
  });

  return normalizeBrief(raw, current, userInput);
}

/** 补齐/兜底，保证 topic 一定有值、constraints 一定是数组 */
export function normalizeBrief(
  raw: Partial<CreativeBrief> | null,
  fallback: CreativeBrief | null,
  userInput: string,
): CreativeBrief {
  const topic =
    (raw?.topic && String(raw.topic).trim()) ||
    fallback?.topic ||
    userInput.trim();

  const constraints = Array.isArray(raw?.constraints)
    ? raw!.constraints!.filter(c => typeof c === 'string' && c.trim())
    : fallback?.constraints ?? [];

  return {
    topic,
    durationSec:
      typeof raw?.durationSec === 'number' ? raw.durationSec : fallback?.durationSec,
    targetFrameCount:
      typeof raw?.targetFrameCount === 'number'
        ? raw.targetFrameCount
        : fallback?.targetFrameCount,
    tone: raw?.tone ?? fallback?.tone,
    audience: raw?.audience ?? fallback?.audience,
    constraints,
  };
}

/** 把简报渲染成一段供大纲生成使用的约束文本 */
export function renderBriefForOutline(brief: CreativeBrief): string {
  const lines: string[] = [`主题：${brief.topic}`];
  if (brief.durationSec) lines.push(`目标时长：${brief.durationSec} 秒（必须严格贴近）`);
  if (brief.targetFrameCount) lines.push(`目标分镜数：${brief.targetFrameCount} 个`);
  if (brief.tone) lines.push(`风格基调：${brief.tone}`);
  if (brief.audience) lines.push(`目标受众：${brief.audience}`);
  if (brief.constraints && brief.constraints.length) {
    lines.push(`硬约束：\n${brief.constraints.map(c => `  - ${c}`).join('\n')}`);
  }
  return lines.join('\n');
}
