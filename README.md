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

- 对话式创作入口，自动判断用户是在“生成大纲”还是“增删改某个分镜”
- 自动生成视频大纲，包含标题、旁白、分镜提示词
- 图片模式下自动生成分镜图、旁白音频和字幕
- HTML 模式下自动生成可播放的网页动画分镜
- 支持单个分镜重生成，不必整条视频推倒重来
- 支持长任务中断，已完成内容会保留
- 本地保存图片、音频等产物
- 浏览器内预览，并支持 MP4 导出

## 更多完整功能

如果你希望体验更丰富、更完整、更稳定的 AI 动画与视频创作能力，欢迎访问 [SVG Animate](https://svganimate.ai)：

![SVG Animate 预览](docs/images/svganimate-preview.png)

相较于当前这个实验性仓库版本，`svganimate.ai` 提供了更完整的在线创作体验、更多可视化能力和更成熟的工作流。

## 内置三种风格

三种风格仅用于 `html` 动画模式：

- `科技博主（cyber-clean）`
  深色科技感、青色霓虹、卡片化信息布局，适合测评、拆解、科技分享
- `黑客风（terminal-matrix）`
  终端界面、Matrix 绿、ASCII 装饰、扫描线效果，适合技术演示和极客内容
- `暖色系（warm-story）`
  奶油米色、暖橘琥珀、衬线标题和大留白，适合人文、生活方式、故事表达

风格配置位于 [src/lib/styles/presets.ts](/Users/xuanyuan/Documents/AI-Program/minimax_test/M3/ai-video-test/src/lib/styles/presets.ts)。

## 技术栈

- `Next.js 14` + `React 18` + `TypeScript`
- `Prisma` + `MySQL 8`
- `Tailwind CSS`
- `OpenAI SDK`（对接 OpenAI 兼容接口）
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

TTS_VOICE="nova"
TTS_MODEL="qwen3-tts-flash"

IMAGE_API_BASE_URL="https://api.evolink.ai"
IMAGE_API_KEY="your-image-key"

NEXT_PUBLIC_APP_NAME="AI 视频制作智能体"
```

### 4. 初始化数据库

开发环境可以直接推送 schema：

```bash
npx prisma db push
```

如果你更偏向迁移方式：

```bash
npx prisma migrate deploy
```

### 5. 启动项目

```bash
npm run dev
```

浏览器打开 [http://localhost:3000](http://localhost:3000)。

## 环境变量说明

| 变量名 | 必填 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 是 | Prisma 连接 MySQL 的地址 |
| `AI_BASE_URL` | 是 | OpenAI 兼容接口的基础地址，代码会直接调用聊天与 TTS 接口 |
| `AI_API_KEY` | 是 | 上述网关对应的 API Key |
| `AI_MODEL` | 是 | 主文本模型，用于意图分析、大纲生成、HTML 生成等 |
| `TTS_VOICE` | 否 | TTS 音色，默认 `nova` |
| `TTS_MODEL` | 否 | TTS 模型名，默认 `qwen3-tts-flash` |
| `IMAGE_API_BASE_URL` | 图片模式必填 | 图片生成服务地址，当前图片链路按 `z-image-turbo` 适配 |
| `IMAGE_API_KEY` | 图片模式必填 | 图片生成服务密钥 |
| `NEXT_PUBLIC_APP_NAME` | 否 | 前端顶部显示的应用名称 |

说明：

- `AI_BASE_URL` 需要是 OpenAI 兼容协议地址。
- 图片模式依赖单独的图片接口；如果只体验 HTML 模式，可以暂不配置图片相关变量。
- `IMAGE_API_BASE_URL` 可以写成 `https://api.evolink.ai`，代码会自动补成 `/v1`。

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
├── prisma/                    # Prisma schema 与迁移
├── src/
│   ├── app/                   # Next.js App Router 与 API 路由
│   ├── components/            # UI、工作台、播放器、风格选择器
│   ├── hooks/                 # 生成流程相关 hooks
│   ├── lib/
│   │   ├── ai/                # AI、TTS、图片、HTML 生成封装
│   │   ├── prompts/           # Prompt 模板
│   │   ├── styles/            # 内置风格预设
│   │   ├── subtitle.ts        # 字幕切片
│   │   └── env.ts             # 环境变量校验
│   ├── stores/                # Zustand 状态
│   └── types/                 # 共享类型
├── data/
│   ├── audio/                 # 本地保存的旁白音频
│   └── images/                # 本地保存的分镜图片
├── tests/                     # 单元测试
└── docker-compose.yml         # 本地 MySQL
```

## 运行机制

- 对话入口：`/api/agent/chat`
- 大纲生成：`/api/outline`
- 图片分镜生成：`/api/frames/image`
- HTML 分镜生成：`/api/frames/html`
- 风格列表：`/api/styles`
- 静态资源回放：`/api/data/...`

项目会把生成结果写入数据库，同时把图片和音频落到本地 `data/` 目录。HTML 分镜则存入数据库里的 `videoSource` 字段。

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
