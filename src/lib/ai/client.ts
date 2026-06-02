import OpenAI from 'openai';
import { env } from '@/lib/env';

/**
 * AI 客户端（OpenAI 兼容协议）
 * 通过 env 中的 baseURL 指向中转站，便于切换模型。
 */
export const aiClient = new OpenAI({
  apiKey: env.AI_API_KEY,
  baseURL: env.AI_BASE_URL,
});

export const DEFAULT_MODEL = env.AI_MODEL;

/**
 * JSON 模式调用：要求 AI 返回严格 JSON
 */
export async function callAIJson<T = unknown>(opts: {
  system: string;
  user: string;
  model?: string;
  temperature?: number;
  maxRetries?: number;
}): Promise<T> {
  const { system, user, model = DEFAULT_MODEL, temperature = 0.7, maxRetries = 1 } = opts;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const completion = await aiClient.chat.completions.create({
        model,
        temperature,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });
      const text = completion.choices[0]?.message?.content;
      if (!text) throw new Error('AI 返回内容为空');
      return JSON.parse(text) as T;
    } catch (err) {
      lastError = err;
      console.error(`[callAIJson] attempt ${attempt + 1} failed:`, err);
      if (attempt < maxRetries) {
        // 下一次重试时把错误信息塞进 user prompt 引导 AI 自纠
        const tip = `\n\n【注意】上一次返回的 JSON 解析失败，错误信息：${(err as Error).message}。请严格按 JSON 规范返回，不要包含多余文本。`;
        return callAIJson<T>({ ...opts, user: user + tip, maxRetries: maxRetries - attempt - 1 });
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('AI 调用失败');
}

/**
 * 文本模式调用
 */
export async function callAIText(opts: {
  system: string;
  user: string;
  model?: string;
  temperature?: number;
}): Promise<string> {
  const { system, user, model = DEFAULT_MODEL, temperature = 0.7 } = opts;
  const completion = await aiClient.chat.completions.create({
    model,
    temperature,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  return completion.choices[0]?.message?.content || '';
}
