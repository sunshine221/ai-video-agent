import type { StylePreset } from '@/types';

/**
 * 3 套视觉风格预设（demo 都是动画版）。
 * - prompt: 拼接到 HTML 动画生成 prompt 的风格描述
 * - demoHtml: 用于风格选择弹窗的演示 HTML（含动效）
 *
 * 重要约定：**所有风格严禁在画面中显示旁白文字**。旁白由独立的字幕层处理，
 * 画面中只显示可视化元素（数字、图表、装饰、几何元素、动画等）。
 */

// ============================================================
// 1. 科技博主 — Cyber Clean（动画版）
// ============================================================
const cyberCleanDemo = `<!DOCTYPE html>
<html><head><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body {
    background:
      radial-gradient(ellipse at 20% 0%, rgba(56, 189, 248, 0.10), transparent 50%),
      radial-gradient(ellipse at 80% 100%, rgba(168, 85, 247, 0.08), transparent 50%),
      #0a0e1a;
    color: #e2e8f0;
    font-family: 'SF Pro Display', -apple-system, sans-serif;
    padding: 64px 80px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    overflow: hidden;
  }
  .grid {
    position: absolute; inset: 0;
    background-image:
      linear-gradient(rgba(56, 189, 248, 0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(56, 189, 248, 0.04) 1px, transparent 1px);
    background-size: 60px 60px;
    pointer-events: none;
    animation: gridDrift 20s linear infinite;
  }
  @keyframes gridDrift {
    from { background-position: 0 0; }
    to { background-position: 60px 60px; }
  }
  .top { display: flex; justify-content: space-between; align-items: center; position: relative; opacity: 0; animation: fadeIn 600ms 100ms ease-out forwards; }
  .brand { display: flex; align-items: center; gap: 10px; font-size: 14px; letter-spacing: 0.2em; text-transform: uppercase; color: #94a3b8; }
  .brand .dot { width: 8px; height: 8px; border-radius: 50%; background: #38bdf8; box-shadow: 0 0 16px #38bdf8; animation: pulse 2s ease-in-out infinite; }
  @keyframes pulse {
    0%, 100% { box-shadow: 0 0 8px #38bdf8; transform: scale(1); }
    50% { box-shadow: 0 0 24px #38bdf8, 0 0 48px rgba(56,189,248,0.4); transform: scale(1.2); }
  }
  .badge {
    font-family: 'SF Mono', monospace;
    font-size: 12px; color: #38bdf8;
    padding: 6px 14px; border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 4px;
    letter-spacing: 0.1em;
    opacity: 0; animation: fadeIn 600ms 200ms ease-out forwards;
  }
  .center { position: relative; }
  .step {
    font-family: 'SF Mono', monospace;
    font-size: 14px; color: #38bdf8; letter-spacing: 0.3em; margin-bottom: 24px;
    opacity: 0; animation: fadeInUp 600ms 400ms ease-out forwards;
  }
  .title {
    font-size: 96px; font-weight: 700; line-height: 1; letter-spacing: -0.03em;
    background: linear-gradient(135deg, #ffffff 0%, #94a3b8 100%);
    background-size: 200% 200%;
    -webkit-background-clip: text; background-clip: text; color: transparent;
    opacity: 0; animation: fadeInUp 800ms 600ms ease-out forwards, gradientShift 6s 1500ms ease-in-out infinite;
  }
  @keyframes gradientShift {
    0%, 100% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
  }
  .accent-line {
    width: 0; height: 4px;
    background: linear-gradient(90deg, #38bdf8, #a855f7);
    background-size: 200% 100%;
    margin-top: 32px; border-radius: 2px;
    animation: drawLine 600ms 1300ms cubic-bezier(0.4, 0, 0.2, 1) forwards, gradientShift 4s 2000ms ease-in-out infinite;
  }
  @keyframes drawLine { to { width: 80px; } }
  .bottom { display: flex; justify-content: space-between; align-items: end; position: relative; }
  .metric { display: flex; flex-direction: column; gap: 4px; opacity: 0; animation: fadeInUp 600ms ease-out forwards; }
  .metric:nth-child(1) { animation-delay: 1500ms; }
  .metric:nth-child(2) { animation-delay: 1700ms; }
  .metric .num {
    font-size: 56px; font-weight: 700; color: #ffffff;
    font-variant-numeric: tabular-nums;
  }
  .metric .label {
    font-family: 'SF Mono', monospace;
    font-size: 11px; color: #64748b; letter-spacing: 0.2em; text-transform: uppercase;
  }
  .corner {
    position: absolute; width: 0; height: 0;
    border: 2px solid #38bdf8;
    opacity: 0;
  }
  .corner.tl { top: 24px; left: 24px; border-right: none; border-bottom: none; animation: drawCorner 400ms 50ms ease-out forwards; }
  .corner.tr { top: 24px; right: 24px; border-left: none; border-bottom: none; animation: drawCorner 400ms 150ms ease-out forwards; }
  .corner.bl { bottom: 24px; left: 24px; border-right: none; border-top: none; animation: drawCorner 400ms 250ms ease-out forwards; }
  .corner.br { bottom: 24px; right: 24px; border-left: none; border-top: none; animation: drawCorner 400ms 350ms ease-out forwards; }
  @keyframes drawCorner { to { width: 20px; height: 20px; opacity: 1; } }
  @keyframes fadeIn { to { opacity: 1; } }
  @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
</style></head><body>
  <div class="grid"></div>
  <div class="corner tl"></div><div class="corner tr"></div>
  <div class="corner bl"></div><div class="corner br"></div>
  <div class="top">
    <div class="brand"><span class="dot"></span>TECH / INSIGHT</div>
    <div class="badge">EP. 01</div>
  </div>
  <div class="center">
    <div class="step">— FRAME 03 / 12</div>
    <div class="title">科技博主</div>
    <div class="accent-line"></div>
  </div>
  <div class="bottom">
    <div class="metric">
      <div class="num" data-target="3" data-suffix="">0</div>
      <div class="label">CHAPTER</div>
    </div>
    <div class="metric">
      <div class="num" data-target="42" data-suffix="%">0</div>
      <div class="label">PROGRESS</div>
    </div>
  </div>
  <script>
    function countUp(el, target, duration, delay) {
      setTimeout(() => {
        const start = performance.now();
        function tick(now) {
          const p = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          el.textContent = Math.round(target * eased) + (el.dataset.suffix || '');
          if (p < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      }, delay);
    }
    document.querySelectorAll('.num[data-target]').forEach(el => {
      countUp(el, parseInt(el.dataset.target, 10), 1000, 1600);
    });
  </script>
</body></html>`;

