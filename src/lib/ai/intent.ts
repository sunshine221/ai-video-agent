import { callAIJson } from './client';
import { INTENT_SYSTEM_PROMPT, buildIntentUserPrompt } from '@/lib/prompts/intent';
import { prisma } from '@/lib/db';
import type { IntentResult, Outline, ProjectDetail } from '@/types';

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

  const result = await callAIJson<IntentResult>({
    system: INTENT_SYSTEM_PROMPT,
    user: buildIntentUserPrompt({
      userInput,
      hasOutline: !!outline,
      frameCount: frameTitles.length,
      frameTitles,
    }),
    temperature: 0.3,
    maxRetries: 1,
  });

  // 校验
  if (!result || !result.action) {
    throw new Error('AI 返回格式错误：缺少 action 字段');
  }
  return result;
}
