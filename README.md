# AI 视频制作智能体

> 一个 B/S 模式的 AI 视频创作平台。从主题一句话，AI 全自动生成脚本、分镜、画面、旁白，产出完整视频。

**两种创作模式**：
- 🖼️ **图片轮播模式** — AI 文生图，多张图片轮播成片
- 🎬 **HTML 动画模式** — AI 生成网页动画，多段动画合成

---

## ✨ 核心功能

| 功能 | 描述 |
| --- | --- |
| 🎯 智能意图分析 | 自动识别「生成大纲 / 重新生成 / 新增/删除/重生成分镜」等意图 |
| 📝 视频大纲生成 | 6-30 个分镜，含标题、逐字旁白、画面提示词（image 模式含全局画风） |
| 🖼️ 分镜画面生成 | image 模式：z-image-turbo 文生图；html 模式：AI 生成 HTML/CSS/JS 动画 |
| 🎤 旁白语音 | gpt-4o-mini-tts（多音色，中文推荐 nova） |
| 📺 播放器 | 图片缓慢放大、HTML 动画播放、字幕按字数百分比自动同步、淡入淡出切帧 |
| 🎨 3 套视觉风格 | 玻璃拟态 / 极简直描 / 数据可视化 |
| 🔄 单分镜重生成 | 完整大纲弹窗内可独立重生成画面或旁白 |
| ⏸️ 中断生成 | 长任务可随时中断，已生成的保存 |
| 🌓 浅色主题 | 干净、清晰、适合长时间创作 |

---

## 🚀 快速启动

### 1. 准备环境

- **Node.js** 22+ ✓
- **MySQL** 8.0+（或用 Docker 启动，见下）

### 2. 启动 MySQL（Docker 方式）

```bash
docker-compose up -d
```

或将 `docker-compose.yml` 中的账号密码同步到 `.env` 的 `DATABASE_URL`。

### 3. 安装依赖

```bash
npm install
```

### 4. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 填写：

```env
DATABASE_URL="mysql://root:password@localhost:3306/ai_video"

# 中转站（推荐接入，便于切模型）
# 国内：https://uniapi.ai  https://www.packyapi.com  https://poloai.top
# 国外：https://openrouter.ai
AI_BASE_URL="https://api.your-relay.com/v1"
AI_API_KEY="sk-xxx"
AI_MODEL="gemini-3-flash-preview"

# TTS
TTS_VOICE="nova"

# 图片生成（注册地址：https://evolink.ai/z-image-turbo）
IMAGE_API_BASE_URL="https://api.evolink.ai/v1"
IMAGE_API_KEY="xxx"
```

### 5. 初始化数据库

```bash
# 推 schema 到 MySQL
npx prisma db push

# 或使用迁移文件（生产推荐）
npx prisma migrate deploy
```

如需手建表，参考 `prisma/migrations/0001_init/migration.sql`。

### 6. 启动开发服务器

```bash
npm run dev
```

打开 http://localhost:3000

---

## 🛠️ 常用脚本

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 生产构建 |
| `npm start` | 启动生产服务 |
| `npm test` | 运行单元测试（25 个用例） |
| `npm run test:watch` | 测试 watch 模式 |
| `npm run db:push` | 推送 Prisma schema 到数据库 |
| `npm run db:studio` | 打开 Prisma Studio（可视化数据库） |
| `npm run db:generate` | 重新生成 Prisma client |
| `npm run lint` | ESLint 检查 |

---

## 📁 项目结构

