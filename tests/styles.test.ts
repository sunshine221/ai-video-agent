import { describe, it, expect } from 'vitest';
import { STYLE_PRESET_SEEDS } from '@/lib/styles/presets';

// 运行时读取（getStyleById/getDefaultStyle/getAllStyles）已改为查数据库，
// 这里只对种子数据（style_preset 表的初始来源）做纯数据校验，无需 DB 连接。
describe('STYLE_PRESET_SEEDS', () => {
  it('正好 3 套内置风格', () => {
    expect(STYLE_PRESET_SEEDS).toHaveLength(3);
  });

  it('每套风格都有 id、slug、name、description、prompt、demoHtml', () => {
    STYLE_PRESET_SEEDS.forEach(s => {
      expect(s.id).toBeTruthy();
      expect(s.slug).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(s.description).toBeTruthy();
      expect(s.prompt).toBeTruthy();
      expect(s.demoHtml).toContain('<!DOCTYPE html>');
    });
  });

  it('id、slug 均唯一', () => {
    const ids = STYLE_PRESET_SEEDS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const slugs = STYLE_PRESET_SEEDS.map(s => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('包含预期的三套内置风格', () => {
    const bySlug = Object.fromEntries(STYLE_PRESET_SEEDS.map(s => [s.slug, s.name]));
    expect(bySlug['cyber-clean']).toBe('科技博主');
    expect(bySlug['terminal-matrix']).toBe('黑客风');
    expect(bySlug['warm-story']).toBe('暖色系');
  });
});
