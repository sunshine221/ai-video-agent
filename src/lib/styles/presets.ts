import type { StylePreset } from '@/types';

/**
 * 3 套内置视觉风格。
 * - prompt: 拼接到 HTML 动画生成 prompt 的风格描述
 * - demoHtml: 用于风格选择弹窗的演示 HTML
 */

const glassmorphismDemo = `<!DOCTYPE html>
<html><head><style>
body { margin:0; background: linear-gradient(135deg,#667eea 0%,#764ba2 100%); display:flex; align-items:center; justify-content:center; height:100vh; font-family: -apple-system,sans-serif; }
.card { backdrop-filter: blur(20px); background: rgba(255,255,255,0.2); border:1px solid rgba(255,255,255,0.3); border-radius:24px; padding:48px 64px; color:#fff; box-shadow: 0 8px 32px rgba(0,0,0,0.2); text-align:center; }
h1 { font-size: 48px; margin: 0 0 12px 0; font-weight:700; letter-spacing:-0.02em; }
p { font-size: 20px; opacity:0.9; margin:0; }
@keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
.card { animation: float 3s ease-in-out infinite; }
</style></head><body>
<div class="card">
  <h1>玻璃拟态</h1>
  <p>Glassmorphism · 透明 / 模糊 / 渐变</p>
</div>
</body></html>`;

const minimalistDemo = `<!DOCTYPE html>
<html><head><style>
body { margin:0; background:#FAFAF7; display:flex; align-items:center; justify-content:center; height:100vh; font-family: 'PingFang SC', -apple-system, sans-serif; }
.box { text-align:left; max-width: 720px; padding: 0 64px; }
.kicker { color:#999; font-size:14px; letter-spacing:0.2em; text-transform:uppercase; margin-bottom:24px; }
h1 { color:#1a1a1a; font-size:88px; line-height:1.05; margin:0 0 24px 0; font-weight:600; letter-spacing:-0.03em; }
.line { width:64px; height:3px; background:#1a1a1a; margin: 0 0 24px 0; }
p { color:#666; font-size:24px; line-height:1.6; margin:0; }
@keyframes draw { from { width: 0; } to { width: 64px; } }
.line { animation: draw 1.2s ease-out forwards; }
</style></head><body>
<div class="box">
  <div class="kicker">EPISODE 01</div>
  <h1>极简直描</h1>
  <div class="line"></div>
  <p>留白 · 节奏 · 克制</p>
</div>
</body></html>`;

const datavizDemo = `<!DOCTYPE html>
<html><head><style>
body { margin:0; background:#0F172A; display:flex; align-items:center; justify-content:center; height:100vh; font-family: -apple-system, sans-serif; }
.stage { display:flex; align-items:flex-end; gap:24px; height:240px; }
.bar { width: 60px; background: linear-gradient(180deg,#60A5FA,#3B82F6); border-radius:8px 8px 0 0; animation: rise 1.5s ease-out forwards; transform-origin: bottom; }
.bar:nth-child(1) { height: 40%; }
.bar:nth-child(2) { height: 65%; }
.bar:nth-child(3) { height: 85%; }
.bar:nth-child(4) { height: 55%; }
.bar:nth-child(5) { height: 75%; }
@keyframes rise { from { transform: scaleY(0); opacity: 0; } to { transform: scaleY(1); opacity: 1; } }
.label { color:#94A3B8; text-align:center; margin-top:12px; font-size:14px; }
.title { color:#fff; font-size:32px; font-weight:700; text-align:center; margin-bottom:32px; letter-spacing:-0.02em; }
</style></head><body>
<div>
  <div class="title">数据可视化</div>
  <div class="stage">
    <div><div class="bar"></div><div class="label">Q1</div></div>
    <div><div class="bar"></div><div class="label">Q2</div></div>
    <div><div class="bar"></div><div class="label">Q3</div></div>
    <div><div class="bar"></div><div class="label">Q4</div></div>
    <div><div class="bar"></div><div class="label">Q5</div></div>
  </div>
</div>
</body></html>`;

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'glassmorphism',
    name: '玻璃拟态',
    description: '透明 + 模糊 + 渐变背景，富有未来感，适合科技/AI 主题',
    prompt: `【视觉风格：玻璃拟态（Glassmorphism）】
- 背景：柔和的彩色渐变（蓝紫 / 粉橙 / 青绿等）
- 卡片：半透明白色 (rgba(255,255,255,0.2)) + backdrop-filter: blur(20px)
- 圆角大（16-32px），边框 1px 半透明白
- 阴影柔和：0 8px 32px rgba(0,0,0,0.2)
- 文字白色为主，大字号（48px+）
- 动效：缓慢悬浮 / 渐入`,
    demoHtml: glassmorphismDemo,
  },
  {
    id: 'minimalist',
    name: '极简直描',
    description: '大量留白 + 衬线感字体 + 黑白对比，适合知识讲解、播客类',
    prompt: `【视觉风格：极简直描（Minimalist）】
- 背景：纯白或米色 (#FAFAF7)
- 主色：纯黑 (#1a1a1a) 文字 + 灰色辅助 (#666 / #999)
- 字体：无衬线大字号（标题 80-100px，正文 24-32px）
- 大量留白：padding 64-96px
- 装饰：3px 短横线 + 大写英文小标
- 动效：短横线绘制 / 文字淡入`,
    demoHtml: minimalistDemo,
  },
  {
    id: 'dataviz',
    name: '数据可视化',
    description: '深色背景 + 蓝紫霓虹色 + 图表动画，适合数据 / 商业分析',
    prompt: `【视觉风格：数据可视化（Data Viz）】
- 背景：深色 (#0F172A / #111827)
- 主色：渐变蓝紫 (#60A5FA → #3B82F6)，霓虹高亮
- 元素：柱状图 / 折线 / 数字 / 进度环
- 数字字号大（72px+），等宽字体
- 动效：柱状图从底部上升 / 数字滚动 / 线条绘制
- 网格线：淡淡的 1px rgba(255,255,255,0.1)`,
    demoHtml: datavizDemo,
  },
];

export function getStyleById(id?: string | null): StylePreset | undefined {
  if (!id) return undefined;
  return STYLE_PRESETS.find(s => s.id === id);
}

export function getDefaultStyle(): StylePreset {
  return STYLE_PRESETS[0];
}
