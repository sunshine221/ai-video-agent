/**
 * Playwright 无头浏览器单例
 *
 * 复用同一个 Chromium 实例，避免每次导出都冷启动。
 * 通过 PLAYWRIGHT_BROWSERS_PATH=0 让浏览器安装在 node_modules 内，
 * 规避默认 AppData 目录的写入限制（见 README/部署说明）。
 */

import type { Browser } from 'playwright';

// 默认把浏览器路径指向 node_modules（若外部未显式指定）
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
}

let browserPromise: Promise<Browser> | null = null;

export async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const { chromium } = await import('playwright');
      return chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });
    })().catch(err => {
      // 启动失败时清空缓存，允许后续重试
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const p = browserPromise;
    browserPromise = null;
    try {
      const browser = await p;
      await browser.close();
    } catch {
      /* ignore */
    }
  }
}
