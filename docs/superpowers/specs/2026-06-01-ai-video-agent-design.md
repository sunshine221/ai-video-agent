# AI 视频制作智能体（AI Video Agent）— 设计文档

**日期**：2026-06-01
**项目根目录**：`/Users/xuanyuan/Documents/AI-Program/minimax_test/M3/ai-video-test`
**目标**：基于训练营5天学习文档，开发一个 B/S 模式的 AI 视频制作智能体网站。

---

## 1. 概述

### 1.1 业务目标
用户通过 Web 页面输入提示词，由 AI 自动完成"视频脚本 → 分镜拆分 → 分镜画面 → 旁白语音 → 播放预览"的完整视频生产流程。

### 1.2 支持的创作模式
- **图片轮播模式**（image mode）：每个分镜画面是 AI 生成的图片，多张图片 + 旁白 + 字幕 + 淡入淡出转场组成视频。
- **HTML 动画模式**（html mode）：每个分镜画面是 AI 生成的网页动画（HTML/CSS/JS/SVG/Canvas），多个网页动画 + 旁白 + 字幕组成视频。

### 1.3 用户旅程
```
首页（选择模式）
  → 点击"开始创作"
  → 创建项目（Loading）→ 跳转到创作页
  → 右侧输入"给我做一个介绍黑洞的视频"
  → 看到 AI 返回的视频大纲（卡片形式）
  → 点击"一键生成分镜"
  → 看到分镜小卡片逐个点亮（图片/HTML + 音频）
  → 点击播放按钮 → 看到带字幕的预览
  → （MVP 不做）录屏导出
```

### 1.4 范围边界
- ✅ 范围内：5 天文档中所有功能。
- ❌ 范围外：录屏导出（按钮保留为占位）、用户登录鉴权（单用户本地使用）、商业化计费、分布式部署。

---

## 2. 技术栈

| 维度 | 选型 | 理由 |
| --- | --- | --- |
| 前端框架 | Next.js 14 App Router | 训练营指定；前后端同仓库；天然支持流式 |
| 语言 | TypeScript | 类型安全 |
| 样式 | Tailwind CSS + shadcn/ui | 现代化、定制性强 |
| ORM | Prisma | 类型安全、迁移友好、文档齐全 |
| 数据库 | MySQL | 训练营指定 |
| 客户端状态 | TanStack Query (React Query) | 缓存、重试、乐观更新 |
| 全局状态 | Zustand | 轻量、用于创作页选中状态 |
| AI SDK | openai npm 包 + 自定义 baseURL | OpenAI 兼容协议，可指向中转站 |
| TTS | OpenAI 兼容 `/audio/speech` 接口 | 复用 AI_BASE_URL |
| 图片生成 | evolink.ai z-image-turbo | 文档指定；性价比高 |
| 字体 | next/font (Inter + Noto Sans SC) | 浅色主题字体 |
| 测试 | Vitest | 单测 + 集成测试 |

---

## 3. 架构

