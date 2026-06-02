import { describe, it, expect } from 'vitest';
import { STYLE_PRESETS, getStyleById, getDefaultStyle } from '@/lib/styles/presets';

describe('STYLE_PRESETS', () => {
  it('正好 3 套风格', () => {
    expect(STYLE_PRESETS).toHaveLength(3);
  });

  it('每套风格都有 id、name、prompt、demoHtml', () => {
    STYLE_PRESETS.forEach(s => {
      expect(s.id).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(s.description).toBeTruthy();
      expect(s.prompt).toBeTruthy();
      expect(s.demoHtml).toContain('<!DOCTYPE html>');
    });
  });

  it('id 唯一', () => {
    const ids = STYLE_PRESETS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('getStyleById', () => {
  it('能查到已有风格', () => {
    expect(getStyleById('glassmorphism')?.name).toBe('玻璃拟态');
  });

  it('未传或未知 id 返回 undefined', () => {
    expect(getStyleById()).toBeUndefined();
    expect(getStyleById(null)).toBeUndefined();
    expect(getStyleById('not-exist')).toBeUndefined();
  });
});

describe('getDefaultStyle', () => {
  it('返回第一套', () => {
    expect(getDefaultStyle().id).toBe(STYLE_PRESETS[0].id);
  });
});
