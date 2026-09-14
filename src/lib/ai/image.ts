import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { env } from '@/lib/env';

/**
 * 图片生成（多 provider）
 *
 * 通过 env.IMAGE_PROVIDER 切换厂商，新增厂商只需实现一个 provider 函数并在
 * generateAndSaveImage 的 switch 中注册，业务调用方无需改动。
 *
 * 已支持：
 *  - 'evolink'   evolink.ai（两阶段任务：提交 -> 轮询 /tasks）
 *  - 'dashscope' 阿里云百炼原生 multimodal-generation 同步生图（z-image-turbo）
 */

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 60_000;

interface CreateTaskResponse {
  id: string;
  status?: string;
  [key: string]: unknown;
}

interface PollTaskResponse {
  id: string;
  status: string;
  image_url?: string;
  url?: string;
  output?: string | { url?: string } | Array<{ url?: string }>;
  data?: Array<{ url?: string }>;
  result?: { url?: string; image_url?: string };
  /** evolink 实际字段：result_data: [{ url: '...' }] */
  result_data?: Array<{ url?: string }>;
  /** evolink 另一个字段：results: ['...'] */
  results?: string[];
  error?: string;
  [key: string]: unknown;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 规范化 base URL：
 * 1) 去掉尾部斜杠
 * 2) 如果没有 /v1 后缀，自动补上
 * 兼容用户配置：
 *   - https://api.evolink.ai         → https://api.evolink.ai/v1
 *   - https://api.evolink.ai/        → https://api.evolink.ai/v1
 *   - https://api.evolink.ai/v1      → https://api.evolink.ai/v1
 *   - https://api.example.com/openai → https://api.example.com/openai/v1
 */
function normalizeBase(url: string): string {
  let u = url.replace(/\/+$/, '');
  if (!/\/v\d+$/.test(u)) u = u + '/v1';
  return u;
}

/**
 * 从轮询响应里提取图片 URL（兼容多种字段命名）
 */
function extractImageUrl(resp: PollTaskResponse): string | undefined {
  if (resp.image_url) return resp.image_url;
  if (resp.url) return resp.url;
  if (resp.output) {
    if (typeof resp.output === 'string') return resp.output;
    if (Array.isArray(resp.output) && resp.output[0]?.url) return resp.output[0].url;
    if (!Array.isArray(resp.output) && typeof resp.output === 'object' && resp.output.url) {
      return resp.output.url;
    }
  }
  if (Array.isArray(resp.data) && resp.data[0]?.url) return resp.data[0].url;
  if (resp.result?.url) return resp.result.url;
  if (resp.result?.image_url) return resp.result.image_url;
  // evolink z-image-turbo 实际响应字段
  if (Array.isArray(resp.result_data) && resp.result_data[0]?.url) return resp.result_data[0].url;
  if (Array.isArray(resp.results) && resp.results[0]) return resp.results[0];
  return undefined;
}

/**
 * 生成图片并保存到 data/images/<projectId>/<frameId>.png
 * @returns 相对 URL 路径：/api/data/images/<projectId>/<frameId>.png
 *
 * 按 env.IMAGE_PROVIDER 分发到对应 provider。新增厂商在此注册即可。
 */
export async function generateAndSaveImage(opts: {
  projectId: string;
  frameId: string;
  prompt: string;
  abortSignal?: AbortSignal;
}): Promise<{ url: string; durationMs: number }> {
  const { projectId, frameId, prompt, abortSignal } = opts;
  const start = Date.now();

  let imageUrl: string;
  switch ((env.IMAGE_PROVIDER || 'evolink').toLowerCase()) {
    case 'dashscope':
      imageUrl = await generateImageDashScope(prompt, abortSignal);
      break;
    case 'evolink':
    default:
      imageUrl = await generateImageEvolink(prompt, abortSignal);
      break;
  }

  const url = await downloadImage({ imageUrl, projectId, frameId, abortSignal });
  return { url, durationMs: Date.now() - start };
}

/**
 * evolink.ai z-image-turbo
 * 两阶段：POST /images/generations 提交 -> 轮询 GET /tasks/{id}
 * ⚠️ 请求体不能传 n（不支持多张）；size 用比例或像素（376-1536）
 */
