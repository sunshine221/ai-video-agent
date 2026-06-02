import { callAIJson } from './client';
import { OUTLINE_SYSTEM_IMAGE, OUTLINE_SYSTEM_HTML, normalizeOutline } from '@/lib/prompts/outline';
import type { Outline, ProjectType } from '@/types';

export async function generateOutline(
  type: ProjectType,
  userInput: string,
): Promise<Outline> {
  const system = type === 'image' ? OUTLINE_SYSTEM_IMAGE : OUTLINE_SYSTEM_HTML;
  const raw = await callAIJson<Partial<Outline>>({
    system,
    user: userInput,
    temperature: 0.8,
    maxRetries: 1,
  });
  return normalizeOutline(raw);
}