### 3.1 目录结构
```
ai-video-test/
├── prisma/
│   └── schema.prisma
├── public/
│   └── styles-demo/             # 3套风格HTML demo
├── data/                        # 本地存储
│   ├── images/<projectId>/      # 分镜图片
│   └── audio/<projectId>/       # 旁白音频
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx             # 首页
│   │   ├── projects/[id]/page.tsx
│   │   └── api/
│   │       ├── projects/
│   │       │   ├── route.ts                  # POST 创建
│   │       │   └── [id]/
│   │       │       ├── route.ts              # GET/PATCH/DELETE
│   │       │       └── messages/route.ts      # GET 对话历史
│   │       ├── agent/chat/route.ts           # 意图分析入口
│   │       ├── outline/route.ts              # 大纲生成
│   │       ├── frames/
│   │       │   ├── image/route.ts            # 图片模式生成分镜
│   │       │   ├── image/abort/route.ts       # 中断信号
│   │       │   ├── html/route.ts             # HTML模式生成分镜
│   │       │   └── html/abort/route.ts
│   │       └── tts/route.ts                   # 单分镜TTS（内部调用）
│   ├── components/
│   │   ├── home/                # 首页卡片
│   │   ├── studio/              # 创作页三栏
│   │   │   ├── ProjectList.tsx
│   │   │   ├── PreviewPanel.tsx
│   │   │   ├── StoryboardStrip.tsx
│   │   │   ├── PlayerBar.tsx
│   │   │   └── SplitLayout.tsx  # 可拖拽分栏
│   │   ├── chat/                # 消息气泡 + 大纲卡片
│   │   ├── storyboard/          # 单个分镜卡
│   │   ├── player/              # 播放组件
│   │   ├── subtitle/            # 字幕层
│   │   ├── outline/             # 完整大纲弹窗
│   │   ├── style-picker/        # 风格选择弹窗
│   │   └── ui/                  # shadcn 基础
│   ├── lib/
│   │   ├── db.ts                # Prisma client
│   │   ├── ai/
│   │   │   ├── client.ts        # OpenAI 兼容客户端
│   │   │   ├── intent.ts        # 意图分析
│   │   │   ├── outline.ts       # 大纲生成
│   │   │   ├── image.ts         # z-image-turbo
│   │   │   ├── html.ts          # HTML动画
│   │   │   └── tts.ts           # TTS
│   │   ├── prompts/             # 系统提示词
│   │   │   ├── intent.ts
│   │   │   ├── outline-image.ts
│   │   │   ├── outline-html.ts
│   │   │   └── frame-html.ts
│   │   ├── styles/              # 3套风格
│   │   │   ├── glassmorphism.ts
│   │   │   ├── minimalist.ts
│   │   │   └── dataviz.ts
│   │   ├── subtitle.ts          # 字幕切片算法
│   │   └── utils/
│   ├── hooks/                   # React Query hooks
│   ├── types/                   # 共享 TS 类型
│   ├── stores/                  # Zustand stores
│   └── providers/
├── .env.example
├── package.json
└── README.md
```

### 3.2 数据流
```
浏览器 (React + RQ)
   │ fetch /api/* (Next.js Route Handlers)
   ▼
服务端 (lib/ai/*)
   │ openai sdk
   ▼
AI 中转站 (gemini-3-flash-preview)
   │ JSON 返回
   ▼
Prisma → MySQL (项目/消息)
   │
文件存储 (data/images, data/audio)
```

### 3.3 关键运行机制
- **Abort 标志**：图片/HTML 分镜生成用内存 Map 存 `Map<projectId, AbortController>`，用户点中断时调 `abort()`。
- **进度推送**：使用 SSE（`text/event-stream`）推送生成进度给前端。失败时降级为轮询。
- **HTML 沙箱渲染**：iframe + `sandbox="allow-scripts"` + `srcdoc`，禁止同源访问。

---

## 4. 数据模型

### 4.1 Prisma schema（核心）
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

model Project {
  uuid        String   @id @default(uuid())
  title       String
  type        String   // "image" | "html"
  styleId     String?  // HTML 模式：选中的风格 id
  outline     Json?    // {title, totalDuration, frames: [{id, index, title, narration, imagePrompt, htmlPrompt}]}
  videoSource Json?    // {frames: [{id, imagePath, audioPath, htmlCode, audioDuration}]}
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  messages    Message[]

  @@index([createdAt])
}