async function generateImageEvolink(prompt: string, abortSignal?: AbortSignal): Promise<string> {
  if (!env.IMAGE_API_BASE_URL || !env.IMAGE_API_KEY) {
    throw new Error('图片生成未配置：缺少 IMAGE_API_BASE_URL / IMAGE_API_KEY');
  }
  const baseUrl = normalizeBase(env.IMAGE_API_BASE_URL);

  const createRes = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.IMAGE_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.IMAGE_MODEL,
      prompt,
      size: env.IMAGE_SIZE,
    }),
    signal: abortSignal,
  });
  if (!createRes.ok) {
    const txt = await createRes.text();
    throw new Error(`图片任务创建失败 ${createRes.status}: ${txt.slice(0, 500)}`);
  }
  const created = (await createRes.json()) as CreateTaskResponse;
  const taskId = created.id;
  if (!taskId) {
    throw new Error(`图片任务创建失败：未返回 id。响应：${JSON.stringify(created).slice(0, 500)}`);
  }

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (abortSignal?.aborted) throw new Error('已中断');
    await sleep(POLL_INTERVAL_MS);
    const pollRes = await fetch(`${baseUrl}/tasks/${taskId}`, {
      headers: { authorization: `Bearer ${env.IMAGE_API_KEY}` },
      signal: abortSignal,
    });
    if (!pollRes.ok) {
      console.warn(`[image] 轮询返回 ${pollRes.status}，继续轮询`);
      continue;
    }
    const status = (await pollRes.json()) as PollTaskResponse;
    if (status.status === 'succeeded' || status.status === 'completed' || status.status === 'success') {
      const url = extractImageUrl(status);
      if (url) return url;
      continue;
    }
    if (status.status === 'failed') {
      throw new Error(`图片生成失败: ${status.error || JSON.stringify(status).slice(0, 300)}`);
    }
  }
  throw new Error('图片生成超时或响应中未找到图片 URL');
}

/**
 * 阿里云百炼原生 multimodal-generation 同步生图（z-image-turbo）
 * POST /api/v1/services/aigc/multimodal-generation/generation
 * 请求体用多模态 messages 格式；同步返回，图片在 output.choices[0].message.content[0].image
 *
 * size 需用像素格式（如 "1280*720"），不接受 "16:9" 比例；
 * 若配了比例，这里映射为常用像素尺寸。
 */
async function generateImageDashScope(prompt: string, abortSignal?: AbortSignal): Promise<string> {
  const rawBase = env.IMAGE_API_BASE_URL || env.AI_BASE_URL;
  const apiKey = env.IMAGE_API_KEY || env.AI_API_KEY;
  if (!rawBase || !apiKey) {
    throw new Error('图片生成未配置：缺少 IMAGE_API_BASE_URL(或 AI_BASE_URL) / IMAGE_API_KEY(或 AI_API_KEY)');
  }
  // 兼容用户填 compatible-mode 端点：原生多模态走 /api/v1，需去掉 /compatible-mode/v1
  const root = rawBase.replace(/\/+$/, '').replace(/\/compatible-mode\/v1$/, '');
  const url = `${root}/api/v1/services/aigc/multimodal-generation/generation`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: env.IMAGE_MODEL,
      input: { messages: [{ role: 'user', content: [{ text: prompt }] }] },
      parameters: { size: toDashScopeSize(env.IMAGE_SIZE), prompt_extend: false },
    }),
    signal: abortSignal,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`图片生成失败 ${res.status}: ${txt.slice(0, 500)}`);
  }
  const data = (await res.json()) as {
    output?: { choices?: Array<{ message?: { content?: Array<{ image?: string }> } }> };
    message?: string;
  };
  const imageUrl = data.output?.choices?.[0]?.message?.content?.find(c => c.image)?.image;
  if (!imageUrl) {
    throw new Error(`图片生成成功但未找到图片 URL：${JSON.stringify(data).slice(0, 300)}`);
  }
  return imageUrl;
}

/** 把宽高比映射为百炼像素尺寸；已是像素格式则原样返回 */
function toDashScopeSize(size: string): string {
  if (/^\d+\*\d+$/.test(size)) return size;
  const map: Record<string, string> = {
    '16:9': '1280*720',
    '9:16': '720*1280',
    '4:3': '1024*768',
    '3:4': '768*1024',
    '1:1': '1024*1024',
  };
  return map[size] || '1280*720';
}

/** 下载远程图片并保存到本地，返回可访问的相对 URL */
async function downloadImage(args: {
  imageUrl: string;
  projectId: string;
  frameId: string;
  abortSignal?: AbortSignal;
}): Promise<string> {
  const { imageUrl, projectId, frameId, abortSignal } = args;
  const imgRes = await fetch(imageUrl, { signal: abortSignal });
  if (!imgRes.ok) throw new Error(`图片下载失败 ${imgRes.status}`);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  const dir = join(process.cwd(), 'data', 'images', projectId);
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, `${frameId}.png`);
  await writeFile(filePath, buf);
  return `/api/data/images/${projectId}/${frameId}.png`;
}
