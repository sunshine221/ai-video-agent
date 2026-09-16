import { callAIJson } from './client';
import { findBannedAnimations } from './html';
import type { Outline, FrameSource, ProjectType } from '@/types';

/**
 * 全片终检（Review）
 *
 * 在逐帧生成 + 兜底补齐之后运行，从「全片视角」检查并自动修复问题，
 * 保证用户拿到稳定、高质量、无明显错误的成片。
 *
 * 检测分两层：
 *  1) 确定性校验 runDeterministicChecks —— 纯代码，零 AI 成本，最可靠
 *  2) LLM 文本审查 runLlmReview —— 仅 HTML 模式，查排版/内容/风格一致性
 *
 * severity 一律由代码硬判（见 CATEGORY_SEVERITY），LLM 只负责发现问题并归类 category。
 */

/** 问题严重度：simple 可即时修，complex 需整帧重新生成 */
export type IssueSeverity = 'simple' | 'complex';

/** 问题类别 */
export type IssueCategory =
  | 'missing_media'    // 缺画面（htmlCode/imagePath）
  | 'missing_audio'    // 缺旁白音频
  | 'empty_narration'  // 旁白为空
  | 'bad_steps'        // HTML data-step 数量异常
  | 'typo'             // 错别字/标点/文案小瑕疵
  | 'layout'           // 局部排版溢出
  | 'cross_frame'      // 内容串帧（抄了别帧文案）
  | 'style_drift'      // 风格漂移
  | 'banned_animation'; // 含禁用的自计时动画写法（rAF/setInterval/canvas 逐帧），无法被时间轴定格

export interface ReviewIssue {
  frameId: string;
  category: IssueCategory;
  severity: IssueSeverity;
  issue: string;
  /** LLM simple 修复时直接给出的修正后 HTML（仅 typo/layout 且能局部修时存在） */
  fixedHtml?: string;
}

/** data-step 最少步数（少于此值等于没分步，画面会一次性铺满、与旁白脱节）。步数不设上限。 */
export const MIN_STEPS = 2;

/** category → severity 的硬判映射（代码决定，不交给 LLM） */
const CATEGORY_SEVERITY: Record<IssueCategory, IssueSeverity> = {
  missing_media: 'simple',
  missing_audio: 'simple',
  empty_narration: 'complex',
  bad_steps: 'simple',
  typo: 'simple',
  layout: 'simple',
  cross_frame: 'complex',
  style_drift: 'complex',
  banned_animation: 'complex', // 自计时写法需整帧重写，无法局部修
};

export function severityOf(category: IssueCategory): IssueSeverity {
  return CATEGORY_SEVERITY[category];
}

