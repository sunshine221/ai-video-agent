/**
 * 导出流水线路径工具
 *
 * 负责：
 * - 把对外的 /api/data/... URL 还原成 data/ 目录下的真实磁盘路径
 * - 计算导出产物目录与临时工作目录
 */

import { join, normalize, resolve } from 'path';

/** data/ 根目录（与 /api/data/[...path] 路由保持一致） */
export const DATA_ROOT = resolve(process.cwd(), 'data');

/** 导出产物目录：data/exports/<projectId>/ */
export function exportDir(projectId: string): string {
  return join(DATA_ROOT, 'exports', projectId);
}

/** 导出产物对外可下载的 URL（走 /api/data 鉴权下载） */
export function exportPublicUrl(projectId: string, fileName: string): string {
  return `/api/data/exports/${projectId}/${fileName}`;
}

/** 临时工作目录：data/tmp/export-<projectId>/ */
export function tmpWorkDir(projectId: string): string {
  return join(DATA_ROOT, 'tmp', `export-${projectId}`);
}

/**
 * 把 audioPath / imagePath（形如 /api/data/audio/<pid>/<fid>.mp3）还原为磁盘绝对路径。
 * 返回 null 表示无法解析或越界。
 */
export function resolveDataDiskPath(publicPath: string | undefined | null): string | null {
  if (!publicPath) return null;
  const prefix = '/api/data/';
  if (!publicPath.startsWith(prefix)) return null;
  const rel = publicPath.slice(prefix.length);
  const full = normalize(join(DATA_ROOT, rel));
  if (!full.startsWith(DATA_ROOT)) return null;
  return full;
}
