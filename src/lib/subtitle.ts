/**
 * 字幕切片算法
 * 把分镜旁白文本按标点拆分成短句，按字数百分比分配时间。
 */

export interface SubtitleCue {
  text: string;
  startTime: number;
  endTime: number;
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