model Message {
  id        String   @id @default(uuid())
  projectId String
  role      String   // "user" | "assistant"
  content   String   @db.Text
  metadata  Json?    // 大纲卡片/分镜卡片的结构化数据
  createdAt DateTime @default(now())
  project   Project  @relation(fields: [projectId], references: [uuid], onDelete: Cascade)

  @@index([projectId, createdAt])
}
```

### 4.2 outline JSON 结构
```typescript
type Outline = {
  title: string;
  totalDuration: number;       // 估算总时长（秒）
  globalStyle?: string;        // image 模式：全局画风提示词
  frames: Array<{
    id: string;                // uuid
    index: number;             // 1-based
    title: string;
    narration: string;         // 旁白逐字稿
    imagePrompt?: string;      // image 模式
    htmlPrompt?: string;       // html 模式
  }>;
};
```

### 4.3 videoSource JSON 结构
```typescript
type VideoSource = {
  frames: Array<{
    id: string;                // 对应 outline.frames[i].id
    imagePath?: string;        // /data/images/<projectId>/<frameId>.png
    audioPath?: string;        // /data/audio/<projectId>/<frameId>.mp3
    audioDuration?: number;    // 秒
    htmlCode?: string;         // HTML 模式
  }>;
};
```

### 4.4 SQL 建表脚本（Prisma migrate 自动生成，README 中复制一份）

---

## 5. 核心模块设计

### 5.1 AI 客户端（lib/ai/client.ts）
```typescript
import OpenAI from 'openai';

export const aiClient = new OpenAI({
  apiKey: process.env.AI_API_KEY!,
  baseURL: process.env.AI_BASE_URL!,
});

