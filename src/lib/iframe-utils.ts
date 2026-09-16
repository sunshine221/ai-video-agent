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
  /* ⭐ 音频驱动分步：带 data-step 的元素默认隐藏，按音频播放进度逐步激活淡入 */
  [data-step] { opacity: 0; transition: opacity .45s ease; }
  [data-step].ai-step-active { opacity: 1; }
</style>
${extracted.head}
<script>
  (function() {
    var WATCHDOG_MS = ${watchdogMs};
    var setTimeoutOrig = window.setTimeout;

    // ===== ⭐ 音频驱动分步（方案 A）=====
    // 父窗口按音频真实播放进度，通过 postMessage 下发进度，iframe 据此激活对应 step。
    // 这样"画面进度 == 音频进度"，彻底解决画面/音频不同步、动画过早演完的问题。
    var stepEls = [];        // 所有带 data-step 的元素，按 step 升序
    var maxStep = -1;        // 最大 step 序号
    var hasSteps = false;    // 本帧 HTML 是否采用了分步协议
    function collectSteps() {
      var nodes = document.querySelectorAll('[data-step]');
      stepEls = Array.prototype.slice.call(nodes);
      maxStep = -1;
      for (var i = 0; i < stepEls.length; i++) {
        var s = parseInt(stepEls[i].getAttribute('data-step'), 10);
        if (!isNaN(s) && s > maxStep) maxStep = s;
      }
      hasSteps = stepEls.length > 0;
    }
    // 根据播放进度 p（0~1）激活到对应 step：step <= floor(p*(maxStep+1)) 的都显示
    function applyProgress(p) {
      if (!hasSteps) return;
      if (p < 0) p = 0; if (p > 1) p = 1;
      // 把 [0,1] 均匀切成 (maxStep+1) 段，进度落在第几段就显示到第几步
      var activeUpTo = Math.min(maxStep, Math.floor(p * (maxStep + 1) + 1e-6));
      for (var i = 0; i < stepEls.length; i++) {
        var s = parseInt(stepEls[i].getAttribute('data-step'), 10);
        if (isNaN(s)) continue;
        if (s <= activeUpTo) stepEls[i].classList.add('ai-step-active');
        else stepEls[i].classList.remove('ai-step-active');
      }
    }
    // ===== ⭐ WAAPI 时间驱动：把所有动画钉死在 timeMs 对应的相位 =====
    // 核心：document.getAnimations() 能抓到页面里全部 Animation（含 CSS @keyframes 生成的
    // CSSAnimation）。逐个 pause() 夺取控制权后设 currentTime，画面就成了 timeMs 的纯函数——
    // 播放/拖动/暂停都只是"设不同的 timeMs"，任意时刻都能静态还原，且可复现。
    // 注：data-step 的淡入是 CSSTransition，故意跳过不接管，保留其自然淡入手感。
    function driveAnimations(timeMs) {
      if (typeof document.getAnimations !== 'function') return;
      var anims = document.getAnimations();
      for (var i = 0; i < anims.length; i++) {
        var a = anims[i];
        if (typeof CSSTransition !== 'undefined' && a instanceof CSSTransition) continue;
        try {
          a.pause();
          a.currentTime = timeMs;
        } catch (err) {}
      }
    }

    window.addEventListener('message', function(e) {
      var d = e.data;
      if (!d || d.type !== '__ai_video_step_progress') return;
      applyProgress(typeof d.progress === 'number' ? d.progress : 0);
      if (typeof d.timeMs === 'number') driveAnimations(d.timeMs);
    });

    // ===== 安全网：中和自计时循环（防御纵深）=====
    // WAAPI 方案下，动画一律由父窗口下发的 timeMs 驱动（见 driveAnimations），
    // 已明令禁止 requestAnimationFrame / setInterval 驱动动画（生成期 prompt 约束 + 校验拦截）。
    // 这里在超时后把它们中和掉，作为"万一漏网"的兜底，避免自计时循环破坏确定性或跑满 CPU。
    // ⚠️ 不再冻结 CSS 动画——它们已被 driveAnimations 逐帧 pause 并钉在 timeMs 相位，冻结会破坏 WAAPI 控制。
    var neutralized = false;
    function neutralizeSelfTimers() {
      if (neutralized) return;
      neutralized = true;
      try {
        window.setInterval = function() { return -1; };
        window.requestAnimationFrame = function() { return 0; };
        for (var i = 1; i < 99999; i++) { clearInterval(i); }
      } catch (e) {}
    }
    setTimeoutOrig(neutralizeSelfTimers, WATCHDOG_MS);

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

    // 收集分步元素并激活第 0 步（首屏立即可见，不必等父窗口第一条进度）
    // ⭐ 同时把所有动画 pause 并钉到 timeMs=0，堵住"父窗口首条进度前动画自由跑"的缺口。
    function initSteps() {
      collectSteps();
      if (hasSteps) applyProgress(0);
      driveAnimations(0);
    }
    if (document.readyState === 'complete') {
      reportSize();
      initSteps();
    } else {
      window.addEventListener('load', function() { reportSize(); initSteps(); });
    }
    // DOM 早于 load 就绪时也尽早收集一次
    setTimeoutOrig(initSteps, 60);
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

/**
 * 为缩略图生成一个无脚本的安全预览壳：
 * - 固定按 1280x720 设计稿尺寸渲染
 * - 父容器通过 transform 整体缩放，确保看到完整分镜
 */
export function wrapHtmlForThumbnail(innerHtml: string): string {
  const extracted = extractHeadAndBody(innerHtml);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=1280, initial-scale=1" />
<style>
  html, body {
    margin: 0;
    padding: 0;
    width: 1280px;
    height: 720px;
    overflow: hidden;
    background: transparent;
  }
  *, *::before, *::after { box-sizing: border-box; }
  .ai-thumb-stage {
    position: relative;
    width: 1280px;
    height: 720px;
    overflow: hidden;
    transform-origin: 0 0;
  }
</style>
${extracted.head}
</head>
<body>
  <div class="ai-thumb-stage">${extracted.body}</div>
</body>
</html>`;
}
