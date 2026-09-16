/**
 * 服务端逐帧渲染：用 Playwright 把一个分镜的 HTML 动画按 fps 渲染成 PNG 序列。
 *
 * 核心思路（与前端预览完全对齐）：
 * - HTML 用 wrapHtmlWithWatchdog 包裹（复用前端同款包装）
 * - 动画由「音频进度」驱动：逐帧 postMessage({ type:'__ai_video_step_progress', progress, timeMs })
 *   progress 控制 data-step 淡入节奏，timeMs 把 WAAPI/CSS 动画定格到当前时刻（时间可寻址）
 * - 每帧 progress = i / (totalFrames - 1)，截图落盘为 frame-000001.png ...
 * - 字幕（可选）直接注入页面覆盖层，按 cue 时间显示，保证与预览一致
 */

import { mkdir } from 'fs/promises';
import { join } from 'path';
import type { Page } from 'playwright';
import { getBrowser } from './browser';
import { wrapHtmlWithWatchdog, sanitizeAiHtml } from '@/lib/iframe-utils';
import { splitSubtitles } from '@/lib/subtitle';

/** 导出画布尺寸（设计稿基准，与 iframe 内 viewport 一致） */
export const EXPORT_WIDTH = 1280;
export const EXPORT_HEIGHT = 720;

export interface RenderSceneParams {
  htmlCode: string;
  narration: string;
  durationSec: number;
  fps: number;
  showSubtitle: boolean;
  /** PNG 序列输出目录 */
  outDir: string;
  /** 每渲染完一帧回调（用于进度上报） */
  onFrame?: (rendered: number, total: number) => void;
  signal?: AbortSignal;
}

/** 补零成 6 位，供 ffmpeg 序列读取 */
function seq(n: number): string {
  return String(n).padStart(6, '0');
}

/**
 * 渲染单个分镜为 PNG 序列，返回实际渲染的帧数。
 */
export async function renderSceneToPngs(params: RenderSceneParams): Promise<number> {
  const { htmlCode, narration, durationSec, fps, showSubtitle, outDir, onFrame, signal } = params;
  await mkdir(outDir, { recursive: true });

  const totalFrames = Math.max(1, Math.round(durationSec * fps));
  // 看门狗设成远大于渲染时长，避免动画被冻结（分步 HTML 本就不受冻结影响，这里是双保险）
  const safeHtml = wrapHtmlWithWatchdog(sanitizeAiHtml(htmlCode || ''), 3_600_000);
  const cues = showSubtitle ? splitSubtitles(narration, durationSec) : [];

  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: EXPORT_WIDTH, height: EXPORT_HEIGHT },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    await page.setContent(safeHtml, { waitUntil: 'load' });
    // 给字体/首屏动画一点稳定时间
    await page.waitForTimeout(150);

    if (showSubtitle) {
      await injectSubtitleLayer(page);
    }

    for (let i = 0; i < totalFrames; i++) {
      if (signal?.aborted) throw new DOMException('Export aborted', 'AbortError');

      const progress = totalFrames <= 1 ? 1 : i / (totalFrames - 1);
      const t = progress * durationSec;
      const timeMs = Math.max(0, t * 1000);

      // 与前端预览完全对齐：progress 驱动 data-step 淡入，timeMs 把所有 WAAPI/CSS
      // 动画定格到当前时刻，保证"导出的每一帧 = 预览拖到同一时刻的静态画面"。
      await page.evaluate(payload => {
        window.postMessage({ type: '__ai_video_step_progress', ...payload }, '*');
      }, { progress, timeMs });

      if (showSubtitle) {
        const text = cues.find(c => t >= c.startTime && t < c.endTime)?.text ?? '';
        await page.evaluate(txt => {
          const el = document.getElementById('__ai_export_subtitle');
          if (el) el.textContent = txt;
        }, text);
      }

      // 等一次渲染帧，确保 DOM 变更已绘制
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r(null))));

      await page.screenshot({
        path: join(outDir, `frame-${seq(i + 1)}.png`),
        type: 'png',
        clip: { x: 0, y: 0, width: EXPORT_WIDTH, height: EXPORT_HEIGHT },
      });

      onFrame?.(i + 1, totalFrames);
    }

    return totalFrames;
  } finally {
    await context.close();
  }
}

/** 在页面注入与前端 SubtitleLayer 视觉一致的字幕覆盖层 */
async function injectSubtitleLayer(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.getElementById('__ai_export_subtitle_wrap')) return;
    const wrap = document.createElement('div');
    wrap.id = '__ai_export_subtitle_wrap';
    wrap.style.cssText = [
      'position:fixed',
      'left:0',
      'right:0',
      'bottom:48px',
      'display:flex',
      'justify-content:center',
      'padding:0 32px',
      'pointer-events:none',
      'z-index:2147483647',
    ].join(';');
    const p = document.createElement('p');
    p.id = '__ai_export_subtitle';
    p.style.cssText = [
      'max-width:768px',
      'text-align:center',
      'font-size:24px',
      'font-weight:600',
      'line-height:1.375',
      'color:#fff',
      'letter-spacing:0.02em',
      'margin:0',
      'text-shadow:0 2px 8px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,0.9)',
    ].join(';');
    wrap.appendChild(p);
    document.body.appendChild(wrap);
  });
}