/** 统计 HTML 中不同 data-step 的数量 */
export function countDataSteps(html: string): number {
  const matches = html.matchAll(/data-step\s*=\s*["'](\d+)["']/gi);
  const set = new Set<string>();
  for (const m of matches) set.add(m[1]);
  return set.size;
}
/**
 * 第 1 层：确定性校验（纯代码，零 AI 成本）
 * 逐帧检查媒体产物是否完整、旁白是否为空、HTML 分步是否合理。
 */
export function runDeterministicChecks(
  outline: Outline,
  sources: FrameSource[],
  projectType: ProjectType,
): ReviewIssue[] {
  const issues: ReviewIssue[] = [];

  outline.frames.forEach((frame, idx) => {
    const src = sources[idx];

    // 旁白为空（内容层面缺失，需重生成大纲/整帧）
    if (!frame.narration?.trim()) {
      issues.push(mkIssue(frame.id, 'empty_narration', `第 ${frame.index} 镜旁白为空`));
    }

    // 缺画面产物
    const hasMedia = projectType === 'html' ? !!src?.htmlCode : !!src?.imagePath;
    if (!hasMedia) {
      issues.push(
        mkIssue(
          frame.id,
          'missing_media',
          `第 ${frame.index} 镜缺少${projectType === 'html' ? ' HTML 动画' : '画面图片'}`,
        ),
      );
    }

    // 缺旁白音频 / 时长为 0（音画不同步的常见根因）
    if (frame.narration?.trim() && (!src?.audioPath || !src?.audioDuration || src.audioDuration <= 0)) {
      issues.push(mkIssue(frame.id, 'missing_audio', `第 ${frame.index} 镜缺少旁白音频或时长异常`));
    }

    // HTML 分步过少（少于 MIN_STEPS 等于没分步 → 画面一次性铺满、和旁白脱节）
    // 注：步数不设上限；序号连续性由生成层 normalizeDataSteps 保证。
    if (projectType === 'html' && src?.htmlCode) {
      const steps = countDataSteps(src.htmlCode);
      if (steps < MIN_STEPS) {
        issues.push(
          mkIssue(
            frame.id,
            'bad_steps',
            `第 ${frame.index} 镜 data-step 数量为 ${steps}（至少需要 ${MIN_STEPS} 步），分步动画可能失效`,
          ),
        );
      }

      // 禁用的自计时动画写法（rAF/setInterval/canvas 逐帧）：无法被时间轴精确定格，
      // 会破坏"拖动到任意时刻静态还原 + 导出一致性"。命中即整帧重生成。
      const banned = findBannedAnimations(src.htmlCode);
      if (banned.length > 0) {
        issues.push(
          mkIssue(
            frame.id,
            'banned_animation',
            `第 ${frame.index} 镜含禁用的自计时动画写法（${banned.join('、')}），无法被时间轴定格，需重新生成`,
          ),
        );
      }
    }
  });

  return issues;
}

function mkIssue(frameId: string, category: IssueCategory, issue: string): ReviewIssue {
  return { frameId, category, severity: severityOf(category), issue };
}
const REVIEW_SYSTEM = `你是视频质检专家。下面给你一支「HTML 动画视频」的全部分镜（每帧含旁白与 HTML 代码）以及统一的视觉风格规范。
请从「全片连贯播放」的视角逐帧审查，只找出**确实存在**的问题，不要为了凑数编造问题。

## ⚠️ 绝对禁止（最高优先级，务必遵守）
- 提供给你的 HTML 可能因过长而被**节选**（末尾带有「…(代码过长已节选，后续省略)」标记）。这是为了节省篇幅，**代码本体是完整的**。
- 严禁报告「代码被截断 / 不完整 / 缺少闭合标签 / CSS 或 JS 在中途结束 / 页面无法渲染」这类问题——那只是节选导致的表象，不是真实缺陷。
- 你只依据**可见的文字内容和样式**判断下面四类问题，绝不评价代码是否完整、是否闭合、是否被截断。

## 检查维度与 category 取值（必须严格用下列英文枚举）
- "cross_frame"：本帧 HTML 里出现了**其它分镜**的文字/标题/要点（内容串帧），或本帧文字与本帧旁白主题明显不符。
- "style_drift"：本帧的背景色/主色/字体/布局体系明显偏离「视觉风格规范」或其它帧，连起来播放会有跳脱感。
- "typo"：错别字、标点错误、明显病句等**局部小瑕疵**，改动很小。
- "layout"：局部排版问题，如文字溢出容器、元素重叠、关键内容超出 1280x720 画面，可通过小幅 CSS/结构调整修复。

## 输出要求（严格 JSON）
{ "issues": [ { "frameId": "对应帧id", "category": "上述枚举之一", "issue": "简述问题" } ] }
- 没有问题就返回 { "issues": [] }。
- 不要输出 severity（严重度由系统判定）。
- 每帧最多报最关键的 1~2 个问题，避免噪声。`;

/**
 * 第 2 层：LLM 全片文本审查（仅 HTML 模式）
 * 把所有帧的旁白+HTML+风格规范打包，返回结构化问题列表。severity 在此按 category 硬判补齐。
 */
export async function runLlmReview(
  frames: Array<{ id: string; index: number; title: string; narration: string; htmlCode: string }>,
  stylePrompt: string,
): Promise<ReviewIssue[]> {
  if (frames.length === 0) return [];

  // HTML 可能很长，节选每帧代码以控制 token；风格/内容判断不需要完整代码。
  // ⚠️ 节选时必须显式标注，否则模型会把"人为截断"误判成"代码不完整/被截断"，
  //    反复报假问题、反复无效修复（历史上的死循环根因）。
  const CLIP = 8000;
  const clip = (html: string) =>
    html.length > CLIP
      ? `${html.slice(0, CLIP)}\n\n…(代码过长已节选，后续省略；代码本体完整，请勿以此判断截断/不完整)`
      : html;
  const framesText = frames
    .map(
      f =>
        `── 帧 ${f.index}（frameId=${f.id}）──\n标题：${f.title}\n旁白：${f.narration}\nHTML：\n${clip(f.htmlCode)}`,
    )
    .join('\n\n');

  const user = `【视觉风格规范】\n${stylePrompt}\n\n【全部分镜】\n${framesText}\n\n请按系统提示词输出 JSON。`;

  const res = await callAIJson<{ issues?: Array<{ frameId: string; category: string; issue: string }> }>({
    system: REVIEW_SYSTEM,
    user,
    temperature: 0.2,
    maxRetries: 1,
    maxTokens: 4000,
  });

  const valid: IssueCategory[] = ['cross_frame', 'style_drift', 'typo', 'layout'];
  const known = new Set(frames.map(f => f.id));
  return (res.issues || [])
    .filter(it => it && known.has(it.frameId) && valid.includes(it.category as IssueCategory))
    .map(it => {
      const category = it.category as IssueCategory;
      return { frameId: it.frameId, category, severity: severityOf(category), issue: it.issue || '' };
    });
}

const FIX_SYSTEM = `你是网页动画修复工程师。给你一段分镜 HTML 和一个明确的问题描述，请**在尽量小的改动范围内**修复该问题，保持原有视觉风格、配色、字体、布局与 data-step 结构不变。
只修问题本身，不要重写整个页面，不要改动与问题无关的内容。
输出严格 JSON：{ "html": "修复后的完整 HTML 文档" }。`;

/**
 * simple 级修复：让 LLM 针对单帧问题返回修正后的 HTML（用于 typo / layout）。
 * 失败返回 null，由调用方回退到整帧重生成。
 */
export async function fixSimpleHtml(html: string, issue: string): Promise<string | null> {
  try {
    const res = await callAIJson<{ html: string }>({
      system: FIX_SYSTEM,
      user: `【问题】\n${issue}\n\n【原始 HTML】\n${html}\n\n请输出 JSON：{ "html": "..." }`,
      temperature: 0.3,
      maxRetries: 1,
      maxTokens: 16000,
    });
    const fixed = (res.html || '').trim();
    return fixed || null;
  } catch (err) {
    console.error('[review] simple 修复失败', (err as Error).message);
    return null;
  }
}