// ============================================================
// 2. 黑客风 — Terminal Matrix（动画版）
// ============================================================
const terminalMatrixDemo = `<!DOCTYPE html>
<html><head><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body {
    background:
      radial-gradient(ellipse at center, rgba(0, 255, 65, 0.06), transparent 70%),
      #000000;
    color: #00ff41;
    font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
    padding: 56px 64px;
    display: flex;
    flex-direction: column;
    gap: 24px;
    overflow: hidden;
    position: relative;
  }
  body::before {
    content: '';
    position: absolute; inset: 0;
    background: repeating-linear-gradient(0deg, rgba(0, 255, 65, 0.04) 0px, rgba(0, 255, 65, 0.04) 1px, transparent 1px, transparent 3px);
    pointer-events: none;
    z-index: 1;
  }
  /* 移动扫描线 */
  body::after {
    content: '';
    position: absolute; left: 0; right: 0; top: 0; height: 80px;
    background: linear-gradient(180deg, transparent, rgba(0, 255, 65, 0.15), transparent);
    pointer-events: none;
    z-index: 1;
    animation: scanline 5s linear infinite;
  }
  @keyframes scanline {
    0% { transform: translateY(-80px); }
    100% { transform: translateY(100vh); }
  }
  .window {
    border: 1px solid #00ff41;
    background: rgba(0, 20, 0, 0.4);
    position: relative;
    opacity: 0;
    transform: scaleY(0.9);
    transform-origin: top;
    animation: openWindow 500ms 200ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
    z-index: 2;
  }
  @keyframes openWindow {
    to { opacity: 1; transform: scaleY(1); }
  }
  .titlebar {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 16px;
    border-bottom: 1px solid #00ff41;
    font-size: 12px;
    color: #00ff41;
  }
  .titlebar .dot { width: 10px; height: 10px; border-radius: 50%; background: #00ff41; animation: blink 1s steps(2) infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  .titlebar .name { margin-left: 8px; letter-spacing: 0.1em; }
  .titlebar .right { margin-left: auto; color: #00aa30; font-size: 11px; }
  .titlebar .right::before { content: '> '; }
  .body { padding: 28px 40px; }
  .ascii {
    font-size: 12px; line-height: 1.4;
    color: #00aa30;
    white-space: pre;
    margin-bottom: 24px;
    opacity: 0;
    animation: typeIn 600ms 600ms steps(40) forwards;
    overflow: hidden;
  }
  .ascii .bright { color: #00ff41; }
  @keyframes typeIn { from { opacity: 0; max-height: 0; } to { opacity: 1; max-height: 200px; } }
  .row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 14px 0;
    border-top: 1px dashed rgba(0, 255, 65, 0.2);
    opacity: 0;
    transform: translateX(-10px);
    animation: rowIn 400ms ease-out forwards;
  }
  .row:nth-child(1) { animation-delay: 1200ms; }
  .row:nth-child(2) { animation-delay: 1500ms; }
  .row:nth-child(3) { animation-delay: 1800ms; }
  @keyframes rowIn { to { opacity: 1; transform: translateX(0); } }
  .row .key { font-size: 14px; color: #00ff41; letter-spacing: 0.05em; }
  .row .val { font-size: 14px; color: #ffffff; }
  .status {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) skewX(20deg);
    border: 2px solid #00ff41;
    padding: 32px 64px;
    font-size: 28px; letter-spacing: 0.4em;
    background: rgba(0, 0, 0, 0.85);
    text-align: center;
    opacity: 0;
    z-index: 3;
    animation: glitchIn 1000ms 2200ms cubic-bezier(.36,.07,.19,.97) forwards, statusGlow 2s 3000ms ease-in-out infinite;
  }
  .status::before { content: '> '; color: #00ff41; }
  @keyframes glitchIn {
    0% { opacity: 0; transform: translate(-50%, -50%) skewX(40deg); }
    20% { opacity: 1; transform: translate(-50%, -50%) skewX(-15deg); }
    40% { transform: translate(-50%, -50%) skewX(8deg); }
    60% { transform: translate(-50%, -50%) skewX(-3deg); }
    100% { opacity: 1; transform: translate(-50%, -50%) skewX(0); }
  }
  @keyframes statusGlow {
    0%, 100% { box-shadow: 0 0 12px rgba(0, 255, 65, 0.4), inset 0 0 12px rgba(0, 255, 65, 0.1); }
    50% { box-shadow: 0 0 32px rgba(0, 255, 65, 0.8), inset 0 0 24px rgba(0, 255, 65, 0.2); }
  }
  .footer {
    display: flex; justify-content: space-between;
    font-size: 11px; color: #00aa30; letter-spacing: 0.2em;
    opacity: 0;
    animation: fadeIn 400ms 3000ms ease-out forwards;
    z-index: 2; position: relative;
  }
  @keyframes fadeIn { to { opacity: 1; } }
</style></head><body>
  <div class="window">
    <div class="titlebar">
      <span class="dot"></span>
      <span class="name">~/system/monitor — bash</span>
      <span class="right">READY</span>
    </div>
    <div class="body">
      <div class="ascii"><span class="bright">┌─[</span> SCAN <span class="bright">]─[</span> v3.14 <span class="bright">]─[</span> root@host <span class="bright">]─[</span> /var/log <span class="bright">]</span>
<span class="bright">└─$</span> <span class="bright">monitor --live</span></div>
      <div class="row">
        <span class="key">[ STATUS  ]</span>
        <span class="val">ONLINE  ◉</span>
      </div>
      <div class="row">
        <span class="key">[ UPTIME  ]</span>
        <span class="val">99.997%</span>
      </div>
      <div class="row">
        <span class="key">[ LATENCY ]</span>
        <span class="val">12ms</span>
      </div>
    </div>
  </div>
  <div class="status">HACK MODE</div>
  <div class="footer">
    <span>SYS://OK</span>
    <span>0xDEADBEEF</span>
    <span>PID 1337</span>
  </div>
  <script>
    // 数字 count-up
    const updates = [
      { sel: '.row:nth-child(1) .val', target: 'ONLINE  ◉', delay: 1200 },
      { sel: '.row:nth-child(2) .val', target: '99.997%', delay: 1500 },
      { sel: '.row:nth-child(3) .val', target: '12ms', delay: 1800 },
    ];
    updates.forEach(({ sel, target, delay }) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const original = el.textContent;
      el.textContent = '';
      setTimeout(() => {
        let i = 0;
        const interval = setInterval(() => {
          if (i < target.length) {
            el.textContent = target.slice(0, ++i);
          } else {
            clearInterval(interval);
          }
        }, 30);
      }, delay);
    });
  </script>
</body></html>`;

