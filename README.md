# AI 视频制作智能体

一个基于 Next.js 的 AI 视频创作工作台。用一句话或一段需求描述，系统会通过对话自动完成意图识别、创作简报、大纲生成、逐镜画面生成、旁白配音、字幕同步和 MP4 导出。

> 提示：
> 本项目由 `Claude` 模型辅助开发完成，当前为初版项目，可能仍存在一些 Bug 或边界场景问题，欢迎体验、测试并反馈。

当前对外开放的创作模式：

- `html`：AI 为每个分镜生成专属 HTML/CSS/JS 动画，配合旁白与字幕合成视频，适合科技讲解、动态可视化、风格化表达。

> `image`（文生图轮播）模式的后端链路已经实现，但首页入口在第一版暂未开放，后续迭代完成后再上线。

## 界面预览

### 首页

![首页预览](docs/images/homepage.png)

### 创作页

![创作页预览](docs/images/creation.png)

## 核心能力

- 邮箱 + 密码注册登录，基于 NextAuth（JWT 会话），项目数据按用户隔离
- 对话式创作：LLM 识别意图并分发到「改大纲 / 重做画面 / 追问澄清」等动作
- 创作简报（Creative Brief）作为唯一事实来源，大纲由简报派生，抑制多轮对话中的主题漂移
- HTML 动画分镜：生成完整可运行的 HTML/CSS/JS，通过 `data-step` 实现音频驱动的分步播放
- 自动 TTS 旁白 + 基于音频时长的字幕切片
- 生成后自动终检：确定性校验 + 自动修复，HTML 还有 LLM 审查兜底
- 长任务（生成 / 导出）在服务端后台运行，SSE 仅作观察者，断连不中断，仅 abort 接口可真正停止
- 服务端合成 MP4：Playwright 无头浏览器逐帧截图 + ffmpeg 编码
- 5 套内置视觉风格，本地保存图片、音频与导出产物

## 内置五种风格

五种风格仅用于 `html` 动画模式，运行时统一从数据库 `style_preset` 表读取：

- `手绘讲故事（hand-drawn-story）`
  米色纸张背景、黑色线条描边、SVG 路径绘制动画，适合历史、故事讲述
- `科技博主（tech-blogger）`
  暗黑模式、网格背景、等宽字体、霓虹橙强调色、数据矩阵与进度条动画，适合 AI、编程、硬核科普
- `蜡笔绘本（crayon-picture-book）`
  高饱和度扁平色块、粗圆角线条、活泼弹跳动画，适合儿童、轻松科普
- `暖色科普（warm-photosynthesis）`
  奶油米色点阵背景、暖橘/叶绿/水蓝配色、SVG 虚线流动动画，适合生物、自然、温馨科普
- `古韵风格（ancient-charm）`
  宣纸纹理、书法字体、朱砂红印章、时间轴曲线、沉稳淡入动画，适合历史、文化、国风内容

风格种子数据定义在 `src/lib/styles/presets.ts`，通过基线迁移 `prisma/migrations/0001_init` 建表并写入。执行 `prisma migrate deploy` 时自动注入。修改风格后运行 `npx tsx scripts/gen-style-seed-sql.ts` 刷新该迁移。

## 技术栈

- `Next.js 14`（App Router）+ `React 18` + `TypeScript`
- `Prisma` + `MySQL 8`
- `Tailwind CSS` + `Radix UI`
- `NextAuth`（邮箱密码 + JWT 会话）
- `Zustand`（全局状态）+ `TanStack Query`（数据请求）
- `OpenAI SDK`（对接 OpenAI 兼容接口，含 function calling）
- `Playwright` + `ffmpeg-static`（服务端渲染合成 MP4）
- `Vitest`

## 快速开始

### 环境要求

- `Node.js 22+`
- `MySQL 8+`
- 可用的 OpenAI 兼容模型网关（用于文本、TTS，图片模式需额外的图片接口）
- 导出功能依赖 Playwright 的 Chromium 与 ffmpeg（`ffmpeg-static` 已随依赖安装，Chromium 需 `npx playwright install chromium`）

### 方式一：Docker（推荐）

仓库提供了完整的 `Dockerfile`（基于 `mcr.microsoft.com/playwright` 镜像，已内置浏览器）和 `docker-compose.yml`（MySQL + 应用）：

```bash
cp .env.example .env   # 按需修改，DATABASE_URL 指向 compose 内的 mysql 服务
docker-compose up -d --build
```

