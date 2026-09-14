import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { env } from '@/lib/env';

/**
 * TTS 语音生成（多 provider）
 *
 * 通过 env.TTS_PROVIDER 切换接口风格，新增厂商只需实现一个 provider 函数并在
 * generateAndSaveTTS 的 switch 中注册，业务调用方无需改动。
 *
 * 已支持：
 *  - 'openai'    OpenAI 兼容 /audio/speech（如中转站的 qwen3-tts-flash、gpt-4o-mini-tts）
 *  - 'dashscope' 阿里云百炼原生 multimodal-generation（qwen3-tts-flash、qwen-audio-3.0-tts-plus）
 *
 * 音色（voice）取决于模型：
 *  - gpt-4o-mini-tts       alloy/ash/ballad/coral/echo/sage/shimmer/verse/nova ...
 *  - qwen3-tts-flash       Cherry/Serena/Ethan 等中文音色
 *  - qwen-audio-3.0-tts-plus  longanhuan_v3.6 等
 *
 * 实际响应可能是 mp3 或 wav，按文件头 magic bytes 存为对应扩展名。
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
    model = env.TTS_MODEL,
  } = opts;
  if (!text?.trim()) throw new Error('TTS 文本为空');

  const baseUrl = env.TTS_BASE_URL;
  const apiKey = env.TTS_API_KEY;
  if (!baseUrl) throw new Error('TTS_BASE_URL（或 AI_BASE_URL）未配置');
  if (!apiKey) throw new Error('TTS_API_KEY（或 AI_API_KEY）未配置');

  let buf: Buffer;
  switch ((env.TTS_PROVIDER || 'openai').toLowerCase()) {
    case 'dashscope':
      buf = await ttsDashScope({ baseUrl, apiKey, model, voice, text, abortSignal });
      break;
    case 'openai':
    default:
      buf = await ttsOpenAI({ baseUrl, apiKey, model, voice, text, abortSignal });
      break;
  }

  if (buf.length === 0) throw new Error('TTS 返回内容为空');
  return saveAndReturn({ buf, projectId, frameId, text, format: detectFormat(buf) });
}

/**
 * OpenAI 兼容 TTS：POST {base}/audio/speech
 * 用多 Accept 头兼容各种中转站；返回可能是二进制音频，也可能是含 base64/url 的 JSON。
 */
async function ttsOpenAI(args: {
  baseUrl: string;
  apiKey: string;
  model: string;
  voice: string;
  text: string;
  abortSignal?: AbortSignal;
}): Promise<Buffer> {
  const { baseUrl, apiKey, model, voice, text, abortSignal } = args;
  const base = baseUrl.replace(/\/+$/, '');

  const response = await fetch(`${base}/audio/speech`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      accept: 'application/json, audio/mpeg;q=0.9, */*;q=0.5',
    },
    body: JSON.stringify({ model, voice, input: text, response_format: 'mp3' }),
    signal: abortSignal,
  });
  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`TTS 请求失败 ${response.status}: ${txt.slice(0, 500)}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.startsWith('application/json')) {
    const txt = await response.text();
    try {
      const json = JSON.parse(txt);
      if (json.error || json.code) {
        throw new Error(`TTS 错误: ${json.error?.message || json.message || JSON.stringify(json).slice(0, 300)}`);
      }
      const b64 = json.audio || json.data;
      if (typeof b64 === 'string') {
        const buf = Buffer.from(b64, 'base64');
        if (buf.length > 0) return buf;
      }
      if (typeof json.url === 'string') {
        return downloadAudio(json.url, abortSignal);
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('TTS 错误')) throw e;
      // 不是 JSON，走二进制兜底
    }
    if (txt.length < 1000) {
      throw new Error(`TTS 返回异常 (${contentType}): ${txt.slice(0, 300)}`);
    }
    return Buffer.from(txt, 'binary');
  }

  return Buffer.from(await response.arrayBuffer());
}

/**
 * 阿里云百炼原生 TTS：POST {root}/api/v1/services/aigc/multimodal-generation/generation
 * 请求体 { model, input:{ text, voice } }；返回 JSON，音频在 output.audio.url，需再下载。
 */
async function ttsDashScope(args: {
  baseUrl: string;
  apiKey: string;
  model: string;
  voice: string;
  text: string;
  abortSignal?: AbortSignal;
}): Promise<Buffer> {
  const { baseUrl, apiKey, model, voice, text, abortSignal } = args;
  // 兼容用户填 compatible-mode 端点：原生多模态走 /api/v1，需去掉 /compatible-mode/v1
  const root = baseUrl.replace(/\/+$/, '').replace(/\/compatible-mode\/v1$/, '');
  const url = `${root}/api/v1/services/aigc/multimodal-generation/generation`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input: { text, voice } }),
    signal: abortSignal,
  });
  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`TTS 请求失败 ${response.status}: ${txt.slice(0, 500)}`);
  }
  const data = (await response.json()) as {
    output?: { audio?: { url?: string; data?: string } };
    message?: string;
  };
  const audioUrl = data.output?.audio?.url;
  if (audioUrl) return downloadAudio(audioUrl, abortSignal);
  const b64 = data.output?.audio?.data;
  if (b64) {
    const buf = Buffer.from(b64, 'base64');
    if (buf.length > 0) return buf;
  }
  throw new Error(`TTS 返回未找到音频：${JSON.stringify(data).slice(0, 300)}`);
}

/** 下载远程音频为 Buffer */
async function downloadAudio(url: string, abortSignal?: AbortSignal): Promise<Buffer> {
  const res = await fetch(url, { signal: abortSignal });
  if (!res.ok) throw new Error(`下载 TTS 音频失败 ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
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
