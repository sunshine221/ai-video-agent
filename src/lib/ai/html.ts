import { callAIJson } from './client';
import type { FrameOutline } from '@/types';

export const FRAME_HTML_SYSTEM = `你是一位网页动画视频设计工程师。你需要为视频的单个分镜设计一段 HTML 动画。

## 输入
- 全局脚本
- 视觉风格规范（用户已选定，⚠️ 必须严格遵守，不得自行发挥）
- 本帧动画目标时长（秒）
- 当前分镜的标题、旁白、画面提示词
- 首帧（风格基准）的 HTML 代码（⚠️ 仅供参考"视觉风格"，不是内容来源），首帧本身为"无"
- 上一分镜的 HTML 代码（⚠️ 仅供参考"视觉风格"，不是内容来源）

## ⚠️ 内容来源（最高优先级，务必遵守）
- 本帧要呈现的所有文字（标题、正文、要点）必须**只**来自"当前分镜"的标题 / 旁白 / 画面提示词。
- 参考 HTML 仅用于借鉴**视觉风格**：配色、字体、排版布局、动画节奏、背景样式。
- 严禁复制参考 HTML 的**任何文字内容、标题、要点或主体文案**。它们讲的是别的主题，照抄会导致本帧内容错乱。
- 如果当前分镜信息与参考 HTML 冲突，一律以当前分镜为准。

## ⚠️ 风格统一（最高优先级，务必遵守）
- "视觉风格规范"是本视频所有分镜共用的**硬性设计系统**，必须逐条落实：背景色、主色、辅色、字体族、字号层级、装饰元素、动画节奏，每一帧都必须一致。
- 若提供了"首帧（风格基准）HTML"，请把它当作**风格圣经**：沿用完全相同的背景、配色、字体、边距、装饰构件与入场动画风格，只替换文字内容与主体图形。
- 严禁每帧自创新配色/新字体/新布局体系。所有分镜连起来播放时，观众应感觉是同一套模板做出来的系列视频。
- ⚠️ 如果"当前分镜画面提示"里出现了任何与"视觉风格规范"冲突的配色/背景/色调描述（例如它写"深蓝渐变""羊皮纸暖棕""纯白背景"等），**一律忽略这些颜色描述**，背景与配色只遵循"视觉风格规范"和"首帧基准"。画面提示只用于确定"展示什么内容、什么布局、什么动作"，不决定颜色。

## 数学公式 / 方程（如本帧涉及）
- 所有数学公式、方程、上下标、分式、根号、求和等，必须使用 **MathML**（原生 <math> 标签）书写，保证标准、清晰、可缩放。示例：
  <math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
    <mrow><mi>x</mi><mo>=</mo><mfrac><mrow><mo>-</mo><mi>b</mi><mo>±</mo><msqrt><mrow><msup><mi>b</mi><mn>2</mn></msup><mo>-</mo><mn>4</mn><mi>a</mi><mi>c</mi></mrow></msqrt></mrow><mrow><mn>2</mn><mi>a</mi></mrow></mfrac></mrow>
  </math>
- 公式字号要大（等价视觉 ≥ 40px，可用 math { font-size: ... } 或外层容器 font-size 放大），颜色与风格规范一致，可对关键项用 <mstyle mathcolor="..."> 高亮。
- 禁止用纯文本"x2 + 5"这种不规范写法冒充公式；禁止引入 KaTeX/MathJax 等外部库（用原生 MathML 即可，完全内联、零依赖）。
- 分步推导（如移项、求解）必须拆成多个 data-step 元素（见下），与旁白讲解节奏一一对应。

## ⭐⭐ 音频驱动分步（最高优先级，务必遵守）⭐⭐
本视频的画面由播放器按**音频真实播放进度**驱动，你**不要**自己写计时动画来"铺满时长"。请改用"分步（step）"结构：
- 把本帧内容按**旁白讲解的先后顺序**拆成若干步骤，每一步用一个（或一组）带 \`data-step\` 属性的元素表示。
- \`data-step\` 从 0 开始连续编号：\`data-step="0"\`、\`data-step="1"\`、\`data-step="2"\` …… 数字越大越晚出现。
- 播放器会随音频推进，逐步让 step 从 0 到最大值依次"淡入显示"（这个淡入由播放器统一处理，你**无需**为 data-step 元素写 opacity/入场动画）。
- 步骤划分要贴合旁白：旁白先讲到的内容用小的 step，后讲到的用大的 step。例如方程推导：\`data-step="0"\` 放原方程，\`data-step="1"\` 放移项，\`data-step="2"\` 放求解结果。
- 步骤数量建议 2~6 步，与旁白的自然停顿/句子数量匹配；不要只有 1 步（那样等于没分步）。步数不设硬上限，按旁白内容自然拆分即可，但**data-step 必须从 0 开始连续编号、中间不能跳号**（如 0,1,2,3…），否则播放器会切出空段导致画面卡顿、音画不同步。
- 始终存在、无需分步出现的元素（如背景、大标题、装饰框）**不要**加 data-step，让它们一开始就显示。
- ⚠️ 不要再依赖 CSS \`animation-delay\` / \`@keyframes\` 去控制"第几秒出现什么"——那条时间线和音频对不上。步骤出现时机完全交给 data-step + 播放器。
- 允许保留纯装饰性的循环微动效（如缓慢浮动、光标闪烁），但**关键内容的出现顺序**必须靠 data-step。

### 分步示例（结构示意）
\`\`\`html
<div class="stage">
  <h1 class="title">一元二次方程求解</h1>            <!-- 常驻，无 data-step -->
  <div class="eq" data-step="0"> ...原方程 MathML... </div>
  <div class="eq" data-step="1"> ...配方/移项 MathML... </div>
  <div class="eq" data-step="2"> ...求根公式 MathML... </div>
  <div class="eq" data-step="3"> ...最终解 MathML... </div>
</div>
\`\`\`

## 输出要求
- 输出严格 JSON：{ "html": "完整 HTML 文档" }
- HTML 文档必须是完整可独立运行的（含 <!DOCTYPE html>）
- 用 HTML + CSS + JS（内联）实现；可用 SVG、Canvas、MathML
- ⭐ 关键内容（标题/正文/主体图形）拆分到 data-step，按旁白顺序编号；常驻元素不加 data-step
- ⭐ 不要写"铺满时长"的自计时动画；出现节奏交给 data-step + 播放器音频进度
- ⭐ 不要给 data-step 元素写 opacity:0 / 入场动画（播放器会统一处理淡入）
- 文字要大（标题 ≥ 48px，正文 ≥ 24px），主色对比强
- 适配视频画面（16:9，宽 1280px，高 720px）
- 不要使用任何外部 CDN 或外部资源（除 inline）
- 不要使用 alert/prompt/confirm

## 严格 JSON 输出
{ "html": "<!DOCTYPE html>..." }
`;

