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
  AI_BASE_URL: process.env.AI_BASE_URL || '',
  AI_API_KEY: process.env.AI_API_KEY || '',
  AI_MODEL: process.env.AI_MODEL || 'gemini-3-flash-preview',
  TTS_VOICE: process.env.TTS_VOICE || 'nova',
  IMAGE_API_BASE_URL: process.env.IMAGE_API_BASE_URL || '',
  IMAGE_API_KEY: process.env.IMAGE_API_KEY || '',
  APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || 'AI 视频制作智能体',
};
