/**
 * iframe 工具：把 AI 生成的 HTML 包一层"看门狗"，
 * 强制在指定秒数后停掉所有动画与定时器，防止 AI 写出无限循环把浏览器卡死。
 *
 * 工作原理：
 *   1. 在外层文档里嵌入 AI 的 HTML 内容（不嵌套 iframe，避免 srcdoc 套娃）
 *   2. 外层用 <script> 监听一个 watchdog
 *   3. 超时后：清掉所有元素的 CSS animation/transition、覆盖 setInterval、覆盖 requestAnimationFrame
 */

const WATCHDOG_DEFAULT_MS = 8_000;

/**
 * 把 AI 输出的 HTML 包成安全的"带看门狗"HTML 字符串。
 * 适用于 iframe srcdoc。
 *
 * @param innerHtml  AI 返回的 HTML（可包含 <!DOCTYPE> 或不含）
 * @param watchdogMs 看门狗超时（毫秒），默认 8 秒
 */
export function wrapHtmlWithWatchdog(innerHtml: string, watchdogMs = WATCHDOG_DEFAULT_MS): string {
  // 1) 提取 AI 的 <head> 和 <body> 内容（如果没有就当作纯片段）
  const extracted = extractHeadAndBody(innerHtml);

  // 2) 拼装外层 HTML
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=1280, initial-scale=1" />
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; height: 100%; width: 100%; overflow: hidden; background: transparent; }
  body { display: block; position: relative; }
  /* ⭐ 把 AI 内容包在唯一容器里，让容器铺满 body — 既保证铺满，又不破坏 AI 内部各元素的尺寸/定位 */
  .ai-stage { position: absolute; inset: 0; width: 100%; height: 100%; overflow: hidden; }
  /* 看门狗触发后的样式 */
  body.frozen *, body.frozen *::before, body.frozen *::after {
    animation: none !important;
    transition: none !important;
    animation-play-state: paused !important;
  }
</style>
${extracted.head}
<script>
  (function() {
    var WATCHDOG_MS = ${watchdogMs};
    var frozen = false;
    function freeze() {
      if (frozen) return;
      frozen = true;
      try {
        // 1) 停所有 CSS 动画
        document.body.classList.add('frozen');
        // 2) 覆盖 setInterval / setTimeout，让新的定时器直接 no-op
        window.setInterval = function() { return -1; };
        window.setTimeout = function(fn, t) {
          if (t === 0 || (typeof fn === 'function')) {
            // setTimeout(fn, 0) 之类的关键任务仍然放行
            var id = setTimeoutOrig(function(){ try { fn(); } catch(e){} }, Math.min(t || 0, 100));
            return id;
          }
          return -1;
        };
        // 3) 停掉 requestAnimationFrame 链
        window.requestAnimationFrame = function() { return 0; };
        // 4) 尝试清掉现有 interval
        for (var i = 1; i < 99999; i++) { clearInterval(i); clearTimeout(i); }
      } catch (e) {}
    }
    var setTimeoutOrig = window.setTimeout;
    setTimeoutOrig(freeze, WATCHDOG_MS);

    // ⭐ 把内容"设计尺寸"上报给父窗口（父窗口用这个来计算 transform: scale）
    function reportSize() {
      try {
        var root = document.documentElement;
        var body = document.body;
        var w = Math.max(
          root.scrollWidth || 0,
          body ? (body.scrollWidth || 0) : 0,
          root.clientWidth || 0
        );
        var h = Math.max(
          root.scrollHeight || 0,
          body ? (body.scrollHeight || 0) : 0,
          root.clientHeight || 0
        );
        if (w > 0 && h > 0 && w < 10000 && h < 10000) {
          parent.postMessage({ type: '__ai_video_iframe_size', w: w, h: h }, '*');
        }
      } catch (e) {}
    }
    // 多次上报，确保拿到准确尺寸（动画/字体加载后尺寸可能变化）
    setTimeoutOrig(reportSize, 50);
    setTimeoutOrig(reportSize, 200);
    setTimeoutOrig(reportSize, 500);
    setTimeoutOrig(reportSize, 1000);
    if (document.readyState === 'complete') {
      reportSize();
    } else {
      window.addEventListener('load', reportSize);
    }
  })();
</script>
</head>
<body>
<div class="ai-stage">${extracted.body}</div>
</body>
</html>`;
}

/**
 * 从 AI HTML 中提取 head 和 body 内容
 */
function extractHeadAndBody(html: string): { head: string; body: string } {
  if (!html) return { head: '', body: '' };

  // 尝试匹配 <head>...</head>
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

  if (headMatch && bodyMatch) {
    return { head: headMatch[1], body: bodyMatch[1] };
  }
  // 退化：把整段 HTML 放到 body
  return { head: '', body: html };
}

/**
 * 简单 HTML 清理：
 * - 去掉外部 <script src>、外部 <link>、外部 <img>
 * - 去掉 <base>
 */
export function sanitizeAiHtml(html: string): string {
  if (!html) return '';
  let cleaned = html;
  cleaned = cleaned.replace(/<script[^>]+src=["'][^"']*["'][^>]*>\s*<\/script>/gi, '');
  cleaned = cleaned.replace(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi, '');
  cleaned = cleaned.replace(/<img[^>]+src=["']https?:\/\/[^"']*["'][^>]*>/gi, '');
  cleaned = cleaned.replace(/<base[^>]*>/gi, '');
  return cleaned;
}
