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
  maxTokens?: number;
}): Promise<T> {
  const { system, user, model = DEFAULT_MODEL, temperature = 0.7, maxRetries = 2, maxTokens } = opts;
  let lastError: unknown = null;
  // 每次重试都把错误信息累加到 user prompt，引导模型自纠
  let currentUser = user;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const completion = await aiClient.chat.completions.create({
        model,
        temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: currentUser },
        ],
        // 关闭 qwen3 思考模式：生成 HTML 属确定性输出，无需深度推理。
        // 开启思考会烧掉大量 reasoning token（挤占 max_tokens 导致截断）且极慢。
        enable_thinking: false,
      } as any);
      const choice = completion.choices[0];
      const text = choice?.message?.content;
      if (!text) throw new Error('AI 返回内容为空');
      // 输出被 max_tokens 截断时，JSON 一定不完整，直接判失败以触发重试
      if (choice?.finish_reason === 'length') {
        throw new Error('AI 输出被长度限制截断，JSON 不完整');
      }
      return JSON.parse(text) as T;
    } catch (err) {
      lastError = err;
      console.error(`[callAIJson] attempt ${attempt + 1}/${maxRetries + 1} failed:`, (err as Error).message);
      // 下一次重试时把错误信息塞进 user prompt 引导 AI 自纠
      currentUser = `${user}\n\n【注意】上一次返回的 JSON 解析失败，错误信息：${(err as Error).message}。请严格按 JSON 规范返回完整内容，不要包含多余文本，不要截断。`;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('AI 调用失败');
}

export interface AIToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface AIToolCallResult {
  /** 模型选择调用的工具名；为 null 表示没调用任何工具（模型只回了文本） */
  toolName: string | null;
  /** 工具入参（已解析）；无工具调用时为空对象 */
  args: Record<string, unknown>;
  /** 模型的文本输出（无工具调用时作为兜底内容） */
  text: string;
}

/**
 * Function calling 调用：把一组工具交给模型，让它自己决定调哪个、传什么参数。
 *
 * 相比“让模型输出一个 action 字符串”的硬分类，工具调用用模型原生的推理能力去匹配，
 * 对任意自然语言措辞更鲁棒；模型信息不足时可以选择不调工具、只回文本（走 clarify/unknown 兜底）。
 */
export async function callAITool(opts: {
  system: string;
  user: string;
  tools: AIToolDef[];
  model?: string;
  temperature?: number;
}): Promise<AIToolCallResult> {
  const { system, user, tools, model = DEFAULT_MODEL, temperature = 0.2 } = opts;

  const completion = await aiClient.chat.completions.create({
    model,
    temperature,
    tools: tools.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    })),
    // 强制模型必须从工具集里选一个调用。部分模型（如 qwen3.x-flash）在 'auto'
    // 下倾向于直接回文本、不调工具，导致意图分析永远兜底为 clarify，创作流程走不通。
    // 意图工具集已覆盖澄清(ask_user)/不支持(not_supported)，强制调用不会误伤兜底。
    tool_choice: 'required',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    enable_thinking: false,
  } as any);

  const message = completion.choices[0]?.message;
  const toolCall = message?.tool_calls?.[0];
  const text = message?.content || '';

  if (!toolCall || toolCall.type !== 'function') {
    return { toolName: null, args: {}, text };
  }

  let args: Record<string, unknown> = {};
  try {
    args = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
  } catch {
    args = {};
  }
  return { toolName: toolCall.function.name, args, text };
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