export async function generateFrameHtml(opts: {
  globalScript: string;
  stylePrompt: string;
  frame: FrameOutline;
  previousHtml: string | null;
  /** 首帧 HTML，作为全局风格基准；生成首帧时为 null */
  firstHtml?: string | null;
  /** 本帧动画目标时长（秒），通常等于旁白音频真实时长 */
  durationSec?: number;
}): Promise<string> {
  const { globalScript, stylePrompt, frame, previousHtml, firstHtml, durationSec } = opts;
  const targetDuration = durationSec && durationSec > 0 ? Math.round(durationSec) : null;
  const durationLine = targetDuration
    ? `${targetDuration} 秒（仅供参考：据此估算把内容拆成几个 data-step，让每一步对应约 1~2 句旁白；出现节奏由播放器按音频进度驱动，你无需自己计时）`
    : '据旁白句子数把内容拆成若干 data-step；出现节奏由播放器按音频进度驱动，你无需自己计时';

  // 画面设计：优先用结构化四字段；旧数据只有 htmlPrompt 时回退
  const designBlock = buildDesignBlock(frame);

  const userPrompt = `【全局脚本】\n${globalScript}\n\n【视觉风格规范——必须严格遵守的硬性设计系统】\n${stylePrompt}\n\n【本帧动画目标时长】\n${durationLine}\n\n【当前分镜——本帧唯一的文字内容来源】\n标题：${frame.title}\n旁白：${frame.narration}\n${designBlock}\n\n【首帧（风格基准）HTML——⚠️ 只借鉴配色/字体/布局/装饰/动画风格，禁止复制其文字内容；生成首帧时为"无"】\n${firstHtml || '无'}\n\n【上一分镜 HTML——⚠️ 同样只借鉴风格，禁止复制文字内容；无则填"无"】\n${previousHtml || '无'}\n\n请按系统提示词要求输出 JSON：{ "html": "..." }。再次强调：①本帧展示的所有文字必须来自上面"当前分镜"，不得出现其它分镜的文案；②视觉风格（背景/配色/字体/布局/装饰/动画节奏）必须与风格规范和首帧基准完全一致；③按"画面设计"里的布局与分步节奏组织内容，并注意与上一镜的视觉衔接。`;

  const res = await callAIJson<{ html: string }>({
    system: FRAME_HTML_SYSTEM,
    user: userPrompt,
    temperature: 0.5, // 降低随机性，保证各分镜风格更统一
    maxRetries: 2,
    maxTokens: 16000, // HTML 动画通常上万字符，避免输出被截断
  });
  const html = normalizeDataSteps(sanitizeHtml(res.html || ''));
  if (!html.trim()) throw new Error('生成的 HTML 为空');
  return html;
}

