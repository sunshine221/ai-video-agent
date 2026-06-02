import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { env } from '@/lib/env';

/**
 * TTS 语音生成。
 *
 * 关键：用原生 fetch + 多 Accept 头兼容各种中转站。
 *  - OpenAI 官方要求 Accept: audio/mpeg
 *  - 部分中转站（如 qwen3-tts-flash）严格只接受 application/json 这种标准类型
 *  - 用 application/json 优先 + audio/mpeg + 通配，三种 header 一起发
 *
 * 实际响应可能是 mp3 或 wav（看 content-type 或文件头 magic bytes），
 * 按实际格式存为对应扩展名（WAV→.wav，MP3→.mp3），浏览器 audio 元素自动识别。
 *
 * 支持的模型（取决于中转站）：
 * - gpt-4o-mini-tts  (OpenAI 官方 TTS，音色: alloy/ash/ballad/coral/echo/sage/shimmer/verse/marin/cedar/nova)
 * - qwen3-tts-flash   (通义千问 TTS，音色: Cherry/Serena/Ethan 等中文音色)
 */
export async function generateAndSaveTTS(opts: {
  projectId: string;
  frameId: string;
  text: string;
  voice?: string;
  abortSignal?: AbortSignal;
  model?: string;
}): Promise<{ url: string; duration: number; format: 'mp3' | 'wav' }> {
  const {
    projectId,
    frameId,
    text,
    voice = env.TTS_VOICE,
    abortSignal,
    model = process.env.TTS_MODEL || 'qwen3-tts-flash',
  } = opts;
  if (!text?.trim()) throw new Error('TTS 文本为空');
  if (!env.AI_BASE_URL) throw new Error('AI_BASE_URL 未配置');
  if (!env.AI_API_KEY) throw new Error('AI_API_KEY 未配置');

  const baseUrl = env.AI_BASE_URL.replace(/\/+$/, '');

  // 兼容两种中转站的多 Accept 头
  const response = await fetch(`${baseUrl}/audio/speech`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.AI_API_KEY}`,
      accept: 'application/json, audio/mpeg;q=0.9, */*;q=0.5',
    },
    body: JSON.stringify({
      model,
      voice,
      input: text,
      response_format: 'mp3',
    }),
    signal: abortSignal,
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`TTS 请求失败 ${response.status}: ${txt.slice(0, 500)}`);
  }

  // 检查返回内容
  const contentType = response.headers.get('content-type') || '';

  // 1) 如果看起来是 JSON 且 body 长度小，可能是错误 JSON
  if (contentType.startsWith('application/json')) {
    const txt = await response.text();
    // 试着解析为 JSON，看是不是错误
    try {
      const json = JSON.parse(txt);
      // 真正的 JSON 错误
      if (json.error || json.code) {
        throw new Error(`TTS 错误: ${json.error?.message || json.message || JSON.stringify(json).slice(0, 300)}`);
      }
      // JSON 里可能含 base64 音频
      if (json.audio || json.data || json.url) {
        const b64 = json.audio || json.data;
        if (typeof b64 === 'string') {
          const buf = Buffer.from(b64, 'base64');
          if (buf.length > 0) {
            return saveAndReturn({ buf, projectId, frameId, text, format: detectFormat(buf) });
          }
        }
        if (typeof json.url === 'string') {
          // 远程 URL — 下载
          const audioRes = await fetch(json.url, { signal: abortSignal });
          if (!audioRes.ok) throw new Error(`下载 TTS 音频失败 ${audioRes.status}`);
          const buf = Buffer.from(await audioRes.arrayBuffer());
          return saveAndReturn({ buf, projectId, frameId, text, format: detectFormat(buf) });
        }
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('TTS 错误')) throw e;
      // 不是 JSON，吞掉错误走二进制路径
    }
    // 不是 JSON，但 content-type 说是 JSON — 异常情况
    if (txt.length < 1000) {
      throw new Error(`TTS 返回异常 (${contentType}): ${txt.slice(0, 300)}`);
    }
    // 当二进制处理
    const buf = Buffer.from(txt, 'binary');
    return saveAndReturn({ buf, projectId, frameId, text, format: detectFormat(buf) });
  }

  // 2) 正常情况：直接是二进制音频
  const buf = Buffer.from(await response.arrayBuffer());
  if (buf.length === 0) {
    throw new Error('TTS 返回内容为空');
  }
  return saveAndReturn({ buf, projectId, frameId, text, format: detectFormat(buf) });
}

/** 通过 magic bytes 检测音频格式 */
function detectFormat(buf: Buffer): 'mp3' | 'wav' {
  // WAV: 开头 4 字节 "RIFF"，8-12 字节 "WAVE"
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') {
    return 'wav';
  }
  // MP3: ID3v2 标签 "ID3" 或 0xFF 0xFB/0xFA/0xF3/0xF2 帧同步
  if (buf.length >= 3 && buf.toString('ascii', 0, 3) === 'ID3') return 'mp3';
  if (buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return 'mp3';
  // 兜底当 mp3
  return 'mp3';
}

async function saveAndReturn(args: {
  buf: Buffer;
  projectId: string;
  frameId: string;
  text: string;
  format: 'mp3' | 'wav';
}): Promise<{ url: string; duration: number; format: 'mp3' | 'wav' }> {
  const { buf, projectId, frameId, text, format } = args;
  const dir = join(process.cwd(), 'data', 'audio', projectId);
  await mkdir(dir, { recursive: true });
  // 按实际格式存对应扩展名（qwen3-tts-flash 返回 WAV，gpt-4o-mini-tts 返回 MP3）
  const ext = format === 'wav' ? 'wav' : 'mp3';
  const filePath = join(dir, `${frameId}.${ext}`);
  await writeFile(filePath, buf);
  // 估算时长：中文按 4 字/秒
  const estimated = Math.max(2, Math.ceil(text.length / 4));
  return {
    url: `/api/data/audio/${projectId}/${frameId}.${ext}`,
    duration: estimated,
    format,
  };
}
