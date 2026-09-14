/**
 * 字幕切片算法
 * 把分镜旁白文本按标点拆分成短句，按字数百分比分配时间。
 */

export interface SubtitleCue {
  text: string;
  startTime: number;
  endTime: number;
}

// 无音频（TTS 缺失）时的分镜时长估算参数
const CHARS_PER_SECOND = 5; // 中文朗读速度约每秒 4-5 字
const MIN_FRAME_DURATION = 5; // 最短分镜时长（秒）
const MAX_FRAME_DURATION = 12; // 最长分镜时长（秒），避免异常长旁白拖太久

/**
 * 没有音频时，按旁白字数估算一个合理的分镜时长（秒）。
 * 用于播放器自动推进与字幕切片的时间基准，保证字幕/动画能完整播完。
 */
export function estimateFrameDuration(narration: string | undefined | null): number {
  const len = narration?.trim().length ?? 0;
  if (len === 0) return MIN_FRAME_DURATION;
  const raw = len / CHARS_PER_SECOND + 1; // +1 秒缓冲
  return Math.min(MAX_FRAME_DURATION, Math.max(MIN_FRAME_DURATION, Math.round(raw)));
}

/**
 * @param narration 完整旁白文本
 * @param audioDuration 音频时长（秒）
 * @returns 字幕片段列表（已按时间排序）
 */
export function splitSubtitles(narration: string, audioDuration: number): SubtitleCue[] {
  if (!narration || audioDuration <= 0) return [];
  // 去掉句末标点（保留中间标点）
  const cleanText = narration.replace(/[。！？.!?]+\s*$/g, '').trim();
  if (!cleanText) return [];

  // 按标点切分：中英文逗号/句号/分号/冒号/感叹号/问号
  // 保留切点，让短句带逗号更自然
  const segments = cleanText
    .split(/(?<=[，,。！？!?；;：:])|(?<=[，,；;：:])(?=\S)/g)
    .map(s => s.replace(/[,，。！？!?；;：:]+$/g, '').trim())
    .filter(Boolean);

  if (!segments.length) return [];

  // 如果只有一段，整段作为一个 cue
  if (segments.length === 1) {
    return [{ text: segments[0], startTime: 0, endTime: audioDuration }];
  }

  const total = segments.reduce((sum, s) => sum + s.length, 0);
  if (total === 0) return [];

  let acc = 0;
  return segments.map(text => {
    const ratio = text.length / total;
    const startTime = acc * audioDuration;
    acc += ratio;
    return { text, startTime, endTime: Math.min(acc, 1) * audioDuration };
  });
}