```
ai-video-test/
├── prisma/
│   ├── schema.prisma          # Prisma 数据模型
│   └── migrations/            # SQL 迁移文件
├── src/
│   ├── app/                   # Next.js App Router
│   │   ├── page.tsx           # 首页（两种模式卡片）
│   │   ├── projects/[id]/     # 创作页（三栏布局）
│   │   └── api/               # 后端 API 路由
│   │       ├── projects/      # 项目 CRUD
│   │       ├── agent/chat/    # Agent 意图分析入口
│   │       ├── outline/       # 视频大纲生成
│   │       ├── frames/        # 分镜生成（image + html + abort）
│   │       ├── tts/           # 旁白生成
│   │       ├── styles/        # 视觉风格列表
│   │       └── data/          # 本地静态文件（图片/音频）
│   ├── components/
│   │   ├── ui/                # shadcn/ui 基础组件
│   │   ├── home/              # 首页
│   │   ├── studio/            # 创作页三栏
│   │   ├── chat/              # 对话气泡
│   │   ├── outline/           # 大纲卡片 / 完整大纲弹窗
│   │   ├── player/            # 播放器、字幕
│   │   └── style-picker/      # 风格选择弹窗
│   ├── lib/
│   │   ├── db.ts              # Prisma client
│   │   ├── env.ts             # 环境变量校验
│   │   ├── ai/                # AI 能力封装
│   │   │   ├── client.ts      # OpenAI 兼容客户端
│   │   │   ├── intent.ts      # 意图分析
│   │   │   ├── outline.ts     # 大纲生成
│   │   │   ├── image.ts       # z-image-turbo 图片生成
│   │   │   ├── html.ts        # HTML 动画生成
│   │   │   ├── tts.ts         # gpt-4o-mini-tts
│   │   │   └── abort-registry.ts
│   │   ├── prompts/           # 系统提示词
│   │   ├── styles/presets.ts  # 3 套内置风格
│   │   └── subtitle.ts        # 字幕切片算法
│   ├── hooks/                 # React Query hooks
│   ├── stores/                # Zustand
│   └── types/                 # 共享 TypeScript 类型
├── data/
│   ├── images/<projectId>/    # 分镜图片
│   └── audio/<projectId>/     # 旁白音频
├── tests/                     # Vitest 单测
├── docker-compose.yml         # MySQL 容器
└── .env.example
```

---

## 🧠 架构

### 核心流程

```
用户输入提示词
  ↓ POST /api/agent/chat
  ↓
意图分析 prompt → AI（返回 {action, reason, params}）
  ↓
路由到具体能力：
  - generate_outline / regenerate_outline → /api/outline
  - 后续：生成分镜 → /api/frames/(image|html) （SSE 流式）
  ↓
写入 MySQL + 推送 SSE 进度
  ↓
前端 React Query 失效缓存 + 重新拉取
```

### 关键设计

- **可拖拽三栏布局**：`react-resizable-panels`，默认 18:50:32，右侧栏最大 50%。
- **SSE 流式生成**：图片/HTML 分镜生成时，前端通过 SSE 实时接收进度。
- **AbortController 中断**：服务端用 Map 注册 AbortController，前端调 `/abort` 端点触发中断。
- **HTML 沙箱渲染**：iframe `sandbox="allow-scripts"` + `srcdoc`，禁止外部资源。
- **字幕按字数百分比同步**：切片算法见 `src/lib/subtitle.ts`。
- **图片缓慢放大**：rAF 驱动 transform: scale(1) → scale(1.1)。
- **三套风格一致性**：HTML 模式下，每个分镜生成时把上一帧 HTML 作为参考 + 风格 prompt 拼接到 user prompt。

### 数据模型

```prisma
model Project {
  uuid        String   @id @default(uuid())
  title       String
  type        String   // "image" | "html"
  styleId     String?  // 视觉风格 id
  outline     Json?    // 视频大纲
  videoSource Json?    // 视频源（图片/音频/HTML）
  createdAt   DateTime
  updatedAt   DateTime
  messages    Message[]
}

model Message {
  id        String
  projectId String
  role      String   // "user" | "assistant"
  content   String
  metadata  Json?    // 大纲卡片/分镜卡片/进度等
  createdAt DateTime
}
```

---

## 🧪 测试

```bash
npm test
```

覆盖：
- 字幕切片算法（7 个用例）
- 提示词拼接（4 个用例）
- 风格预设（6 个用例）
- 工具函数（8 个用例）

---

## 📚 模型推荐

| 用途 | 推荐模型 | 说明 |
| --- | --- | --- |
| 文本生成（意图/大纲/HTML） | `gemini-3-flash-preview` | 前端能力、价格、吞吐综合最佳 |
| TTS 语音 | `gpt-4o-mini-tts` | 复用 AI 中转站，音色选 `nova` 中文表现自然 |
| 图片生成 | `z-image-turbo` | 性价比极高（约 2.6 分/张） |

---

## 🛣️ Roadmap

- [ ] 录屏导出视频（MediaRecorder / ffmpeg）
- [ ] 新增/删除分镜（Agent 路由补全）
- [ ] 背景音乐自动选择
- [ ] 用户登录鉴权（多用户）
- [ ] 项目导出 / 导入

---

## 📄 License

MIT