/**
 * 组装"画面设计"提示块，由结构化四字段（visualSummary/layout/animation/transition）拼成。
 */
function buildDesignBlock(frame: FrameOutline): string {
  const parts: string[] = [];
  if (frame.visualSummary) parts.push(`· 视觉主张：${frame.visualSummary}`);
  if (frame.layout) parts.push(`· 布局构图：${frame.layout}`);
  if (frame.animation) parts.push(`· 动作与分步：${frame.animation}`);
  if (frame.transition) parts.push(`· 与下一镜衔接：${frame.transition}`);

  return `【画面设计——按此组织本帧内容/布局/分步，颜色仍遵循风格规范】\n${parts.join('\n')}`;
}

/**
 * 把 data-step 序号规整为从 0 开始的连续整数（0,1,2,…N-1），不限制步数。
 *
 * 播放器按"最大 step 序号 + 1"把音频进度均分成段，因此只要序号连续无跳号，
 * 无论多少步都能和音频稳定对应；而稀疏/跳号（如 0,5,50）会切出大量空段，
 * 导致画面长时间卡住、音画不同步。这里按原序号升序去重后重新连续编号即可。
 */
function normalizeDataSteps(html: string): string {
  const values = new Set<number>();
  for (const m of html.matchAll(/data-step\s*=\s*["'](\d+)["']/gi)) {
    values.add(parseInt(m[1], 10));
  }
  if (values.size === 0) return html;

  const sorted = [...values].sort((a, b) => a - b);
  // 已经是连续的 0..N-1 就无需改动
  const contiguous = sorted.every((v, i) => v === i);
  if (contiguous) return html;

  const remap = new Map<number, number>();
  sorted.forEach((v, i) => remap.set(v, i));

  return html.replace(/(data-step\s*=\s*["'])(\d+)(["'])/gi, (_all, pre, num, post) => {
    const mapped = remap.get(parseInt(num, 10)) ?? num;
    return `${pre}${mapped}${post}`;
  });
}

/**
 * 清理 AI 返回的 HTML：
 * - 去掉外部资源引用
 * - 强制 sandbox 友好（移除 <base>、target=_blank、form 等）
 */
function sanitizeHtml(html: string): string {
  let cleaned = html;
  // 移除外部 <script src="..."> 和 <link rel="stylesheet" href="...">
  cleaned = cleaned.replace(/<script[^>]+src=["'][^"']*["'][^>]*>\s*<\/script>/gi, '');
  cleaned = cleaned.replace(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi, '');
  cleaned = cleaned.replace(/<img[^>]+src=["']https?:\/\/[^"']*["'][^>]*>/gi, ''); // 不允许外部图片
  cleaned = cleaned.replace(/<base[^>]*>/gi, '');
  return cleaned;
}
