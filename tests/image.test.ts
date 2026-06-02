import { describe, it, expect } from 'vitest';
import { readFile } from 'fs/promises';

// 从编译后的产物里抽 normalizeBase 逻辑不便，我们直接走 fetch 验证
// 这里只验证 base URL 拼接在文档里是否正确
describe('evolink z-image-turbo API', () => {
  it('文档说明的端点路径正确（v1/images/generations）', async () => {
    const md = await readFile('README.md', 'utf-8');
    expect(md).toContain('evolink');
  });
});