export const DEFAULT_MODEL = process.env.AI_MODEL || 'gemini-3-flash-preview';
```
- 所有 AI 调用复用此 client。
- 自定义 baseURL 让用户接入中转站。

### 5.2 意图分析（lib/ai/intent.ts）
**输入**：用户提示词 + 当前项目上下文（已有大纲？多少分镜？）
**输出**：
```typescript
type IntentResult = {
  action: 'generate_outline' | 'regenerate_outline' | 'add_frame'
        | 'delete_frame' | 'regenerate_frame' | 'unknown';
  reason: string;
  params: Record<string, any>;
};
```
**系统提示词要点**：
- 告知 AI 它是视频创作智能体。
- 列出可识别的 action（每种含典型样例 prompt）。
- 要求 AI 严格按 JSON Schema 返回。
- 包含"其他指令" → `action: "unknown"`，reason 友好解释。

**实现要点**：
- 用 `response_format: { type: 'json_object' }` 强制 JSON 输出。
- 解析失败 → 二次重试 + 容错 prompt。
- 二次失败 → 返回 `unknown` + log。

### 5.3 视频大纲生成（lib/ai/outline.ts）
- 根据项目 type 选择不同 prompt：
  - image 模式：分镜画面提示词 = 图片生成提示词（包含全局画风）。
  - html 模式：分镜画面提示词 = 网页动画描述。
- 系统 prompt 告诉 AI：
  - 输出 6-30 个分镜。
  - 每帧包含 title/narration/imagePrompt(htmlPrompt)。
  - 全局一致性：image 模式要选一组统一画风并写入 `globalStyle`。
- 返回结构用 `Outline` 类型。

### 5.4 图片生成（lib/ai/image.ts）
z-image-turbo 两阶段：
```typescript
async function generateImage(prompt: string): Promise<string> {
  // 阶段1: 创建任务
  const task = await fetch(`${IMAGE_API_BASE_URL}/images/generations`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${IMAGE_API_KEY}` },
    body: JSON.stringify({ model: 'z-image-turbo', prompt }),
  }).then(r => r.json());
  // 阶段2: 轮询
  while (true) {
    await sleep(2000);
    const status = await fetch(`${IMAGE_API_BASE_URL}/tasks/${task.id}`).then(r => r.json());
    if (status.status === 'succeeded') return status.image_url;
    if (status.status === 'failed') throw new Error(status.error);
  }
}
```
- 下载到 `data/images/<projectId>/<frameId>.png`。
- 立即调 TTS 生成旁白。
- 更新 project.videoSource，写库。
- 推送 SSE 进度。

### 5.5 TTS（lib/ai/tts.ts）
- 用 openai 客户端的 `audio.speech.create({ model: 'gpt-4o-mini-tts', voice, input })`。
- 写入 `data/audio/<projectId>/<frameId>.mp3`。
- 用 ffprobe 读时长（如不可用则用 1.0 兜底）。
- 失败时 audioPath 留空，播放默认 3 秒。

### 5.6 HTML 动画生成（lib/ai/html.ts）
- 系统 prompt 角色：网页动画视频设计工程师。
- 用户 prompt 拼接：
  ```
  全局脚本：<整体旁白>
  视觉风格：<styleId 对应的提示词>
  当前分镜：<title> <narration> <htmlPrompt>
  上一分镜 HTML：<上一帧的 htmlCode，或"无">
  ```
- 要求 AI 返回 `{"html": "完整 HTML 文档"}`。
- 清理：去掉 `<script src="外部">` 注入（仅留内联 script）。
- iframe `sandbox="allow-scripts"` 渲染。

### 5.7 字幕切片（lib/subtitle.ts）
```typescript
export function splitSubtitles(
  narration: string,
  audioDuration: number,
): Array<{ text: string; startTime: number; endTime: number }> {
  const cleanText = narration.replace(/[。！？.!?]$/g, '');
  const segments = cleanText.split(/(?<=[，,；;：:])|(?<=[。！？.!?])/g)
    .map(s => s.trim()).filter(Boolean);
  if (!segments.length) return [];
  const total = segments.reduce((sum, s) => sum + s.length, 0);
  let acc = 0;
  return segments.map(text => {
    const ratio = text.length / total;
    const startTime = acc * audioDuration;
    acc += ratio;
    return { text, startTime, endTime: acc * audioDuration };
  });
}
```

### 5.8 播放器
- 状态机：`idle | playing | paused | ended`。
- `playing` 时：
  - 用 setInterval 100ms 推进。
  - 当前帧：根据 `imagePath` 或 `htmlCode` 渲染（图片用 `<img>`，HTML 用 iframe srcdoc）。
  - 同步播放 audio → audio.currentTime 推进字幕。
  - 切帧时：旧帧 opacity 1→0，新帧 0→1，500ms 叠化。
  - 进度条：currentTime / totalDuration。
- 图片缓慢放大：`transform: scale(1) → scale(1.1)` over 帧时长。
- 字幕：底部居中、大字号、文字阴影。

---

## 6. UI/页面设计

### 6.1 全局
- 浅色主题（`bg-white`、`text-slate-900`），强调色 `indigo-500`。
- 圆角 `rounded-2xl`、阴影 `shadow-sm`、字体 Inter + Noto Sans SC。
- 全局 Toaster（sonner）。

### 6.2 首页（`/`）
```
+--------------------------------------------------------+
|  [Logo] AI 视频制作智能体                                |
+--------------------------------------------------------+
|                                                         |
|   +--------------------+   +--------------------+      |
|   |  🖼️                |   |  🎬                |      |
|   |  图片轮播模式       |   |  HTML 动画模式      |      |
|   |  AI 生成图片         |   |  AI 生成网页动画    |      |
|   |                    |   |                    |      |
|   |  [开始创作]         |   |  [开始创作]         |      |
|   +--------------------+   +--------------------+      |
|                                                         |
+--------------------------------------------------------+
```

### 6.3 创作页（`/projects/[id]`）
```
+------+------------------------------------+--------+
|      |  工具栏 [字幕] [全屏] [导出(占位)] [大纲] |        |
| 历史 +------------------------------------+        |
| 项目 |                                    |        对话 |
| 列表 |       大预览区（图片/HTML/iframe）   |        列表 |
|      |                                    |        |    |
| [+]  |                                    |        |    |
|  ▸项 |                                    |        |    |
|  目1 +------------------------------------+        |    |
|  ▸项 |  [▶] ━━━━━━━━━━━ 00:32/01:34 (12镜)  |        |    |
|  目2 +------------------------------------+        |    |
|      |  [卡1] [卡2] [卡3] ... (横向滚动)        |        |    |
|      |                                            |        |
|      +------------------- 拖拽手柄 -----------------+        |
+------+------------------------------------+--------+
         ↑ 中间栏与右侧栏宽度可拖拽（最大 1:1）↑
```

### 6.4 消息气泡
- 用户：右对齐，浅灰底。
- 助手：左对齐，白底带边框。
- 大纲消息：助手气泡内嵌入大纲卡片，footer 含"查看完整大纲"按钮 → 弹窗。
- 进度消息：助手气泡显示"生成分镜 5/12"，用进度条。

### 6.5 完整大纲弹窗
- 大 Modal，宽 80vw，高 80vh。
- 内部：分镜大卡片列表。
- 每张卡片：
  - 上：画面预览（图片 or iframe 200px 高度）
  - 中：标题 + 旁白
  - 下：画面提示词（折叠详情）
  - 右下：喇叭按钮 + 重新生成画面 + 重新生成旁白

### 6.6 风格选择弹窗
- 3 个并排卡片。
- 每个卡片：嵌入一个 demo iframe 演示该风格，点击卡片即选中。

### 6.7 状态管理
- 当前选中 frameId：`useStudioStore` (Zustand)
- 当前播放状态：组件内 useState（不需要全局）

---

## 7. API 端点

| 端点 | 方法 | 入参 | 返回 |
| --- | --- | --- | --- |
| `/api/projects` | POST | `{ type }` | `{ uuid, title }` |
| `/api/projects` | GET | — | `Project[]`（按 createdAt 倒序） |
| `/api/projects/[id]` | GET | — | `Project` + `messages` |
| `/api/projects/[id]` | PATCH | `{ title, outline, videoSource, styleId }` | `Project` |
| `/api/projects/[id]` | DELETE | — | `{ ok }` |
| `/api/projects/[id]/messages` | GET | — | `Message[]` |
| `/api/agent/chat` | POST | `{ projectId, content }` | `{ message, project }` |
| `/api/outline` | POST | `{ projectId, prompt }` | `{ outline }` |
| `/api/frames/image` | POST | `{ projectId }` | `SSE stream` |
| `/api/frames/image/abort` | POST | `{ projectId }` | `{ ok }` |
| `/api/frames/html` | POST | `{ projectId }` | `SSE stream` |
| `/api/frames/html/abort` | POST | `{ projectId }` | `{ ok }` |
| `/api/tts` | POST（内部） | `{ text, projectId, frameId }` | `{ audioPath, duration }` |
| `/api/data/[...path]` | GET | path | 静态文件流（图片/音频） |

---

## 8. 错误处理

| 场景 | 处理 |
| --- | --- |
| 启动时缺 env | 启动时 checkenv → 友好错误页 |
| MySQL 不可用 | 启动时连接检测 → 错误页 + 启动日志 |
| AI JSON 解析失败 | 第一次重试 + 容错 prompt；二次失败返回 `unknown` 并 log |
| 图片生成超时（>60s/frame） | 跳过该分镜、记 log、继续 |
| TTS 失败 | 跳过、保存时 audioPath 留空、播放默认 3s |
| HTML 生成失败 | 同图片 |
| 用户中断 | AbortController 立即生效 |
| 路径冲突 | UUID 防冲突 |

---

## 9. 测试

### 9.1 单元测试（Vitest）
- `lib/subtitle.ts`：字幕切片（多场景）
- `lib/ai/intent.ts`：prompt 拼接、JSON 解析、重试
- `lib/ai/outline.ts`：prompt 拼接

### 9.2 集成测试
- API 端到端（用 MSW 模拟 AI 响应）
- 关键流程：创建项目 → 意图分析 → 大纲生成 → mock 图片 → 播放

### 9.3 手动测试清单
- [ ] 首页显示 2 个模式卡片
- [ ] 点击"开始创作"→ Loading → 跳转到创作页
- [ ] 项目创建到 MySQL
- [ ] 切换历史项目 → URL 跳 + 消息加载
- [ ] 输入"做一个黑洞视频" → 意图分析 → 大纲生成
- [ ] 大纲卡片显示
- [ ] 一键生成图片 → 进度推送 → 卡片点亮
- [ ] TTS 播放
- [ ] 播放按钮 → 字幕同步
- [ ] 切帧淡入淡出
- [ ] 图片缩放
- [ ] 完整大纲弹窗
- [ ] 重新生成单分镜
- [ ] HTML 模式全流程
- [ ] 风格选择
- [ ] 中断生成

---

## 10. 环境变量（.env.example）
```env
# 数据库
DATABASE_URL="mysql://root:password@localhost:3306/ai_video"

# AI 服务（OpenAI 兼容协议）
AI_BASE_URL="https://api.your-relay.com/v1"
AI_API_KEY=""
AI_MODEL="gemini-3-flash-preview"

# TTS（OpenAI gpt-4o-mini-tts 音色：alloy/ash/ballad/coral/echo/sage/shimmer/verse/marin/cedar）
# 推荐 nova（女声，中文表现自然）；用户可在 .env 自行修改
TTS_VOICE="nova"

# 图片生成（evolink.ai z-image-turbo）
IMAGE_API_BASE_URL="https://api.evolink.ai/v1"
IMAGE_API_KEY=""

# 应用
NEXT_PUBLIC_APP_NAME="AI 视频制作智能体"
PORT=3000
```

---

## 11. 开发顺序（实现计划摘要）

实现按以下顺序，每步可独立验证：
1. 脚手架（Next.js + Tailwind + shadcn + Prisma + MySQL）
2. 数据库迁移（project + message）
3. 首页 + 创建项目 API + 创作页空壳
4. 历史项目列表
5. 消息发送 + 意图分析
6. 视频大纲生成（image/html 两种 prompt）
7. 大纲卡片 UI + 完整大纲弹窗
8. 图片生成分镜（z-image-turbo + TTS）
9. HTML 生成分镜（带上一帧参考）
10. 3 套风格 prompt + 风格选择
11. 播放器（图片+HTML 切换、字幕、转场、缩放）
12. 单分镜重新生成
13. 中断生成
14. 单测 + 集成测试
15. README + 启动文档

---

## 12. 风险与权衡

| 决策 | 权衡 |
| --- | --- |
| 单体 Next.js 而非前后端分离 | 部署简单，但图片/HTML 长时间生成会占用 Next.js 进程 |
| 中转站接入 | 模型可热切换，但有第三方依赖 |
| 串行分镜生成 | 实现简单，但慢；可后续改成并发 |
| MySQL 而非 SQLite | 贴合训练营，但本地需装 MySQL |
| iframe srcdoc | 简单，但有 XSS 风险，需 prompt 限制 + sandbox |
| 浅色主题 | 贴合训练营，但没暗色支持 |
| 不做录屏导出 | 节省时间，UI 占位 |
| 字幕用字数百分比 | 实现简单，复杂语速不均匀时不准 |

---

## 13. 验收标准

完成以下即视为 MVP 完成：
- [ ] 能创建 image/html 两种项目
- [ ] 能输入提示词并生成大纲
- [ ] image 模式能生成图片 + TTS + 字幕 + 播放
- [ ] html 模式能生成 HTML 动画 + TTS + 字幕 + 播放
- [ ] 3 套风格可切换
- [ ] 历史项目可切换
- [ ] 完整大纲可查看
- [ ] 单分镜可重新生成
- [ ] 生成过程可中断
- [ ] 所有 env 在 .env.example 中注释
- [ ] README 包含启动步骤
