import { describe, it, expect } from 'vitest';
import { insertFrameIntoOutline, realignVideoSource } from '@/lib/ai/frame-ops';
import type { FrameOutline, Outline, VideoSource } from '@/types';

function makeFrame(id: string, index: number, title: string): FrameOutline {
  return { id, index, title, narration: `${title} 旁白` };
}

function makeOutline(frames: FrameOutline[]): Outline {
  return { title: 't', totalDuration: 30, frames };
}

describe('insertFrameIntoOutline', () => {
  it('在末尾插入（afterIndex = total）', () => {
    const outline = makeOutline([makeFrame('a', 1, 'A'), makeFrame('b', 2, 'B')]);
    const { outline: out, insertAt } = insertFrameIntoOutline(
      outline,
      makeFrame('c', 0, 'C'),
      2,
    );
    expect(insertAt).toBe(2);
    expect(out.frames.map(f => f.title)).toEqual(['A', 'B', 'C']);
    // 重新编号 1-based
    expect(out.frames.map(f => f.index)).toEqual([1, 2, 3]);
  });

  it('在中间插入（afterIndex = 1）', () => {
    const outline = makeOutline([makeFrame('a', 1, 'A'), makeFrame('b', 2, 'B')]);
    const { outline: out, insertAt } = insertFrameIntoOutline(
      outline,
      makeFrame('c', 0, 'C'),
      1,
    );
    expect(insertAt).toBe(1);
    expect(out.frames.map(f => f.title)).toEqual(['A', 'C', 'B']);
    expect(out.frames.map(f => f.index)).toEqual([1, 2, 3]);
  });

  it('在最前插入（afterIndex = 0）', () => {
    const outline = makeOutline([makeFrame('a', 1, 'A'), makeFrame('b', 2, 'B')]);
    const { outline: out, insertAt } = insertFrameIntoOutline(
      outline,
      makeFrame('c', 0, 'C'),
      0,
    );
    expect(insertAt).toBe(0);
    expect(out.frames.map(f => f.title)).toEqual(['C', 'A', 'B']);
    expect(out.frames.map(f => f.index)).toEqual([1, 2, 3]);
  });

  it('越界的 afterIndex 会被夹紧', () => {
    const outline = makeOutline([makeFrame('a', 1, 'A')]);
    const { insertAt } = insertFrameIntoOutline(
      outline,
      makeFrame('c', 0, 'C'),
      999,
    );
    expect(insertAt).toBe(1);
  });

  it('保留原有 frame 的 id / narration / prompt 字段', () => {
    const outline = makeOutline([makeFrame('a', 1, 'A'), makeFrame('b', 2, 'B')]);
    const { outline: out } = insertFrameIntoOutline(
      outline,
      { id: 'c', index: 0, title: 'C', narration: 'C 旁白', imagePrompt: 'img' },
      1,
    );
    expect(out.frames[1]).toMatchObject({ id: 'c', title: 'C', imagePrompt: 'img' });
  });
});

describe('realignVideoSource', () => {
  it('缺失的 frame 位置补 {id}', () => {
    const outline = makeOutline([makeFrame('a', 1, 'A'), makeFrame('b', 2, 'B'), makeFrame('c', 3, 'C')]);
    const vs: VideoSource = { frames: [{ id: 'a', imagePath: '/a.png' }] };
    const aligned = realignVideoSource(outline, vs);
    expect(aligned.frames.length).toBe(3);
    expect(aligned.frames[0]).toEqual({ id: 'a', imagePath: '/a.png' });
    expect(aligned.frames[1]).toEqual({ id: 'b' });
    expect(aligned.frames[2]).toEqual({ id: 'c' });
  });

  it('多余的 frame 被丢弃', () => {
    const outline = makeOutline([makeFrame('a', 1, 'A')]);
    const vs: VideoSource = { frames: [{ id: 'a' }, { id: 'x' }, { id: 'y' }] };
    const aligned = realignVideoSource(outline, vs);
    expect(aligned.frames.length).toBe(1);
    expect(aligned.frames[0]).toEqual({ id: 'a' });
  });

  it('按 outline 顺序排列', () => {
    const outline = makeOutline([makeFrame('a', 1, 'A'), makeFrame('b', 2, 'B'), makeFrame('c', 3, 'C')]);
    const vs: VideoSource = { frames: [{ id: 'b' }, { id: 'a' }, { id: 'c' }] };
    const aligned = realignVideoSource(outline, vs);
    expect(aligned.frames.map(f => f.id)).toEqual(['a', 'b', 'c']);
  });
});
