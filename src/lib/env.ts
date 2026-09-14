/**
 * 环境变量集中校验与导出。
 * 启动时调用 ensureEnv()，缺失关键变量时给出友好提示。
 */
export function ensureEnv(): { ok: boolean; missing: string[] } {
  const required = ['DATABASE_URL', 'AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL'] as const;
  const missing: string[] = [];
  for (const key of required) {
    if (!process.env[key] || process.env[key]?.startsWith('"')) {
      missing.push(key);
    }
  }
  return { ok: missing.length === 0, missing };
}

export const env = {
  DATABASE_URL: process.env.DATABASE_URL || '',

  // 文本模型（OpenAI 兼容协议）
  AI_BASE_URL: process.env.AI_BASE_URL || '',
  AI_API_KEY: process.env.AI_API_KEY || '',
  AI_MODEL: process.env.AI_MODEL || 'gemini-3-flash-preview',

  // 语音 TTS —— provider 决定接口风格，其余参数均可通过 env 切换，不在代码里硬编码
  // provider: 'openai'   OpenAI 兼容 /audio/speech（如中转站的 qwen3-tts-flash、gpt-4o-mini-tts）
  //           'dashscope' 阿里云百炼原生 multimodal-generation（qwen3-tts-flash、qwen-audio-3.0-tts-plus）
  TTS_PROVIDER: process.env.TTS_PROVIDER || 'openai',
  TTS_MODEL: process.env.TTS_MODEL || 'qwen3-tts-flash',
  TTS_VOICE: process.env.TTS_VOICE || 'nova',
  // base/key 缺省回退到 AI_*，方便共用同一账号
  TTS_BASE_URL: process.env.TTS_BASE_URL || process.env.AI_BASE_URL || '',
  TTS_API_KEY: process.env.TTS_API_KEY || process.env.AI_API_KEY || '',

  // 图片 —— provider 决定接口风格
  // provider: 'evolink'   evolink.ai 两阶段任务（提交 -> 轮询）
  //           'dashscope' 阿里云百炼原生 multimodal-generation 同步生图（z-image-turbo）
  IMAGE_PROVIDER: process.env.IMAGE_PROVIDER || 'evolink',
  IMAGE_MODEL: process.env.IMAGE_MODEL || 'z-image-turbo',
  IMAGE_SIZE: process.env.IMAGE_SIZE || '16:9',
  IMAGE_API_BASE_URL: process.env.IMAGE_API_BASE_URL || '',
  IMAGE_API_KEY: process.env.IMAGE_API_KEY || '',

  APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || 'AI 视频制作智能体',
};
