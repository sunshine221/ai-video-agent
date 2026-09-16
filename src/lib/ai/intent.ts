import { callAITool } from './client';
import {
  INTENT_SYSTEM_PROMPT,
  INTENT_TOOLS,
  buildIntentUserPrompt,
  toolNameToAction,
} from '@/lib/prompts/intent';
import { prisma } from '@/lib/db';
import type { IntentResult, Outline } from '@/types';

/**
 * 意图分析（function-calling 版）
 *
 * 把工具集交给模型自行选择调用，而非硬分类输出 action 字符串。
 * 模型没调用任何工具时，用它的文本作为澄清内容，兜底为 clarify/unknown。
 */
export async function analyzeIntent(
  projectId: string,
  userInput: string,
): Promise<IntentResult> {
  const project = await prisma.project.findUnique({
    where: { uuid: projectId },
    select: { outline: true, type: true },
  });
  if (!project) throw new Error('项目不存在');

  const outline = project.outline as unknown as Outline | null;
  const frameTitles = outline?.frames.map(f => f.title) ?? [];

  const result = await callAITool({
    system: INTENT_SYSTEM_PROMPT,
    user: buildIntentUserPrompt({
      userInput,
      hasOutline: !!outline,
      frameCount: frameTitles.length,
      frameTitles,
    }),
    tools: INTENT_TOOLS,
    temperature: 0.2,
  });

  // 模型没调用任何工具：把它的文本当作澄清语，兜底为 clarify（无文本则 unknown）
  if (!result.toolName) {
    const text = result.text.trim();
    return text
      ? { action: 'clarify', reason: '模型未调用工具，返回澄清文本', params: { question: text } }
      : { action: 'unknown', reason: '模型未调用工具且无文本输出', params: {} };
  }

  const action = toolNameToAction(result.toolName);
  return { action, reason: `工具调用：${result.toolName}`, params: result.args };
}
