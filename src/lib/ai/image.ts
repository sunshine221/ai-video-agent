import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { env } from '@/lib/env';

/**
 * z-image-turbo 图片生成（evolink.ai）
 * 文档：https://evolink.ai/z-image-turbo
 *
 * 两阶段：
 *  1. POST /v1/images/generations 提交任务，返回 task_id
 *  2. GET /v1/tasks/{task_id} 轮询，completed 时返回 image_url，下载到本地
 *
 * ⚠️ 注意：请求体中不能传 `n` 字段（z-image-turbo 不支持多张）
 * ⚠️ 注意：size 字段用比例（"16:9"）或像素（"1024x768"），范围 376-1536
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
 */
export async function generateAndSaveImage(opts: {
  projectId: string;
  frameId: string;
  prompt: string;
  abortSignal?: AbortSignal;
}): Promise<{ url: string; durationMs: number }> {
  const { projectId, frameId, prompt, abortSignal } = opts;

  if (!env.IMAGE_API_BASE_URL || !env.IMAGE_API_KEY) {
    throw new Error('图片生成未配置：缺少 IMAGE_API_BASE_URL / IMAGE_API_KEY');
  }

  const start = Date.now();
  const baseUrl = normalizeBase(env.IMAGE_API_BASE_URL);

  // 阶段 1：创建任务
  const createRes = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.IMAGE_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'z-image-turbo',
      prompt,
      size: '16:9',
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

  // 阶段 2：轮询
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let imageUrl: string | undefined;
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
      imageUrl = extractImageUrl(status);
      if (imageUrl) break;
      // 状态是成功但没拿到 url，再等一轮
      continue;
    }
    if (status.status === 'failed') {
      throw new Error(`图片生成失败: ${status.error || JSON.stringify(status).slice(0, 300)}`);
    }
    // pending / processing 继续
  }
  if (!imageUrl) {
    throw new Error(`图片生成超时或响应中未找到图片 URL`);
  }

  // 阶段 3：下载到本地
  const imgRes = await fetch(imageUrl, { signal: abortSignal });
  if (!imgRes.ok) throw new Error(`图片下载失败 ${imgRes.status}`);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  const dir = join(process.cwd(), 'data', 'images', projectId);
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, `${frameId}.png`);
  await writeFile(filePath, buf);

  return {
    url: `/api/data/images/${projectId}/${frameId}.png`,
    durationMs: Date.now() - start,
  };
}
