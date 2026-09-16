/**
 * 共享类型定义：项目、视频大纲、分镜、消息等
 */

export type ProjectType = 'image' | 'html';

export type IntentAction =
  | 'edit_outline'
  | 'regenerate_media'
  | 'clarify'
  | 'unknown';

export interface IntentResult {
  action: IntentAction;
  reason: string;
  params: Record<string, unknown>;
}

export interface FrameOutline {
  id: string;
  index: number;
  title: string;
  narration: string;
  imagePrompt?: string;   // image 模式
  // ↓ html 模式：把画面意图拆成正交字段
  visualSummary?: string; // 这一镜要表达什么（核心视觉主张）
  layout?: string;        // 空间构图（元素摆放、主次、留白）
  animation?: string;     // 动作/动效/分步节奏
  transition?: string;    // 如何衔接下一镜（承接上一镜的收尾状态）
  [key: string]: unknown;
}

export interface Outline {
  title: string;
  totalDuration: number;   // 估算总时长（秒）
  globalStyle?: string;    // image 模式：全局画风提示词
  frames: FrameOutline[];
  [key: string]: unknown;
}

/**
 * 创作简报（Creative Brief）：项目的唯一事实来源。
 * 记录“用户到底想要什么”，与生成产物（outline/frame）解耦。
 * 每轮对话只增量更新它，所有大纲生成都从它派生，避免主题漂移。
 */
export interface CreativeBrief {
  topic: string;            // 视频主题（贴合用户原话，宽泛主题不擅自替换成具体案例）
  durationSec?: number;     // 用户明确要求的时长（秒），未指定则空
  targetFrameCount?: number;// 用户明确要求的分镜数，未指定则空
  tone?: string;            // 风格基调，如“极简科普”“活泼”
  audience?: string;        // 目标受众（可空）
  constraints?: string[];   // 其他硬约束，如“不要替换成具体定理案例”
  [key: string]: unknown;
}

export interface FrameSource {
  id: string;              // 对应 outline.frames[i].id
  imagePath?: string;      // /api/data/images/<projectId>/<frameId>.png
  audioPath?: string;      // /api/data/audio/<projectId>/<frameId>.mp3
  audioDuration?: number;  // 秒
  htmlCode?: string;       // html 模式
  [key: string]: unknown;
}

export interface VideoSource {
  frames: FrameSource[];
  [key: string]: unknown;
}

export interface ProjectSummary {
  uuid: string;
  title: string;
  type: ProjectType;
  createdAt: string;
  updatedAt: string;
  hasOutline: boolean;
}

export interface ProjectDetail extends ProjectSummary {
  styleId: string | null;
  outline: Outline | null;
  videoSource: VideoSource | null;
}

export type MessageRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  projectId: string;
  role: MessageRole;
  content: string;
  metadata?: MessageMetadata | null;
  createdAt: string;
}

export type MessageMetadata =
  | { kind: 'text' }
  | { kind: 'pending' }
  | { kind: 'outline'; outline: Outline }
  | { kind: 'frame_progress'; current: number; total: number; frameId?: string }
  | { kind: 'error'; message: string };

export interface StylePreset {
  id: string;              // 雪花 ID
  slug: string;            // 业务 slug，如 "cyber-clean"
  name: string;
  description: string;
  prompt: string;          // 拼接到 HTML 动画 prompt 的风格描述
  demoHtml: string;        // 风格演示 HTML
}
