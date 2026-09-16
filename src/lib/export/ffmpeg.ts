/**
 * FFmpeg 封装：把 PNG 序列 + 音频合成为片段，再把所有片段拼接为最终 MP4。
 *
 * 关键约定：所有片段统一编码参数（H.264 yuv420p / AAC 48k 立体声），
 * 这样最终拼接可用 concat demuxer + stream copy，快且无损。
 */

import { spawn } from 'child_process';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import ffmpegStatic from 'ffmpeg-static';
import { EXPORT_WIDTH, EXPORT_HEIGHT } from './render';

const FFMPEG_BIN: string = (ffmpegStatic as unknown as string) || 'ffmpeg';

/** 统一的音频参数（缺声音的片段用静音补齐，保证 concat 轨道一致） */
const AUDIO_SAMPLE_RATE = 48_000;
const AUDIO_CHANNELS = 2;

/** FFmpeg 进度回调选项：解析 -progress 输出，换算成 0~1 的编码进度 */
interface FfmpegProgressOptions {
  /** 目标片段总时长（秒），用于把编码时间点换算成 0~1 进度 */
  durationSec: number;
  /** 进度回调（0~1，单调递增，封顶 1） */
  onProgress: (fraction: number) => void;
}

function runFfmpeg(
  args: string[],
  signal?: AbortSignal,
  progress?: FfmpegProgressOptions,
): Promise<void> {
  // 需要进度时，让 ffmpeg 把机器可读的进度写到 stdout
  const finalArgs = progress
    ? ['-nostats', '-progress', 'pipe:1', ...args]
    : args;

  return new Promise((resolvePromise, reject) => {
    const proc = spawn(FFMPEG_BIN, finalArgs, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', d => {
      stderr += d.toString();
      if (stderr.length > 20_000) stderr = stderr.slice(-20_000);
    });

    if (progress) {
      let stdoutBuf = '';
      let lastFraction = 0;
      proc.stdout.on('data', d => {
        stdoutBuf += d.toString();
        // -progress 以 key=value 的块输出，块以 progress=... 结尾
        let nl: number;
        while ((nl = stdoutBuf.indexOf('\n')) !== -1) {
          const line = stdoutBuf.slice(0, nl).trim();
          stdoutBuf = stdoutBuf.slice(nl + 1);
          // 优先用微秒字段；部分构建把微秒错标为 out_time_ms
          const m = /^out_time_(us|ms)=(\d+)$/.exec(line);
          if (m && progress.durationSec > 0) {
            const micros = Number(m[2]);
            const seconds = micros / 1_000_000;
            const fraction = Math.max(0, Math.min(1, seconds / progress.durationSec));
            if (fraction > lastFraction) {
              lastFraction = fraction;
              progress.onProgress(fraction);
            }
          }
        }
      });
    }

    const onAbort = () => {
      proc.kill('SIGKILL');
      reject(new DOMException('Export aborted', 'AbortError'));
    };
    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
    }
    proc.on('error', err => {
      if (signal) signal.removeEventListener('abort', onAbort);
      reject(err);
    });
    proc.on('close', code => {
      if (signal) signal.removeEventListener('abort', onAbort);
      if (code === 0) resolvePromise();
      else reject(new Error(`ffmpeg 退出码 ${code}: ${stderr.slice(-800)}`));
    });
  });
}

export interface ComposeClipParams {
  /** PNG 序列所在目录（内含 frame-000001.png ...） */
  framesDir: string;
  /** 该片段音频磁盘路径；为 null 时用静音补齐 */
  audioPath: string | null;
  durationSec: number;
  fps: number;
  /** 输出片段路径（.mp4） */
  outPath: string;
  signal?: AbortSignal;
  /** 编码进度回调（0~1） */
  onProgress?: (fraction: number) => void;
}

/**
 * 把单个分镜的 PNG 序列 + 音频合成为一个带声音的 MP4 片段。
 */
export async function composeClip(params: ComposeClipParams): Promise<void> {
  const { framesDir, audioPath, durationSec, fps, outPath, signal, onProgress } = params;
  const inputPattern = join(framesDir, 'frame-%06d.png');

  const args: string[] = ['-y', '-framerate', String(fps), '-i', inputPattern];

  if (audioPath) {
    args.push('-i', audioPath);
  } else {
    // 无音频：生成静音源
    args.push(
      '-f',
      'lavfi',
      '-i',
      `anullsrc=channel_layout=stereo:sample_rate=${AUDIO_SAMPLE_RATE}`,
    );
  }

  args.push(
    // 视频
    '-vf',
    `scale=${EXPORT_WIDTH}:${EXPORT_HEIGHT}:force_original_aspect_ratio=decrease,pad=${EXPORT_WIDTH}:${EXPORT_HEIGHT}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`,
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '20',
    '-r',
    String(fps),
    // 音频
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-ar',
    String(AUDIO_SAMPLE_RATE),
    '-ac',
    String(AUDIO_CHANNELS),
    // 以视频时长为准，音频超出截断/不足静音补齐
    '-t',
    durationSec.toFixed(3),
    '-shortest',
    '-movflags',
    '+faststart',
    outPath,
  );

  await runFfmpeg(
    args,
    signal,
    onProgress ? { durationSec, onProgress } : undefined,
  );
}

/**
 * 用 concat demuxer 无损拼接多个片段为最终 MP4。
 */
export async function concatClips(
  clipPaths: string[],
  outPath: string,
  workDir: string,
  signal?: AbortSignal,
): Promise<void> {
  // concat demuxer 的 list 文件；路径用单引号包裹并转义
  const listContent = clipPaths
    .map(p => `file '${p.replace(/'/g, "'\\''")}'`)
    .join('\n');
  const listPath = join(workDir, 'concat.txt');
  await writeFile(listPath, listContent, 'utf8');

  await runFfmpeg(
    [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listPath,
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      outPath,
    ],
    signal,
  );
}

/**
 * image 模式：把单张静态图 + 音频合成为带缓慢放大的片段（与前端 Ken Burns 近似）。
 */
export async function composeImageClip(params: {
  imagePath: string;
  audioPath: string | null;
  durationSec: number;
  fps: number;
  outPath: string;
  signal?: AbortSignal;
  /** 编码进度回调（0~1） */
  onProgress?: (fraction: number) => void;
}): Promise<void> {
  const { imagePath, audioPath, durationSec, fps, outPath, signal, onProgress } = params;
  const args: string[] = ['-y', '-loop', '1', '-i', imagePath];

  if (audioPath) {
    args.push('-i', audioPath);
  } else {
    args.push('-f', 'lavfi', '-i', `anullsrc=channel_layout=stereo:sample_rate=${AUDIO_SAMPLE_RATE}`);
  }

  args.push(
    '-vf',
    `scale=${EXPORT_WIDTH}:${EXPORT_HEIGHT}:force_original_aspect_ratio=increase,crop=${EXPORT_WIDTH}:${EXPORT_HEIGHT},format=yuv420p`,
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '20',
    '-r',
    String(fps),
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-ar',
    String(AUDIO_SAMPLE_RATE),
    '-ac',
    String(AUDIO_CHANNELS),
    '-t',
    durationSec.toFixed(3),
    '-shortest',
    '-movflags',
    '+faststart',
    outPath,
  );

  await runFfmpeg(
    args,
    signal,
    onProgress ? { durationSec, onProgress } : undefined,
  );
}
