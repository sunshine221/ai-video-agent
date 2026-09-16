# AI 视频制作智能体

一个基于 Next.js 的 AI 视频创作工作台。输入一句主题或一段需求描述，系统会自动完成意图识别、大纲生成、分镜生成、旁白配音、字幕同步和预览导出。

> 提示：
> 本项目由 `MiniMax-M3` 模型辅助开发完成，当前定位为实验性开源项目，可能仍存在一些 Bug 或边界场景问题，欢迎体验、测试并反馈。

项目当前支持两种创作模式：

- `image`：文生图分镜，适合知识讲解、口播轮播类视频
- `html`：AI 生成 HTML/CSS/JS 动画分镜，适合科技演示、动态可视化、风格化表达

## 界面预览

### 首页

![首页预览](docs/images/homepage.png)

### 创作页

![创作页预览](docs/images/creation.png)

## 项目作用

这个项目主要解决“从想法到可播放视频草稿”的自动化问题，适合用来快速搭建 AI 视频生成 Demo、视频工作流原型或内部创作工具。

它内置了这些能力：

- 邮箱 + 密码注册登录，基于 NextAuth（JWT 会话），项目数据按用户隔离
- 对话式创作入口，自动判断用户是在“生成大纲”还是“增删改某个分镜”
- 自动生成视频大纲，包含标题、旁白、分镜提示词
- 图片模式下自动生成分镜图、旁白音频和字幕
- HTML 模式下自动生成可播放的网页动画分镜
- 支持单个分镜重生成，不必整条视频推倒重来
- 支持长任务（生成 / 导出）中断，已完成内容会保留
- 本地保存图片、音频等产物
- 浏览器内预览，并支持服务端渲染合成 MP4 导出


## 内置三种风格

三种风格仅用于 `html` 动画模式：

- `科技博主（cyber-clean）`
  深色科技感、青色霓虹、卡片化信息布局，适合测评、拆解、科技分享
- `黑客风（terminal-matrix）`
  终端界面、Matrix 绿、ASCII 装饰、扫描线效果，适合技术演示和极客内容
- `暖色系（warm-story）`
  奶油米色、暖橘琥珀、衬线标题和大留白，适合人文、生活方式、故事表达

风格种子数据位于 `src/lib/styles/presets.ts`（写入数据库的初始数据），运行时统一从数据库 `style_preset` 表读取。

## 技术栈

- `Next.js 14`（App Router）+ `React 18` + `TypeScript`
- `Prisma` + `MySQL 8`
- `Tailwind CSS` + `Radix UI`
- `NextAuth`（邮箱密码 + JWT 会话）
- `Zustand`（全局状态）+ `TanStack Query`（数据请求）
- `OpenAI SDK`（对接 OpenAI 兼容接口）
- `Playwright` + `ffmpeg-static`（服务端渲染合成 MP4）
- `Vitest`

## 快速开始

### 1. 环境要求

- `Node.js 22+`
- `MySQL 8+`
- 可用的 OpenAI 兼容模型网关

如果你本地没有 MySQL，可以直接用仓库里的 Docker 配置：

```bash
docker-compose up -d
```

默认会启动一个名为 `ai-video-mysql` 的 MySQL 8 实例。

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

```bash
cp .env.example .env
```

按需修改 `.env`：

```env
DATABASE_URL="mysql://root:password@localhost:3306/ai_video"

AI_BASE_URL="https://your-openai-compatible-gateway/v1"
AI_API_KEY="sk-xxx"
AI_MODEL="gemini-3-flash-preview"

TTS_PROVIDER="openai"
TTS_MODEL="qwen3-tts-flash"
TTS_VOICE="nova"

IMAGE_PROVIDER="evolink"
IMAGE_MODEL="z-image-turbo"
IMAGE_API_BASE_URL="https://api.evolink.ai"
IMAGE_API_KEY="your-image-key"

NEXT_PUBLIC_APP_NAME="AI 视频制作智能体"

# 生产环境务必替换为随机长字符串：openssl rand -base64 32
NEXTAUTH_SECRET="please-change-me-to-a-random-secret"
NEXTAUTH_URL="http://localhost:3000"
```

### 4. 初始化数据库

推荐使用迁移方式，会一并建表并写入内置风格种子数据：

```bash
npx prisma migrate deploy
```

如果只想快速拉起 schema（不含风格种子数据），可用：

```bash
npx prisma db push
```

### 5. 启动项目

```bash
npm run dev
```

