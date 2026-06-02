import { describe, it, expect } from 'vitest';
import { wrapHtmlWithWatchdog, sanitizeAiHtml } from '@/lib/iframe-utils';

describe('wrapHtmlWithWatchdog', () => {
  it('空输入返回带 watchdog 的空文档', () => {
    const out = wrapHtmlWithWatchdog('');
    expect(out).toContain('<!DOCTYPE html>');
    expect(out).toContain('setInterval');
    expect(out).toContain('requestAnimationFrame');
  });

  it('包裹 AI HTML 并插入看门狗脚本', () => {
    const ai = '<!DOCTYPE html><html><body><h1>Hello</h1></body></html>';
    const out = wrapHtmlWithWatchdog(ai);
    expect(out).toContain('<h1>Hello</h1>');
    expect(out).toContain('WATCHDOG_MS = ');
    // body 必须有内容
    expect(out).toMatch(/<body>[\s\S]*Hello[\s\S]*<\/body>/);
  });

  it('从 AI HTML 中提取 head 内容', () => {
    const ai = '<!DOCTYPE html><html><head><style>p{color:red}</style></head><body><p>Hi</p></body></html>';
    const out = wrapHtmlWithWatchdog(ai);
    expect(out).toContain('p{color:red}');
    expect(out).toContain('<p>Hi</p>');
  });

  it('支持自定义看门狗时长', () => {
    const out = wrapHtmlWithWatchdog('<body>x</body>', 3000);
    expect(out).toContain('WATCHDOG_MS = 3000');
  });

  it('看门狗中包含 freeze 函数', () => {
    const out = wrapHtmlWithWatchdog('<p>x</p>');
    expect(out).toContain('function freeze()');
    // 必须覆盖 setInterval / setTimeout / requestAnimationFrame
    expect(out).toMatch(/window\.setInterval\s*=/);
    expect(out).toMatch(/window\.setTimeout\s*=/);
    expect(out).toMatch(/window\.requestAnimationFrame\s*=/);
  });
});

describe('sanitizeAiHtml', () => {
  it('移除外部 script src', () => {
    const html = '<script src="https://evil.com/x.js"></script><p>safe</p>';
    const out = sanitizeAiHtml(html);
    expect(out).not.toContain('evil.com');
    expect(out).toContain('<p>safe</p>');
  });

  it('移除外部 stylesheet link', () => {
    const html = '<link rel="stylesheet" href="https://evil.com/x.css"><p>safe</p>';
    const out = sanitizeAiHtml(html);
    expect(out).not.toContain('evil.com');
    expect(out).toContain('<p>safe</p>');
  });

  it('移除外部 img', () => {
    const html = '<img src="https://x.com/1.png"><img src="/local.png">';
    const out = sanitizeAiHtml(html);
    expect(out).not.toContain('https://x.com');
    expect(out).toContain('/local.png');
  });

  it('移除 <base>', () => {
    const html = '<base href="https://evil.com/"><p>safe</p>';
    const out = sanitizeAiHtml(html);
    expect(out).not.toContain('<base');
    expect(out).toContain('<p>safe</p>');
  });

  it('内联 script 保留', () => {
    const html = '<script>console.log(1)</script>';
    const out = sanitizeAiHtml(html);
    expect(out).toContain('console.log(1)');
  });
});