- 应用监听 `127.0.0.1:3000`，MySQL 不对外暴露端口。
- 容器启动命令会先执行 `npx prisma migrate deploy`（自动建表 + 写入风格种子数据）再启动服务。
- `./data` 目录挂载到容器内 `/app/data`，用于持久化图片、音频与导出产物。

### 方式二：本地开发

1. 安装依赖

```bash
npm install
npx playwright install chromium   # 导出功能需要
```

2. 配置环境变量

```bash
cp .env.example .env
```

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

3. 初始化数据库（推荐迁移方式，会一并写入风格种子数据）

```bash
npx prisma migrate deploy
```

> 也可用 `npx prisma db push` 快速拉起 schema，但它不会执行风格种子 SQL，风格列表会为空。

4. 启动

```bash
npm run dev
```

浏览器打开 [http://localhost:3000](http://localhost:3000)。首次使用先在 `/login` 页面注册账号并登录，然后进入创作中心。

## 环境变量说明

| 变量名 | 必填 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 是 | Prisma 连接 MySQL 的地址 |
| `AI_BASE_URL` | 是 | OpenAI 兼容接口基础地址，用于意图分析、简报/大纲生成、HTML 生成 |
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
- 图片模式目前后端可用但首页入口未开放；仅体验 HTML 模式时可暂不配置图片相关变量。

## 使用方式

创作工作台采用三栏布局：左侧管理项目列表，中间预览视频与分镜，右侧通过对话驱动生成与修改。

![创作工作台](docs/images/creation.png)

### 基本流程

1. 登录后进入首页，选择 `HTML 动画模式` 创建项目
2. 在右侧聊天区输入主题、脚本或修改要求
3. 系统先更新创作简报并生成大纲（分镜标题、旁白、画面描述）
4. 逐镜生成 HTML 动画，同时生成旁白音频并切分字幕
5. 在中间预览区播放、查看字幕、切换分镜
6. 需要时对某一镜重新生成，最后导出 MP4

### 对话意图

`/api/agent/chat` 会先用 LLM 做意图识别（function calling），再分发到对应动作：

- `edit_outline`：新建或改写大纲（只改大纲，被改动的分镜会清空产物，等待重新生成）
- `regenerate_media`：对指定分镜重做画面 / 旁白
- `clarify`：信息不足时反问澄清
- `unknown`：超出能力范围时友好说明

### 推荐输入示例

- `帮我做一个 30 秒的视频，讲清楚什么是 RAG`
- `做一个科技感强一点的 AI Agent 工作流介绍`
- `把第 3 镜的动画节奏放慢，重点突出流程图`
- `删掉最后一镜，再补一个总结镜头`

## 运行机制

### 生成与导出：后台任务 + SSE 观察

HTML 分镜生成（`/api/frames/html`）和 MP4 导出（`/api/export`）由 `src/lib/ai/job-manager.ts` 统一调度：任务在服务端后台的 Promise 中独立运行，HTTP 请求返回后不受影响，SSE 连接只是「观察者」用于回放历史事件与实时推送进度。断开连接不会中断任务，只有对应的 `/abort` 接口才能真正停止。图片分镜生成（`/api/frames/image`）走轻量的 `abort-registry`。

### 创作简报是唯一事实来源

用户的每轮诉求先增量合并进「创作简报」（`src/lib/ai/brief.ts`），大纲再从简报派生（`generateOutline` / `editOutline`），以此抑制多轮对话中的主题漂移，并对分镜数、时长偏差做校验。

### HTML 动画：音频驱动分步

HTML 分镜要求 AI 用 `data-step` 标注分步动画（`src/lib/ai/html.ts`），播放/导出时按音频进度逐步推进。生成后经过补齐与终检（`src/lib/ai/review.ts`：确定性校验 + LLM 审查 + 自动修复或整帧重生成，带 signature 防死循环）。生成的 HTML 会清理外部资源引用。

### MP4 导出：Playwright + ffmpeg

导出为纯服务端方案（`src/lib/export`）：Playwright 无头 Chromium 按 `data-step` 逐帧截图得到 PNG 序列（1280×720，默认 30fps），再用 `ffmpeg-static` 合成带音频的分镜片段（H.264 / AAC），最后用 concat 拼接为完整视频，产物落地 `data/exports/<projectId>/`。字幕层在渲染时注入。

> 仓库中的 `src/lib/webcodecs-mp4-encoder.ts` 是浏览器端 WebCodecs 录制的备选实现，当前导出流程未启用它。

### API 端点

| 端点 | 方法 | 说明 |
| --- | --- | --- |
| `/api/auth/register` | POST | 邮箱 + 密码注册 |
| `/api/auth/[...nextauth]` | GET/POST | NextAuth 登录会话 |
| `/api/auth/change-password` | POST | 修改密码 |
| `/api/agent/chat` | POST | Agent 主入口，意图识别 + 动作分发 |
| `/api/outline` | POST | 单独生成大纲（更新简报后派生） |
| `/api/frames/html` | POST | HTML 分镜生成（SSE） |
| `/api/frames/html/abort` | POST | 中断 HTML 生成 |
| `/api/frames/image` | POST | 图片分镜生成（SSE） |
| `/api/frames/image/abort` | POST | 中断图片生成 |
| `/api/export` | POST | 合成 MP4（SSE） |
| `/api/export/abort` | POST | 中断导出 |
| `/api/tts` | POST | 重新生成某分镜旁白 |
| `/api/projects` | GET/POST | 项目列表 / 创建 |
| `/api/projects/[id]` | GET/PATCH/DELETE | 项目详情 / 更新 / 删除 |
| `/api/styles` | GET | 风格列表 |
| `/api/data/[...path]` | GET | 静态产物（图片/音频/mp4，带登录与越界校验） |

### 数据模型

Prisma schema（`prisma/schema.prisma`，MySQL）：

- `user`：账号（邮箱、bcrypt 密码哈希）
- `project`：项目，含 `brief`（创作简报，Json）、`outline`（大纲，Json）、`styleId`、`type`
- `frame`：逐镜产物，含 `htmlCode`（LongText）、`imagePath`、`audioPath`、`audioDuration`、`orderIndex`
- `message`：对话记录，含结构化 `metadata`
- `style_preset`：风格预设

结构化数据写入数据库，图片、音频、导出 MP4 等二进制产物落到本地 `data/` 目录。

## 项目结构

```text
.
├── prisma/                    # Prisma schema 与迁移（含风格种子 SQL）
├── scripts/                   # 端口释放、风格 demo 同步、种子 SQL 生成、诊断脚本
├── src/
│   ├── app/
│   │   ├── api/               # 认证、对话、大纲、分镜、导出、静态资源路由
│   │   ├── login/             # 登录 / 注册页
│   │   ├── projects/[id]/     # 创作工作台页
│   │   └── page.tsx           # 首页（选择创作模式）
│   ├── components/            # UI、工作台、播放器、风格选择器
│   ├── hooks/                 # 生成流程相关 hooks
│   ├── lib/
│   │   ├── ai/                # 意图、简报、大纲、HTML/图片/TTS 生成、任务管理、终检
│   │   ├── export/            # Playwright 截帧 + ffmpeg 合成 MP4
│   │   ├── prompts/           # Prompt 模板
│   │   ├── styles/            # 内置风格预设（种子数据）
│   │   ├── auth.ts            # NextAuth 配置
│   │   ├── session.ts         # 登录态与项目访问校验
│   │   ├── subtitle.ts        # 字幕切片
│   │   └── env.ts             # 环境变量校验
│   ├── stores/                # Zustand 状态
│   ├── types/                 # 共享类型
│   └── middleware.ts          # 登录路由守卫
├── data/                      # 运行时产物（图片 / 音频 / 导出）
├── tests/                     # 单元测试
├── Dockerfile                 # 多阶段构建（基于 Playwright 镜像）
└── docker-compose.yml         # MySQL + 应用
```

## 常用命令

```bash
npm run dev          # 本地开发（自动释放 3000 端口）
npm run build        # 构建
npm start            # 生产启动
npm run lint         # 代码检查
npm test             # 运行单元测试
npm run test:watch   # 监听模式测试
npm run db:generate  # 生成 Prisma Client
npm run db:migrate   # 开发环境迁移
npm run db:push      # 直接推送 schema（不含风格种子）
npm run db:studio    # Prisma Studio
```

## 开源使用建议

- 不要提交真实 `.env`
- 把 `data/images`、`data/audio`、`data/exports` 作为运行时产物处理
- 公开演示前，确认所用模型网关、图片接口和语音接口都有可再分发权限
- 部署到服务器时优先使用 `prisma migrate deploy`，而不是仅靠 `db push`（后者不会写入风格种子数据）
- 生产环境务必设置随机的 `NEXTAUTH_SECRET`

## 关注公众号

如果你对 AI 编程、智能体、可视化内容创作或这个项目背后的工作流感兴趣，欢迎关注公众号获取后续更新：

![公众号二维码](docs/images/wechat-qr.jpg)

## 测试

```bash
npm test
```

当前仓库包含字幕切片、分镜操作、图片逻辑、HTML 处理、Prompt、样式预设等方面的单元测试。