// ============================================================
// 3. 暖色系 — Warm Story（动画版）
// ============================================================
const warmStoryDemo = `<!DOCTYPE html>
<html><head><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body {
    background:
      radial-gradient(ellipse at top right, rgba(251, 191, 36, 0.15), transparent 60%),
      radial-gradient(ellipse at bottom left, rgba(244, 114, 182, 0.10), transparent 50%),
      #faf6ed;
    color: #2a1810;
    font-family: 'Georgia', 'Songti SC', serif;
    padding: 80px 96px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    overflow: hidden;
  }
  .top { display: flex; align-items: center; gap: 14px; opacity: 0; animation: fadeIn 1000ms 200ms ease-out forwards; }
  .sun {
    width: 36px; height: 36px; border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, #fbbf24, #f59e0b);
    animation: sunGlow 4s ease-in-out infinite 1500ms;
  }
  @keyframes sunGlow {
    0%, 100% { box-shadow: 0 0 32px rgba(251, 191, 36, 0.4); transform: scale(1); }
    50% { box-shadow: 0 0 64px rgba(251, 191, 36, 0.7); transform: scale(1.08); }
  }
  .brand {
    font-size: 13px; letter-spacing: 0.4em; text-transform: uppercase;
    color: #92400e; font-family: -apple-system, sans-serif; font-weight: 500;
  }
  .chapter {
    font-size: 14px; letter-spacing: 0.2em; text-transform: uppercase;
    color: #b45309; font-family: -apple-system, sans-serif; font-weight: 500;
  }
  .middle { max-width: 80%; }
  .ornament {
    display: flex; align-items: center; gap: 16px; margin-bottom: 24px;
    opacity: 0;
  }
  .ornament .line {
    width: 56px; height: 1px; background: #d97706;
    transform: scaleX(0);
    transform-origin: left;
    animation: drawLine 800ms 800ms ease-out forwards;
  }
  .ornament .line:last-child { transform-origin: right; animation-delay: 900ms; }
  .ornament .star {
    color: #d97706; font-size: 14px; opacity: 0;
    animation: fadeIn 400ms 1500ms ease-out forwards, starTwinkle 3s 2000ms ease-in-out infinite;
  }
  @keyframes drawLine { to { transform: scaleX(1); } }
  @keyframes starTwinkle {
    0%, 100% { transform: scale(1) rotate(0deg); }
    50% { transform: scale(1.3) rotate(15deg); }
  }
  .title {
    font-size: 88px; font-weight: 400; line-height: 1.05; letter-spacing: -0.02em;
    color: #2a1810;
    opacity: 0;
    transform: translateY(20px);
    animation: fadeInUp 1500ms 1100ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
  }
  .title em { font-style: italic; color: #b45309; }
  .accent {
    margin-top: 40px;
    width: 120px; height: 2px;
    background: linear-gradient(90deg, #f59e0b, #f472b6);
    background-size: 200% 100%;
    transform: scaleX(0);
    transform-origin: left;
    animation: drawLine 800ms 2200ms ease-out forwards, gradientShift 4s 3000ms ease-in-out infinite;
  }
  @keyframes gradientShift {
    0%, 100% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
  }
  .bottom { display: flex; justify-content: space-between; align-items: end; }
  .info { display: flex; flex-direction: column; gap: 6px; opacity: 0; animation: fadeIn 800ms 2400ms ease-out forwards; }
  .info .key { font-size: 11px; letter-spacing: 0.3em; text-transform: uppercase; color: #92400e; font-family: -apple-system, sans-serif; }
  .info .val { font-size: 18px; color: #2a1810; font-family: -apple-system, sans-serif; }
  .page {
    font-size: 14px; color: #92400e; font-family: -apple-system, sans-serif;
    letter-spacing: 0.1em;
    opacity: 0; animation: fadeIn 800ms 2600ms ease-out forwards;
  }
  .circle-deco {
    position: absolute; top: -100px; right: -100px;
    width: 400px; height: 400px; border-radius: 50%;
    border: 1px solid rgba(217, 119, 6, 0.15);
    transform: scale(0);
    animation: expandCircle 1500ms 300ms ease-out forwards;
  }
  .circle-deco.inner {
    top: -60px; right: -60px;
    width: 320px; height: 320px;
    border-color: rgba(217, 119, 6, 0.25);
    animation: expandCircle 1500ms 600ms ease-out forwards;
  }
  @keyframes expandCircle { to { transform: scale(1); } }
  @keyframes fadeIn { to { opacity: 1; } }
  @keyframes fadeInUp { to { opacity: 1; transform: translateY(0); } }
</style></head><body>
  <div class="circle-deco"></div>
  <div class="circle-deco inner"></div>
  <div class="top">
    <div class="sun"></div>
    <div class="brand">Sunset Stories</div>
  </div>
  <div class="middle">
    <div class="ornament">
      <span class="line"></span>
      <span class="star">✦</span>
      <span class="line"></span>
    </div>
    <div class="title">暖色<em>时光</em></div>
    <div class="accent"></div>
  </div>
  <div class="bottom">
    <div class="info">
      <div class="key">EPISODE</div>
      <div class="val">No. 03</div>
    </div>
    <div class="page">— 03 / 12 —</div>
  </div>
</body></html>`;

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'cyber-clean',
    name: '科技博主',
    description: '深色高级感 + 青色霓虹 + 卡片化布局，适合测评、深度讲解、科技分享',
    prompt: `【视觉风格：科技博主（Cyber Clean）】

整体气质：现代科技 YouTuber / 评测视频的深色高级感，干净克制、信息密度高。

【配色】
- 背景：#0a0e1a 深蓝黑（不要纯黑）
- 主色：#38bdf8 天蓝（强调线、关键数字、角标）
- 辅色：#a855f7 紫色（渐变收尾）
- 文字：#ffffff 主标题、#94a3b8 次要、#64748b 标签
- 不要暖色，不要高饱和的红色/绿色

【字体】
- 标题：-apple-system / Inter Bold，字重 700，字号 80-120px
- 副信息：'SF Mono' / 'JetBrains Mono' monospace，letter-spacing 0.1-0.3em
- 数字：使用 tabular-nums 对齐

【布局与元素】
- 顶部：左上角品牌点（8px 高亮圆 + 全大写小字品牌名），右上角 EP 编号徽章
- 中心：一个或两个大数字 / 大单词居中或左对齐，下方 80x4px 渐变 accent line
- 底部：左右各一个 metric（数字 + 大写小标签）
- 四角：用 20px L 形 corner 装饰（用 border 模拟）
- 背景：60px 网格线（rgba(56,189,248,0.04)）

【动画】
- 元素依次淡入（50-150ms 错峰）
- 数字从 0 滚动到目标值（count-up 1 秒）
- accent line 从 0 宽度展开
- corner 装饰从中心向外扩展
- 品牌点呼吸光晕（持续）
- 标题渐变色缓慢平移

【绝对禁止】
- 不要在画面中显示任何旁白文字 / 句子 / 段落！旁白由独立字幕层渲染
- 画面中只显示：数字、单词、图标、装饰、几何元素、品牌标识、章节号
- 禁止使用大段正文段落`,
    demoHtml: cyberCleanDemo,
  },
  {
    id: 'terminal-matrix',
    name: '黑客风',
    description: '终端控制台 + 霓虹绿 + ASCII 边框 + 闪烁光标，适合技术演示、极客内容',
    prompt: `【视觉风格：黑客风（Terminal Matrix）】

整体气质：电影级黑客终端，Matrix 绿 + 命令行界面 + 闪烁光标 + 监控仪表盘感。

【配色】
- 背景：#000000 纯黑（可加极淡的中央径向绿色光晕 0.05 alpha）
- 主色：#00ff41 霓虹绿（主文字、边框、状态点）
- 辅色：#00aa30 暗绿（次要文字、注释、虚线）
- 强调：#ffffff 纯白（关键数值、状态徽章）
- 不要任何暖色、紫红

【字体】
- 全部用 monospace：'JetBrains Mono' / 'Fira Code' / 'Courier New'
- 字符间距 0.05-0.2em
- 等宽对齐，数字用 tabular-nums

【布局与元素】
- 主体：1-2 个 "终端窗口"（带顶部 titlebar：3 个圆点 + 路径名 + 状态）
- titlebar 格式：● ~/path/to/dir — bash          [ READY ]
- 窗口边框：1px 实线 #00ff41，背景 rgba(0,20,0,0.4)
- 内部内容：每行是 标签 + 冒号 + 值，标签 [ UPTIME ] / [ STATUS ] / [ LATENCY ] 等
- 中心可放一个大的状态徽章：边框 + 大字（如 "ACCESS GRANTED" / "HACK MODE" / "0xDEADBEEF"）
- 顶部 1-2 行 ASCII 艺术分隔线（用 ┌─┐│└─┘ 这些 Unicode 字符）
- 底部：状态条（三段式：SYS://OK · 0xDEADBEEF · PID 1337）
- 全屏叠加：水平 scanline（repeating-linear-gradient 0.03 alpha 1px 间距 3px）

【动画】
- 闪烁光标（1s 步进 animation）
- 文字从左到右"打字机"出现（width 0→100% + steps() 时序）
- 数字快速滚动变化
- 边框从中心向两侧"扫描"展开
- 状态徽章 glitch 出现（扭曲+回正）
- 移动 scanline 扫描线（持续，5s 一个循环）

【绝对禁止】
- 不要在画面中显示任何旁白文字 / 句子 / 段落！旁白由独立字幕层渲染
- 画面中只显示：终端窗口、ASCII 装饰、十六进制、状态标签、命令提示符
- 禁止使用衬线字体、禁止使用任何暖色`,
    demoHtml: terminalMatrixDemo,
  },
  {
    id: 'warm-story',
    name: '暖色系',
    description: '奶油米色 + 暖橘琥珀 + 优雅衬线 + 大量留白，适合 Vlog、生活方式、文化故事',
    prompt: `【视觉风格：暖色系（Warm Story）】

整体气质：生活方式 Vlog、文化故事、人文纪录。奶油色基底 + 暖橘琥珀 + 优雅衬线字体 + 杂志版式大量留白。

【配色】
- 背景：#faf6ed 奶油米色（不要纯白）
- 文字主：#2a1810 深咖啡
- 文字次：#92400e 焦糖棕
- 强调：#b45309 琥珀橙
- 渐变收尾：#f59e0b → #f472b6（暖橘到桃粉）
- 装饰：暖金色 #d97706
- 不要冷色（蓝、紫、青）、不要纯黑

【字体】
- 标题：'Georgia' / 'Songti SC' / 衬线，字重 400（不要 bold）
- 强调字：斜体 italic，颜色琥珀
- 副信息：-apple-system / sans-serif，letter-spacing 0.2-0.4em 大写
- 数字：tabular-nums

【布局与元素】
- 顶部：左上角"小太阳"圆形（径向渐变 #fbbf24 → #f59e0b，带柔光阴影）+ 品牌名
- 中心：大标题（衬线 80-100px，行高 1.05），标题中可加 <em>斜体强调词</em>
- 标题上方装饰：56px 横线 + ✦ 星号 + 56px 横线
- 标题下方：120x2px 暖橘到桃粉渐变线
- 右上：EP 编号 / 章节号
- 底部：左下 EPISODE No.xx，右下 — 03 / 12 — 进度
- 背景：右上和左下各一个超大圆形轮廓装饰（400px 直径、1px 暖色描边、低饱和）
- 大量留白：padding 80-100px

【动画】
- 元素优雅淡入（800-1500ms 慢速，比科技风慢一倍以上）
- 标题逐字出现（每个字延迟 50ms）或整体淡入上移
- 装饰圆环从 0 半径扩展
- 横线从中心向两端展开
- 太阳呼吸光晕（持续）
- ✦ 星号缓慢旋转缩放
- 渐变线缓慢平移变色
- 整体节奏舒缓，不要快切

【绝对禁止】
- 不要在画面中显示任何旁白文字 / 句子 / 段落！旁白由独立字幕层渲染
- 画面中只显示：标题单词、数字、装饰元素、章节号、品牌标识
- 禁止使用 monospace 字体、禁止使用任何冷色`,
    demoHtml: warmStoryDemo,
  },
];

export function getStyleById(id?: string | null): StylePreset | undefined {
  if (!id) return undefined;
  return STYLE_PRESETS.find(s => s.id === id);
}

export function getDefaultStyle(): StylePreset {
  return STYLE_PRESETS[0];
}