浏览器打开 [http://localhost:3000](http://localhost:3000)。首次使用先在 `/login` 页面注册账号并登录，然后即可开始创作。

## 环境变量说明

| 变量名 | 必填 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 是 | Prisma 连接 MySQL 的地址 |
| `AI_BASE_URL` | 是 | OpenAI 兼容接口的基础地址，用于意图分析、大纲生成、HTML 生成等 |
| `AI_API_KEY` | 是 | 上述网关对应的 API Key |
| `AI_MODEL` | 是 | 主文本模型，默认 `gemini-3-flash-preview` |
| `NEXTAUTH_SECRET` | 是 | 加密会话 JWT 的密钥，生产环境务必替换为随机长字符串 |
| `NEXTAUTH_URL` | 是 | 站点地址，本地开发即 `http://localhost:3000` |
| `TTS_PROVIDER` | 否 | TTS 接口风格，`openai`（默认）或 `dashscope` |
| `TTS_MODEL` | 否 | TTS 模型名，默认 `qwen3-tts-flash` |
| `TTS_VOICE` | 否 | TTS 音色，默认 `nova` |
| `TTS_BASE_URL` / `TTS_API_KEY` | 否 | TTS 独立地址与密钥，缺省回退到 `AI_BASE_URL` / `AI_API_KEY` |
| `IMAGE_PROVIDER` | 图片模式必填 | 图片接口风格，`evolink`（默认，两阶段任务）或 `dashscope`（同步生图） |
| `IMAGE_MODEL` | 否 | 图片模型，默认 `z-image-turbo` |
| `IMAGE_SIZE` | 否 | 图片比例，默认 `16:9` |
| `IMAGE_API_BASE_URL` | 图片模式必填 | 图片生成服务地址 |
| `IMAGE_API_KEY` | 图片模式必填 | 图片生成服务密钥 |
| `NEXT_PUBLIC_APP_NAME` | 否 | 前端顶部显示的应用名称 |

说明：

- `AI_BASE_URL` 需要是 OpenAI 兼容协议地址。
- TTS 默认复用 `AI_BASE_URL` / `AI_API_KEY`，如需单独的语音账号再配置 `TTS_BASE_URL` / `TTS_API_KEY`。
- 图片模式依赖单独的图片接口；如果只体验 HTML 模式，可以暂不配置图片相关变量。

## 使用方式

创作工作台示意如下，左侧管理项目，中间预览视频与分镜，右侧通过对话驱动生成和修改：

![创作工作台](docs/images/creation.png)

### 基本流程

1. 进入首页，选择 `图片轮播模式` 或 `HTML 动画模式`
2. 创建项目后，在聊天区输入主题、脚本或修改要求
3. 系统先生成视频大纲
4. 再逐镜生成图片或 HTML 动画，并同时生成旁白音频
5. 在预览区试听、查看字幕、切换分镜
6. 需要时可重生成某一镜，最后导出 MP4

### 推荐输入示例

- `帮我做一个 30 秒的视频，讲清楚什么是 RAG`
- `做一个科技感强一点的 AI Agent 工作流介绍`
- `把第 3 镜改成更偏数据可视化，不要人物`
- `删掉最后一镜，再补一个总结镜头`

## 常用命令

```bash
npm run dev
npm run build
npm start
npm run lint
npm test
npm run test:watch
npm run db:generate
npm run db:push
npm run db:studio
```

## 项目结构

```text
.
├── prisma/                    # Prisma schema 与迁移（含风格种子）
├── scripts/                   # 端口释放、风格 demo 同步、诊断脚本
├── src/
│   ├── app/
│   │   ├── api/               # 认证、对话、大纲、分镜、导出、静态资源路由
│   │   ├── login/            # 登录 / 注册页
│   │   ├── projects/[id]/    # 创作工作台页
│   │   └── page.tsx          # 首页（选择创作模式）
│   ├── components/            # UI、工作台、播放器、风格选择器
│   ├── hooks/                 # 生成流程相关 hooks
│   ├── lib/
│   │   ├── ai/                # AI、TTS、图片、HTML 生成、任务管理封装
│   │   ├── export/            # 服务端渲染 + ffmpeg 合成 MP4
│   │   ├── prompts/           # Prompt 模板
│   │   ├── styles/            # 内置风格预设（种子数据）
│   │   ├── auth.ts            # NextAuth 配置
│   │   ├── subtitle.ts        # 字幕切片
│   │   └── env.ts             # 环境变量校验
│   ├── stores/                # Zustand 状态
│   ├── types/                 # 共享类型
│   └── middleware.ts          # 登录路由守卫
├── data/
│   ├── audio/                 # 本地保存的旁白音频
│   └── images/                # 本地保存的分镜图片
├── tests/                     # 单元测试
└── docker-compose.yml         # 本地 MySQL
```

## 运行机制

- 注册 / 登录：`/api/auth/register`、`/api/auth/[...nextauth]`、`/api/auth/change-password`
- 对话入口：`/api/agent/chat`
- 大纲生成：`/api/outline`
- 图片分镜生成：`/api/frames/image`（`/abort` 中断）
- HTML 分镜生成：`/api/frames/html`（`/abort` 中断）
- MP4 导出：`/api/export`（`/abort` 中断）
- 风格列表：`/api/styles`
- 静态资源回放：`/api/data/...`

数据模型：`user`（账号）、`project`（项目，含 `brief` 创作简报与 `outline` 大纲）、`frame`（逐镜产物，含 `htmlCode` / `imagePath` / `audioPath`）、`message`（对话记录）、`style_preset`（风格预设）。项目、大纲等结构化数据写入数据库，图片和音频等二进制产物落到本地 `data/` 目录。

## 开源使用建议

- 不要提交真实 `.env`
- 建议把 `data/images` 和 `data/audio` 作为运行时产物处理
- 如果要公开演示，先确认你使用的模型网关、图片接口和语音接口都有可再分发权限
- 如果打算部署到服务器，优先使用正式的 Prisma migration 流程，而不是仅靠 `db push`

## 关注公众号

如果你对 AI 编程、智能体、可视化内容创作或这个项目背后的工作流感兴趣，欢迎关注公众号获取后续更新：

![公众号二维码](docs/images/wechat-qr.jpg)

## 测试

```bash
npm test
```

当前仓库包含字幕、分镜操作、图片逻辑、样式预设等方面的测试。
