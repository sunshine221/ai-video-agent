import { describe, it, expect } from 'vitest';
import { formatDuration, formatRelativeTime, cn } from '@/lib/utils';

describe('formatDuration', () => {
  it('秒数转 mm:ss', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(5)).toBe('00:05');
    expect(formatDuration(65)).toBe('01:05');
    expect(formatDuration(125)).toBe('02:05');
  });
  it('负数或 NaN 返回 00:00', () => {
    expect(formatDuration(-1)).toBe('00:00');
    expect(formatDuration(NaN)).toBe('00:00');
  });
});

describe('formatRelativeTime', () => {
  it('刚创建显示 刚刚', () => {
    expect(formatRelativeTime(new Date())).toBe('刚刚');
  });
  it('5 分钟前', () => {
    const d = new Date(Date.now() - 5 * 60 * 1000);
    expect(formatRelativeTime(d)).toBe('5 分钟前');
  });
  it('2 小时前', () => {
    const d = new Date(Date.now() - 2 * 60 * 60 * 1000);
    expect(formatRelativeTime(d)).toBe('2 小时前');
  });
  it('3 天前', () => {
    const d = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(d)).toBe('3 天前');
  });
});

describe('cn', () => {
  it('合并 className', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c');
  });
  it('条件合并', () => {
    expect(cn('a', false, 'b', undefined, 'c')).toBe('a b c');
  });
});
