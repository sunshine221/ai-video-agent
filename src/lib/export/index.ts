/**
 * 导出编排器：把整个项目渲染并合成为一个带声音的 MP4。
 *
 * 流程：
 *   逐个分镜 → (html: 渲染 PNG 序列 + 合成片段) / (image: 静图合成片段)
 *   → 所有片段 concat 拼接 → 产物写入 data/exports/<pid>/
 *
 * 通过 emit 上报进度，signal 支持中断。与 job-manager 配合作为后台任务运行。
 */

import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import type { Emit } from '@/lib/ai/job-manager';
import type { Outline, VideoSource } from '@/types';
import { renderSceneToPngs } from './render';
import { composeClip, composeImageClip, concatClips } from './ffmpeg';
import { resolveDataDiskPath, exportDir, exportPublicUrl, tmpWorkDir } from './paths';
import { estimateFrameDuration } from '@/lib/subtitle';

export interface ExportParams {
  projectId: string;
  projectType: 'image' | 'html';
  title: string;
  outline: Outline;
  videoSource: VideoSource;
  showSubtitle: boolean;
  fps?: number;
}

function sanitizeFileBase(title: string): string {
  const base = (title || 'ai-video-export')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 48);
  return base || 'ai-video-export';
}

/**
 * 执行导出。返回可下载 URL。进度通过 emit 上报。
 */
export async function runExport(params: ExportParams, emit: Emit, signal: AbortSignal): Promise<string> {
  const { projectId, projectType, title, outline, videoSource, showSubtitle } = params;
  const fps = params.fps ?? 30;

  const frames = outline.frames;
  if (!frames.length) throw new Error('没有可导出的分镜');

  // 每帧时长（与前端 preview-panel 对齐：优先真实音频时长）
  const durations = frames.map((f, i) => {
    const src = videoSource.frames[i];
    return src?.audioDuration ?? estimateFrameDuration(f.narration);
  });
  const totalDuration = durations.reduce((s, d) => s + d, 0);

  const work = tmpWorkDir(projectId);
  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true });

  emit('start', { total: frames.length, totalDuration });

  const clipPaths: string[] = [];

  try {
    for (let i = 0; i < frames.length; i++) {
      if (signal.aborted) throw new DOMException('Export aborted', 'AbortError');

      const frame = frames[i];
      const src = videoSource.frames[i];
      const duration = durations[i];
      const audioDisk = resolveDataDiskPath(src?.audioPath);
      const clipPath = join(work, `clip-${String(i).padStart(4, '0')}.mp4`);

      emit('scene_start', { index: i, total: frames.length, phase: 'render' });

      if (projectType === 'image') {
        const imgDisk = resolveDataDiskPath(src?.imagePath);
        if (!imgDisk) {
          throw new Error(`分镜 ${frame.index} 缺少图片，无法导出`);
        }
        await composeImageClip({
          imagePath: imgDisk,
          audioPath: audioDisk,
          durationSec: duration,
          fps,
          outPath: clipPath,
          signal,
          onProgress: fraction => {
            // image 模式无渲染阶段，整个分镜进度即合成进度
            emit('scene_progress', {
              index: i,
              total: frames.length,
              phase: 'image',
              frameProgress: fraction,
            });
          },
        });
      } else {
        if (!src?.htmlCode) {
          throw new Error(`分镜 ${frame.index} 缺少 HTML，无法导出`);
        }
        const framesDir = join(work, `scene-${String(i).padStart(4, '0')}`);
        await renderSceneToPngs({
          htmlCode: src.htmlCode,
          narration: frame.narration,
          durationSec: duration,
          fps,
          showSubtitle,
          outDir: framesDir,
          signal,
          onFrame: (rendered, total) => {
            // 渲染阶段占本分镜进度的前 70%
            emit('scene_progress', {
              index: i,
              total: frames.length,
              phase: 'render',
              frameProgress: total > 0 ? rendered / total : 0,
            });
          },
        });

        emit('scene_start', { index: i, total: frames.length, phase: 'encode' });
        await composeClip({
          framesDir,
          audioPath: audioDisk,
          durationSec: duration,
          fps,
          outPath: clipPath,
          signal,
          onProgress: fraction => {
            // 编码阶段占本分镜进度的后 30%
            emit('scene_progress', {
              index: i,
              total: frames.length,
              phase: 'encode',
              frameProgress: fraction,
            });
          },
        });
        // 及时清理该分镜的 PNG 序列，控制磁盘占用
        await rm(framesDir, { recursive: true, force: true });
      }

      clipPaths.push(clipPath);
      emit('scene_done', { index: i, total: frames.length });
    }

    if (signal.aborted) throw new DOMException('Export aborted', 'AbortError');

    // 拼接
    emit('concat', { clips: clipPaths.length });
    const outDir = exportDir(projectId);
    await mkdir(outDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${sanitizeFileBase(title)}-${timestamp}.mp4`;
    const finalPath = join(outDir, fileName);
    await concatClips(clipPaths, finalPath, work, signal);

    const url = exportPublicUrl(projectId, fileName);
    emit('done', { url, fileName });
    return url;
  } finally {
    // 清理临时工作目录（产物已落在 exports/）
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
