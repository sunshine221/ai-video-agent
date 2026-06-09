import { callAIJson } from './client';
import { OUTLINE_SYSTEM_IMAGE, OUTLINE_SYSTEM_HTML, normalizeOutline } from '@/lib/prompts/outline';
import type { FrameOutline, Outline, ProjectType } from '@/types';

export async function generateOutline(
  type: ProjectType,
  userInput: string,
  opts?: {
    conversationContext?: string;
    currentOutline?: Outline | null;
  },
): Promise<Outline> {
  const system = type === 'image' ? OUTLINE_SYSTEM_IMAGE : OUTLINE_SYSTEM_HTML;
  const promptParts = [
    opts?.conversationContext ? `【对话历史上下文】\n${opts.conversationContext}` : '',
    opts?.currentOutline ? `【当前已有大纲】\n${summarizeOutline(opts.currentOutline)}` : '',
    `【本次用户要求】\n${userInput}`,
  ].filter(Boolean);
  const raw = await callAIJson<Partial<Outline>>({
    system,
    user: promptParts.join('\n\n'),
    temperature: 0.8,
    maxRetries: 1,
  });
  return normalizeOutline(raw);
}

function summarizeOutline(outline: Outline): string {
  return outline.frames
    .map((frame: FrameOutline) => `#${frame.index} ${frame.title}: ${frame.narration}`)
    .join('\n');
}
