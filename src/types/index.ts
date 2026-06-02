/**
 * 共享类型定义：项目、视频大纲、分镜、消息等
 */

export type ProjectType = 'image' | 'html';

export type IntentAction =
  | 'generate_outline'
  | 'regenerate_outline'
  | 'add_frame'
  | 'delete_frame'
  | 'regenerate_frame'
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
  htmlPrompt?: string;    // html 模式
  [key: string]: unknown;
}

export interface Outline {
  title: string;
  totalDuration: number;   // 估算总时长（秒）
  globalStyle?: string;    // image 模式：全局画风提示词
  frames: FrameOutline[];
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
  | { kind: 'outline'; outline: Outline }
  | { kind: 'frame_progress'; current: number; total: number; frameId?: string }
  | { kind: 'error'; message: string };

export interface StylePreset {
  id: string;
  name: string;
  description: string;
  prompt: string;          // 拼接到 HTML 动画 prompt 的风格描述
  demoHtml: string;        // 风格演示 HTML
}
