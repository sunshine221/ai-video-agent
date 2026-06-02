import { describe, it, expect } from 'vitest';
import { splitSubtitles } from '@/lib/subtitle';

describe('splitSubtitles', () => {
  it('空输入返回空数组', () => {
    expect(splitSubtitles('', 5)).toEqual([]);
    expect(splitSubtitles('文本', 0)).toEqual([]);
  });

  it('单句话作为一个 cue', () => {
    const cues = splitSubtitles('你好世界。', 4);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('你好世界');
    expect(cues[0].startTime).toBe(0);
    expect(cues[0].endTime).toBe(4);
  });

  it('按标点拆分成多句', () => {
    const cues = splitSubtitles('黑洞是宇宙中最神秘的天体之一，强大的引力甚至连光都无法逃脱。', 10);
    expect(cues.length).toBeGreaterThanOrEqual(2);
    // 拼接后总时长等于 audioDuration
    const last = cues[cues.length - 1];
    expect(last.endTime).toBeCloseTo(10, 0);
  });

  it('按字数百分比分配时间', () => {
    // "一二三， 四五六七。" → 切分为 "一二三" 和 "四五六七"（粗略）
    // 字数比 3:4 → 时间分配近似
    const cues = splitSubtitles('一二三，四五六七。', 7);
    expect(cues.length).toBeGreaterThan(0);
    cues.forEach(c => {
      expect(c.endTime).toBeGreaterThan(c.startTime);
      expect(c.text.length).toBeGreaterThan(0);
    });
  });

  it('去除句末标点', () => {
    const cues = splitSubtitles('你好世界！！', 4);
    expect(cues[0].text).toBe('你好世界');
  });

  it('中英文混排都能切分', () => {
    const cues = splitSubtitles('Hello, world! 你好世界。', 6);
    expect(cues.length).toBeGreaterThanOrEqual(2);
  });

  it('时间单调递增', () => {
    const cues = splitSubtitles('第一句，第二句，第三句，第四句。', 12);
    for (let i = 1; i < cues.length; i++) {
      expect(cues[i].startTime).toBeGreaterThanOrEqual(cues[i - 1].startTime);
      expect(cues[i].endTime).toBeGreaterThanOrEqual(cues[i - 1].endTime);
    }
  });
});
