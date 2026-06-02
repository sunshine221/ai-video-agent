import { describe, it, expect } from 'vitest';
import { buildIntentUserPrompt } from '@/lib/prompts/intent';
import { normalizeOutline } from '@/lib/prompts/outline';

describe('buildIntentUserPrompt', () => {
  it('无大纲时正确提示', () => {
    const prompt = buildIntentUserPrompt({
      userInput: '帮我做一个视频',
      hasOutline: false,
      frameCount: 0,
      frameTitles: [],
    });
    expect(prompt).toContain('还没有大纲');
    expect(prompt).toContain('帮我做一个视频');
  });

  it('有大纲时列出分镜标题', () => {
    const prompt = buildIntentUserPrompt({
      userInput: '重新生成',
      hasOutline: true,
      frameCount: 2,
      frameTitles: ['介绍', '总结'],
    });
    expect(prompt).toContain('介绍');
    expect(prompt).toContain('总结');
    expect(prompt).toContain('重新生成');
  });
});

describe('normalizeOutline', () => {
  it('补齐缺失字段', () => {
    const out = normalizeOutline({ title: '', frames: [] });
    expect(out.title).toBe('未命名视频');
    expect(out.totalDuration).toBe(60);
    expect(out.frames).toEqual([]);
  });

  it('给分镜补 uuid 和 index', () => {
    const out = normalizeOutline({
      title: '测试',
      totalDuration: 30,
      frames: [{ title: 'A', narration: '旁白' }] as any,
    });
    expect(out.frames).toHaveLength(1);
    expect(out.frames[0].id).toBeTruthy();
    expect(out.frames[0].index).toBe(1);
    expect(out.frames[0].title).toBe('A');
  });
});
