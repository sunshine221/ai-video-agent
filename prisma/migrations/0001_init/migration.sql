-- ===============================================
-- AI 视频制作智能体 — 第一代基线迁移
-- 建表 DDL 与 schema.prisma 一致；风格种子数据由
-- scripts/gen-style-seed-sql.ts 从 STYLE_PRESET_SEEDS 生成，请勿手改。
-- 数据库：MySQL 8.0+，字符集 utf8mb4
-- ===============================================

-- CreateTable
CREATE TABLE `user` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `user_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `project` (
    `uuid` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `styleId` VARCHAR(191) NULL,
    `brief` JSON NULL,
    `outline` JSON NULL,
    `userId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `project_createdAt_idx`(`createdAt`),
    INDEX `project_userId_idx`(`userId`),
    PRIMARY KEY (`uuid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `frame` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `frameId` VARCHAR(191) NOT NULL,
    `orderIndex` INTEGER NOT NULL,
    `htmlCode` LONGTEXT NULL,
    `imagePath` VARCHAR(191) NULL,
    `audioPath` VARCHAR(191) NULL,
    `audioDuration` DOUBLE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `frame_projectId_orderIndex_idx`(`projectId`, `orderIndex`),
    UNIQUE INDEX `frame_projectId_frameId_key`(`projectId`, `frameId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `message` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `message_projectId_createdAt_idx`(`projectId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `style_preset` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `prompt` TEXT NOT NULL,
    `demoHtml` LONGTEXT NOT NULL,
    `userId` VARCHAR(191) NULL,
    `isBuiltin` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `style_preset_slug_key`(`slug`),
    INDEX `style_preset_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 内置视觉风格初始数据（5 套）
INSERT INTO `style_preset`
  (`id`, `slug`, `name`, `description`, `prompt`, `demoHtml`, `userId`, `isBuiltin`, `sortOrder`, `updatedAt`)
VALUES (
  '1730000000000000004',
  'hand-drawn-story',
  '手绘讲故事',
  '米色纸张背景，黑色线条描边，SVG 路径绘制动画，模拟手绘过程，适合历史、故事讲述',
  '【视觉风格：手绘讲故事（Hand-drawn Story）】

整体气质：复古、叙事感、娓娓道来。米色纸张基底 + 纯黑线条 + 手写字体。

【配色】
- 背景：#f4f1ea 纸张米色
- 线条/文字：#2c2c2c 深炭黑

【字体】
- 手写体：''Comic Sans MS'', cursive

【布局与元素】
- 核心：SVG 矢量图形，使用 pathLength + stroke-dasharray 实现逐笔线条绘制动画
- 元素：船只、城堡、人物简笔画
- 装饰：一只握笔的手，笔尖始终跟随当前正在绘制的那一笔

【动画】
- 线条按顺序一笔一笔绘制（前一笔完成后才画下一笔，整幕循环播放）
- 手跟随当前笔触的笔尖移动（animateMotion 沿路径移动）
- 画面完成后浮现手写标题，随后整体淡出并重新开始

【绝对禁止】
- 禁止使用填充色块（除背景外），保持纯线条风格
- 禁止使用现代科技感元素',
  '<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>手绘讲故事风格</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { width: 100%; height: 100%; }
        body {
            background-color: #f4f1ea; /* 纸张米色 */
            overflow: hidden;
            position: relative;
            font-family: ''Comic Sans MS'', cursive, sans-serif;
        }
        /* 纸张质感：极淡的斜向纤维 */
        body::before {
            content: '''';
            position: absolute; inset: 0;
            background-image: repeating-linear-gradient(115deg, rgba(44, 44, 44, 0.025) 0 1px, transparent 1px 7px);
            pointer-events: none;
        }
        svg.stage { position: absolute; inset: 0; width: 100%; height: 100%; }

        /* 线条：纯黑描边，无填充 */
        .ink {
            fill: none;
            stroke: #2c2c2c;
            stroke-width: 5;
            stroke-linecap: round;
            stroke-linejoin: round;
            stroke-dasharray: 1;
            stroke-dashoffset: 1;
        }
        .ink.thin { stroke-width: 4; }

        /* 12s 主循环：每一笔在自己的时间窗内由 0 画到 1（pathLength="1"） */
        .s1 { animation: d1 12s linear infinite; }
        .s2 { animation: d2 12s linear infinite; }
        .s3 { animation: d3 12s linear infinite; }
        .s4 { animation: d4 12s linear infinite; }
        .s5 { animation: d5 12s linear infinite; }
        .s6 { animation: d6 12s linear infinite; }
        .s7 { animation: d7 12s linear infinite; }

        @keyframes d1 { 0%, 3% { stroke-dashoffset: 1; } 16%, 100% { stroke-dashoffset: 0; } }
        @keyframes d2 { 0%, 17% { stroke-dashoffset: 1; } 23%, 100% { stroke-dashoffset: 0; } }
        @keyframes d3 { 0%, 24% { stroke-dashoffset: 1; } 38%, 100% { stroke-dashoffset: 0; } }
        @keyframes d4 { 0%, 39% { stroke-dashoffset: 1; } 54%, 100% { stroke-dashoffset: 0; } }
        @keyframes d5 { 0%, 55% { stroke-dashoffset: 1; } 68%, 100% { stroke-dashoffset: 0; } }
        @keyframes d6 { 0%, 69% { stroke-dashoffset: 1; } 75%, 100% { stroke-dashoffset: 0; } }
        @keyframes d7 { 0%, 76% { stroke-dashoffset: 1; } 82%, 100% { stroke-dashoffset: 0; } }

        /* 手写标题在收尾时浮现 */
        .caption { opacity: 0; animation: cap 12s linear infinite; }
        @keyframes cap { 0%, 82% { opacity: 0; } 88%, 100% { opacity: 1; } }

        /* 整幅画完成后停顿，再淡出重画 */
        .scene { animation: sceneFade 12s linear infinite; }
        @keyframes sceneFade { 0%, 92% { opacity: 1; } 97%, 100% { opacity: 0; } }

        /* 手的显隐窗口（位置由 SMIL animateMotion 沿笔迹驱动） */
        .hand { opacity: 0; }
        .h1 { animation: a1 12s linear infinite; }
        .h2 { animation: a2 12s linear infinite; }
        .h3 { animation: a3 12s linear infinite; }
        .h4 { animation: a4 12s linear infinite; }
        .h5 { animation: a5 12s linear infinite; }
        .h6 { animation: a6 12s linear infinite; }
        .h7 { animation: a7 12s linear infinite; }

        @keyframes a1 { 0%, 2% { opacity: 0; } 3%, 16% { opacity: 1; } 18%, 100% { opacity: 0; } }
        @keyframes a2 { 0%, 16% { opacity: 0; } 17%, 23% { opacity: 1; } 25%, 100% { opacity: 0; } }
        @keyframes a3 { 0%, 23% { opacity: 0; } 24%, 38% { opacity: 1; } 40%, 100% { opacity: 0; } }
        @keyframes a4 { 0%, 38% { opacity: 0; } 39%, 54% { opacity: 1; } 56%, 100% { opacity: 0; } }
        @keyframes a5 { 0%, 54% { opacity: 0; } 55%, 68% { opacity: 1; } 70%, 100% { opacity: 0; } }
        @keyframes a6 { 0%, 68% { opacity: 0; } 69%, 75% { opacity: 1; } 77%, 100% { opacity: 0; } }
        @keyframes a7 { 0%, 75% { opacity: 0; } 76%, 82% { opacity: 1; } 84%, 100% { opacity: 0; } }
    </style>
</head>
<body>
    <svg class="stage" viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid meet">
        <g class="scene">
            <!-- 1. 船体 -->
            <path id="p1" class="ink s1" pathLength="1"
                  d="M430,468 L830,468 L770,540 Q630,566 490,540 Z" />
            <!-- 2. 桅杆 -->
            <path id="p2" class="ink s2" pathLength="1"
                  d="M630,468 L630,170" />
            <!-- 3. 主帆 + 前帆（三角帆） -->
            <path id="p3" class="ink s3" pathLength="1"
                  d="M646,236 L646,452 L838,452 Z M614,262 L614,452 L474,452 Z" />
            <!-- 4. 海浪（船体处留白） -->
            <path id="p4" class="ink thin s4" pathLength="1"
                  d="M180,540 q45,-28 90,0 t90,0 t90,0
                     M800,540 q45,-28 90,0 t90,0 t90,0
                     M220,606 q45,-26 90,0 t90,0 t90,0 t90,0 t90,0 t90,0 t90,0 t90,0 t90,0" />
            <!-- 5. 太阳（圆 + 光芒） -->
            <path id="p5" class="ink s5" pathLength="1"
                  d="M1050,98 A62,62 0 1,1 1049.9,98
                     M1050,72 L1050,48 M1050,248 L1050,272 M962,160 L938,160 M1138,160 L1162,160
                     M988,98 L971,81 M1112,222 L1129,239 M988,222 L971,239 M1112,98 L1129,81" />
            <!-- 6. 旗帜 -->
            <path id="p6" class="ink thin s6" pathLength="1"
                  d="M630,170 L724,192 L630,214" />
            <!-- 7. 远处海鸥 -->
            <path id="p7" class="ink thin s7" pathLength="1"
                  d="M850,320 q20,-18 40,0 q20,-18 40,0 M944,268 q16,-14 32,0 q16,-14 32,0" />

            <!-- 手写标题 -->
            <g class="caption">
                <text x="118" y="118" font-size="52" fill="#2c2c2c">小船的远航</text>
                <text x="122" y="168" font-size="26" fill="#5a5348">海风轻轻吹，船儿慢慢走……</text>
            </g>
        </g>

        <!-- 执笔的手：沿各自笔迹移动（keyPoints 把移动限制在该笔的时间窗内） -->
        <g class="hand h1">
            <use href="#handArt" />
            <animateMotion dur="12s" repeatCount="indefinite" calcMode="linear"
                           keyPoints="0;0;1;1" keyTimes="0;0.03;0.16;1"
                           path="M430,468 L830,468 L770,540 Q630,566 490,540 Z" />
        </g>
        <g class="hand h2">
            <use href="#handArt" />
            <animateMotion dur="12s" repeatCount="indefinite" calcMode="linear"
                           keyPoints="0;0;1;1" keyTimes="0;0.17;0.23;1"
                           path="M630,468 L630,170" />
        </g>
        <g class="hand h3">
            <use href="#handArt" />
            <animateMotion dur="12s" repeatCount="indefinite" calcMode="linear"
                           keyPoints="0;0;1;1" keyTimes="0;0.24;0.38;1"
                           path="M646,236 L646,452 L838,452 Z M614,262 L614,452 L474,452 Z" />
        </g>
        <g class="hand h4">
            <use href="#handArt" />
            <animateMotion dur="12s" repeatCount="indefinite" calcMode="linear"
                           keyPoints="0;0;1;1" keyTimes="0;0.39;0.54;1"
                           path="M180,540 q45,-28 90,0 t90,0 t90,0 M800,540 q45,-28 90,0 t90,0 t90,0 M220,606 q45,-26 90,0 t90,0 t90,0 t90,0 t90,0 t90,0 t90,0 t90,0 t90,0" />
        </g>
        <g class="hand h5">
            <use href="#handArt" />
            <animateMotion dur="12s" repeatCount="indefinite" calcMode="linear"
                           keyPoints="0;0;1;1" keyTimes="0;0.55;0.68;1"
                           path="M1050,98 A62,62 0 1,1 1049.9,98 M1050,72 L1050,48 M1050,248 L1050,272 M962,160 L938,160 M1138,160 L1162,160 M988,98 L971,81 M1112,222 L1129,239 M988,222 L971,239 M1112,98 L1129,81" />
        </g>
        <g class="hand h6">
            <use href="#handArt" />
            <animateMotion dur="12s" repeatCount="indefinite" calcMode="linear"
                           keyPoints="0;0;1;1" keyTimes="0;0.69;0.75;1"
                           path="M630,170 L724,192 L630,214" />
        </g>
        <g class="hand h7">
            <use href="#handArt" />
            <animateMotion dur="12s" repeatCount="indefinite" calcMode="linear"
                           keyPoints="0;0;1;1" keyTimes="0;0.76;0.82;1"
                           path="M850,320 q20,-18 40,0 q20,-18 40,0 M944,268 q16,-14 32,0 q16,-14 32,0" />
        </g>

        <!-- 手 + 铅笔的简笔画（笔尖位于原点，动画时被平移到笔迹上） -->
        <defs>
            <g id="handArt">
                <path d="M0,0 L26,-36" stroke="#2c2c2c" stroke-width="16" stroke-linecap="round" fill="none" />
                <path d="M22,-31 L84,-116" stroke="#2c2c2c" stroke-width="12" stroke-linecap="round" fill="none" />
                <path d="M78,-108 L96,-132" stroke="#2c2c2c" stroke-width="12" stroke-linecap="round" fill="none" />
                <circle cx="104" cy="-104" r="46" fill="#f4f1ea" stroke="#2c2c2c" stroke-width="5" />
                <path d="M68,-124 q36,-12 66,6" fill="none" stroke="#2c2c2c" stroke-width="4" stroke-linecap="round" />
                <path d="M64,-104 q38,-10 70,6" fill="none" stroke="#2c2c2c" stroke-width="4" stroke-linecap="round" />
                <path d="M70,-84 q32,-8 60,6" fill="none" stroke="#2c2c2c" stroke-width="4" stroke-linecap="round" />
                <path d="M74,-138 q-14,-24 8,-36 q22,-12 34,8" fill="none" stroke="#2c2c2c" stroke-width="5" stroke-linecap="round" />
                <path d="M134,-72 q34,26 46,64" fill="none" stroke="#2c2c2c" stroke-width="5" stroke-linecap="round" />
                <path d="M150,-104 q40,26 54,64" fill="none" stroke="#2c2c2c" stroke-width="5" stroke-linecap="round" />
                <path d="M176,-8 l28,-14" fill="none" stroke="#2c2c2c" stroke-width="5" stroke-linecap="round" />
            </g>
        </defs>
    </svg>
</body>
</html>
',
  NULL, 1, 0, CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `description` = VALUES(`description`),
  `prompt` = VALUES(`prompt`),
  `demoHtml` = VALUES(`demoHtml`),
  `isBuiltin` = VALUES(`isBuiltin`),
  `sortOrder` = VALUES(`sortOrder`);

INSERT INTO `style_preset`
  (`id`, `slug`, `name`, `description`, `prompt`, `demoHtml`, `userId`, `isBuiltin`, `sortOrder`, `updatedAt`)
VALUES (
  '1730000000000000007',
  'tech-blogger',
  '科技博主',
  '暗黑模式，网格背景，等宽字体，霓虹橙强调色，数据矩阵和进度条动画，适合 AI、编程、硬核科普',
  '【视觉风格：科技博主（Tech Blogger）】

整体气质：极客、硬核、数据驱动。暗黑基底 + 网格线 + 霓虹橙 + 等宽字体。

【配色】
- 背景：#121212 深灰黑 (带 rgba 网格)
- 文字：#e0e0e0 浅灰, #888 暗灰
- 强调：#ff4500 霓虹橙

【字体】
- 数据/代码：''Courier New'', monospace
- 标题：sans-serif, bold

【布局与元素】
- 顶部：状态栏 (TRANSFORMER · ATTENTION MATRIX)
- 左侧：大标题 + CSS Grid 实现的注意力热力矩阵 (带发光效果)
- 右侧：面板框，包含进度条 (Context Vector) 和 大号数值 (Max Attn)
- 底部：数学公式

【动画】
- 矩阵单元格错落淡入
- 进度条从左向右填充 (fillBar)
- 活跃单元格带 box-shadow 呼吸/发光

【绝对禁止】
- 禁止使用暖色、柔和色彩
- 禁止使用衬线字体或手写体',
  '<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>科技博主风格</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            background-color: #121212;
            background-image: 
                linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
            background-size: 40px 40px;
            height: 100vh;
            color: #e0e0e0;
            font-family: ''Courier New'', Courier, monospace, sans-serif;
            padding: 40px 60px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            animation: gridDrift 9s linear infinite;
        }
        @keyframes gridDrift { to { background-position: 40px 40px; } }
        .top-bar {
            display: flex; justify-content: space-between; align-items: center;
            border-bottom: 1px solid #333; padding-bottom: 10px; margin-bottom: 40px;
            font-size: 12px; letter-spacing: 2px; color: #888;
        }
        .top-bar span.highlight { color: #ff4500; animation: blink 1.1s steps(1) infinite; }
        @keyframes blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0.15; } }
        .main-content {
            display: flex; flex: 1; gap: 60px;
        }
        .left-col { flex: 1; display: flex; flex-direction: column; }
        .title { font-size: 48px; font-weight: bold; color: #fff; margin-bottom: 5px; font-family: sans-serif;}
        .subtitle { font-size: 18px; color: #ff4500; margin-bottom: 40px; font-weight: bold;}
        .subtitle .caret { display: inline-block; width: 10px; margin-left: 6px; background: #ff4500; animation: blink 1.1s steps(1) infinite; }
        .matrix-container {
            position: relative;
            overflow: hidden;
            display: grid;
            grid-template-columns: 40px repeat(5, 1fr);
            grid-template-rows: 30px repeat(5, 1fr);
            gap: 4px;
            max-width: 500px;
        }
        /* 扫描线：绝对定位，不占网格轨道 */
        .matrix-container::after {
            content: ''''; position: absolute; left: 0; right: 0; top: -30%; height: 30px;
            background: linear-gradient(180deg, transparent, rgba(255, 69, 0, 0.22), transparent);
            animation: scan 3.6s linear infinite; pointer-events: none;
        }
        @keyframes scan { 0% { top: -30%; } 100% { top: 105%; } }
        .axis-label { display: flex; align-items: center; justify-content: center; color: #888; font-size: 12px; }
        .cell {
            background: rgba(255, 69, 0, 0.1);
            display: flex; align-items: center; justify-content: center;
            font-size: 14px; font-weight: bold; color: transparent;
            transition: all 0.3s;
        }
        .cell.active { background: rgba(255, 69, 0, 0.8); color: #fff; box-shadow: 0 0 15px rgba(255, 69, 0, 0.5); }
        .cell.med { background: rgba(255, 69, 0, 0.4); }
        .cell.low { background: rgba(255, 69, 0, 0.2); }
        .right-col {
            width: 350px;
            border: 1px solid rgba(255, 69, 0, 0.3);
            border-radius: 8px;
            padding: 30px;
            background: rgba(0, 0, 0, 0.4);
            display: flex; flex-direction: column;
            animation: panelGlow 3.4s ease-in-out infinite;
        }
        @keyframes panelGlow {
            0%, 100% { border-color: rgba(255, 69, 0, 0.3); box-shadow: 0 0 0 rgba(255, 69, 0, 0); }
            50% { border-color: rgba(255, 69, 0, 0.65); box-shadow: 0 0 26px rgba(255, 69, 0, 0.14); }
        }
        .panel-title { color: #ff4500; font-size: 14px; letter-spacing: 2px; margin-bottom: 30px; border-bottom: 1px solid #333; padding-bottom: 10px;}
        .bar-group { margin-bottom: 20px; display: flex; align-items: center; gap: 15px; }
        .bar-label { width: 20px; color: #888; font-size: 12px; }
        .bar-track { flex: 1; height: 8px; background: #222; border-radius: 4px; overflow: hidden; }
        .bar-fill {
            height: 100%; background: #ff4500; width: 0;
            animation: fillBar 1.5s ease-out forwards, barPulse 2.2s ease-in-out infinite;
        }
        @keyframes barPulse { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.55); } }
        .max-val-container { margin-top: auto; text-align: center; }
        .max-val {
            font-size: 48px; color: #ff4500; font-weight: bold; font-family: sans-serif;
            text-shadow: 0 0 20px rgba(255, 69, 0, 0.4);
            animation: valPulse 2.8s ease-in-out infinite;
        }
        @keyframes valPulse {
            0%, 100% { text-shadow: 0 0 18px rgba(255, 69, 0, 0.35); opacity: 0.92; }
            50% { text-shadow: 0 0 34px rgba(255, 69, 0, 0.85); opacity: 1; }
        }
        .max-label { font-size: 12px; color: #888; letter-spacing: 2px; margin-top: 5px;}
        .formula { position: absolute; bottom: 40px; right: 60px; color: #555; font-size: 14px; }
        .formula .caret { display: inline-block; width: 8px; height: 15px; margin-left: 6px; vertical-align: -2px; background: #ff4500; animation: blink 1.1s steps(1) infinite; }
        @keyframes fillBar { to { width: var(--w); } }
        /* 单元格：错落淡入 + 常驻斜向亮度波纹（延迟沿用 (i+j)*0.1s） */
        .cell { opacity: 0; animation: fadeIn 0.5s forwards, cellWave 4.5s ease-in-out infinite; }
        .cell.active { animation: fadeIn 0.5s forwards, glowPulse 2.4s ease-in-out infinite; }
        @keyframes fadeIn { to { opacity: 1; } }
        @keyframes cellWave {
            0%, 62%, 100% { filter: brightness(1); }
            78% { filter: brightness(1.75); }
        }
        @keyframes glowPulse {
            0%, 100% { box-shadow: 0 0 10px rgba(255, 69, 0, 0.35); filter: brightness(1); }
            50% { box-shadow: 0 0 26px rgba(255, 69, 0, 0.9); filter: brightness(1.25); }
        }
    </style>
</head>
<body>
    <div class="top-bar">
        <div><span class="highlight">|</span> TRANSFORMER · ATTENTION MATRIX</div>
        <div>×</div>
    </div>
    <div class="main-content">
        <div class="left-col">
            <div class="title">大模型注意力</div>
            <div class="subtitle">Attention Mechanism<span class="caret">&nbsp;</span></div>
            <div class="matrix-container" id="matrix"></div>
        </div>
        <div class="right-col">
            <div class="panel-title">CONTEXT VECTOR</div>
            <div class="bar-group"><div class="bar-label">d1</div><div class="bar-track"><div class="bar-fill" style="--w: 85%; animation-delay: 0.5s, 0s;"></div></div></div>
            <div class="bar-group"><div class="bar-label">d2</div><div class="bar-track"><div class="bar-fill" style="--w: 60%; animation-delay: 0.6s, 0.2s;"></div></div></div>
            <div class="bar-group"><div class="bar-label">d3</div><div class="bar-track"><div class="bar-fill" style="--w: 75%; animation-delay: 0.7s, 0.4s;"></div></div></div>
            <div class="bar-group"><div class="bar-label">d4</div><div class="bar-track"><div class="bar-fill" style="--w: 40%; animation-delay: 0.8s, 0.6s;"></div></div></div>
            <div class="bar-group"><div class="bar-label">d5</div><div class="bar-track"><div class="bar-fill" style="--w: 65%; animation-delay: 0.9s, 0.8s;"></div></div></div>
            <div class="bar-group"><div class="bar-label">d6</div><div class="bar-track"><div class="bar-fill" style="--w: 50%; animation-delay: 1.0s, 1.0s;"></div></div></div>
            <div class="max-val-container">
                <div class="max-val">0.88</div>
                <div class="max-label">MAX ATTN</div>
            </div>
        </div>
    </div>
    <div class="formula">softmax(QKᵀ/√dₖ) · V<span class="caret"></span></div>
    <script>
        const matrix = document.getElementById(''matrix'');
        const labels = ['''', ''T₁'', ''T₂'', ''T₃'', ''T₄'', ''T₅''];
        const data = [
            [0.88, 0.1, 0.05, 0.02, 0.01],
            [0.1, 0.78, 0.2, 0.05, 0.02],
            [0.05, 0.15, 0.72, 0.3, 0.1],
            [0.02, 0.05, 0.25, 0.84, 0.15],
            [0.01, 0.02, 0.1, 0.2, 0.82]
        ];
        labels.forEach(l => {
            let div = document.createElement(''div'');
            div.className = ''axis-label'';
            div.innerText = l;
            matrix.appendChild(div);
        });
        for(let i=0; i<5; i++) {
            let rowLabel = document.createElement(''div'');
            rowLabel.className = ''axis-label'';
            rowLabel.innerText = labels[i+1];
            matrix.appendChild(rowLabel);
            for(let j=0; j<5; j++) {
                let cell = document.createElement(''div'');
                let val = data[i][j];
                cell.className = ''cell'';
                if(val > 0.7) cell.classList.add(''active'');
                else if(val > 0.2) cell.classList.add(''med'');
                else cell.classList.add(''low'');
                if(val > 0.7) cell.innerText = val.toFixed(2);
                const d = (i+j)*0.1;
                cell.style.animationDelay = `${d}s, ${d}s`;
                matrix.appendChild(cell);
            }
        }
    </script>
</body>
</html>
',
  NULL, 1, 1, CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `description` = VALUES(`description`),
  `prompt` = VALUES(`prompt`),
  `demoHtml` = VALUES(`demoHtml`),
  `isBuiltin` = VALUES(`isBuiltin`),
  `sortOrder` = VALUES(`sortOrder`);

INSERT INTO `style_preset`
  (`id`, `slug`, `name`, `description`, `prompt`, `demoHtml`, `userId`, `isBuiltin`, `sortOrder`, `updatedAt`)
VALUES (
  '1730000000000000005',
  'crayon-picture-book',
  '蜡笔绘本',
  '高饱和度扁平色块，粗圆角线条，简单几何图形，活泼弹跳动画，适合儿童、轻松科普',
  '【视觉风格：蜡笔绘本（Crayon Picture Book）】

整体气质：童真、活泼、色彩明快。浅绿天空 + 高饱和色块 + 粗黑描边。

【配色】
- 背景：#eafaf1 浅绿
- 主色：#2ecc71 草绿, #e74c3c 鲜红, #f1c40f 明黄, #aed6f1 天蓝
- 描边：#1a1a1a 纯黑

【字体】
- 圆润无衬线体

【布局与元素】
- 核心：SVG 粗线条 (stroke-width: 12, stroke-linecap: round)
- 元素：云朵、山坡、自行车、火柴人
- 装饰：虚线道路

【动画】
- 整体上下浮动（ride 动画）
- 车轮旋转（spin 动画）
- 云朵缓慢平移

【绝对禁止】
- 禁止使用渐变、阴影、写实纹理
- 保持扁平化和粗线条特征',
  '<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>蜡笔绘本风格</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            background-color: #eafaf1;
            height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            overflow: hidden;
            position: relative;
        }
        .cloud {
            position: absolute;
            background: #aed6f1;
            border-radius: 50px;
            width: 120px; height: 40px;
            top: 20%; left: 15%;
            animation: float 6s ease-in-out infinite;
        }
        .cloud::after {
            content: ''''; position: absolute;
            background: #aed6f1; border-radius: 50%;
            width: 50px; height: 50px; top: -20px; left: 20px;
        }
        .cloud.c2 { top: 30%; right: 15%; animation-delay: -3s; transform: scale(0.8); }
        .hill {
            position: absolute;
            bottom: -10%; left: -10%;
            width: 120%; height: 50%;
            background: #2ecc71;
            border-radius: 50% 50% 0 0;
            transform: rotate(-5deg);
            z-index: 1;
        }
        .road-line {
            position: absolute;
            bottom: 15%; left: 20%;
            width: 60%; height: 8px;
            background: repeating-linear-gradient(90deg, #f1c40f 0, #f1c40f 40px, transparent 40px, transparent 80px);
            transform: rotate(-5deg);
            z-index: 2;
        }
        .scene {
            position: relative;
            z-index: 10;
            width: 300px; height: 200px;
            animation: ride 2s ease-in-out infinite alternate;
        }
        @keyframes ride {
            0% { transform: translateY(0) rotate(0deg); }
            100% { transform: translateY(-10px) rotate(2deg); }
        }
        @keyframes float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-15px); }
        }
        svg { width: 100%; height: 100%; overflow: visible; }
        .stroke-thick {
            fill: none; stroke: #1a1a1a; stroke-width: 12; stroke-linecap: round; stroke-linejoin: round;
        }
        .fill-red { fill: #e74c3c; }
        .fill-black { fill: #1a1a1a; }
        .wheel { animation: spin 1s linear infinite; transform-origin: center; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div class="cloud"></div>
    <div class="cloud c2"></div>
    <div class="hill"></div>
    <div class="road-line"></div>
    <div class="scene">
        <svg viewBox="0 0 300 200">
            <g style="transform-origin: 60px 140px;" class="wheel">
                <circle cx="60" cy="140" r="35" class="stroke-thick" fill="white" />
                <line x1="60" y1="105" x2="60" y2="175" class="stroke-thick" stroke-width="4" />
                <line x1="25" y1="140" x2="95" y2="140" class="stroke-thick" stroke-width="4" />
            </g>
            <g style="transform-origin: 220px 140px;" class="wheel">
                <circle cx="220" cy="140" r="35" class="stroke-thick" fill="white" />
                <line x1="220" y1="105" x2="220" y2="175" class="stroke-thick" stroke-width="4" />
                <line x1="185" y1="140" x2="255" y2="140" class="stroke-thick" stroke-width="4" />
            </g>
            <path d="M60,140 L120,70 L200,70 L220,140 M120,70 L140,140 L200,70" class="stroke-thick" stroke="#e74c3c" />
            <circle cx="140" cy="30" r="25" class="fill-black" />
            <path d="M140,55 L120,100 L140,140 M120,100 L180,70 M140,55 L190,60" class="stroke-thick" />
        </svg>
    </div>
</body>
</html>',
  NULL, 1, 2, CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `description` = VALUES(`description`),
  `prompt` = VALUES(`prompt`),
  `demoHtml` = VALUES(`demoHtml`),
  `isBuiltin` = VALUES(`isBuiltin`),
  `sortOrder` = VALUES(`sortOrder`);

INSERT INTO `style_preset`
  (`id`, `slug`, `name`, `description`, `prompt`, `demoHtml`, `userId`, `isBuiltin`, `sortOrder`, `updatedAt`)
VALUES (
  '1730000000000000008',
  'warm-photosynthesis',
  '暖色科普',
  '奶油米色点阵背景，暖橘/叶绿/水蓝配色，SVG 虚线流动动画，适合生物、自然、温馨科普',
  '【视觉风格：暖色科普（Warm Photosynthesis）】

整体气质：温馨、自然、清晰易懂。奶油米色点阵基底 + 暖橘/叶绿/水蓝 + 衬线标题 + 手绘感插图。

【配色】
- 背景：#faf6ed 奶油米色 (带 #e5dfd3 点阵)
- 文字：#2a1810 深咖啡
- 强调色：#fbbf24 太阳黄, #2c5e5a 叶绿, #8ab4f8 水蓝, #d9534f 氧气红

【字体】
- 标题：''Georgia'', ''Songti SC'', serif
- 标签：''Comic Sans MS'', cursive (增加亲和力)

【布局与元素】
- 顶部：大标题 + 化学方程式副标题
- 中心：SVG 绘制的太阳、叶子、水滴、气体分子
- 连线：使用 stroke-dasharray 实现虚线流动效果 (flow 动画)

【动画】
- 虚线持续流动 (模拟能量/物质传输)
- 元素整体轻微上下浮动 (float 动画)
- 页面加载淡入

【绝对禁止】
- 禁止使用冷峻的科技蓝或纯黑背景
- 保持画面的柔和与温度',
  '<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>暖色系 - 光合作用</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { width: 100%; height: 100%; }
        body {
            background-color: #faf6ed; /* 奶油米色 */
            background-image: radial-gradient(#e5dfd3 1px, transparent 1px); /* 点阵纹理 */
            background-size: 20px 20px;
            color: #2a1810;
            font-family: ''Georgia'', ''Songti SC'', serif;
            overflow: hidden;
            position: relative;
        }

        /* 标题区：左上角 */
        .header {
            position: absolute; top: 48px; left: 72px; z-index: 2;
            animation: fadeIn 1s ease-out both;
        }
        .title { font-size: 52px; font-weight: bold; margin-bottom: 12px; }
        .formula-text { font-size: 17px; color: #92400e; letter-spacing: 2px; font-family: sans-serif; }

        /* 绘图舞台：铺满 1280x720，坐标 1:1 */
        .stage {
            position: absolute; inset: 0; width: 100%; height: 100%;
            animation: fadeIn 1.2s ease-out both;
        }

        .sun-core { fill: #f2c40e; stroke: #2a1810; stroke-width: 5; }
        .sun-ray { stroke: #e8a33d; stroke-width: 7; stroke-linecap: round; }

        .leaf-body { fill: #2c6e63; stroke: #2a1810; stroke-width: 8; stroke-linejoin: round; }
        .leaf-stem { fill: none; stroke: #2a1810; stroke-width: 8; stroke-linecap: round; }
        .leaf-vein { stroke: #f7f2e4; stroke-width: 7; stroke-linecap: round; fill: none; }
        .leaf-vein-side { stroke: #a9cfc2; stroke-width: 5; stroke-linecap: round; fill: none; }

        .drop { fill: #8ab4f8; stroke: #2a1810; stroke-width: 5; stroke-linejoin: round; }
        .gas-co2 { fill: #faf6ed; stroke: #2a1810; stroke-width: 5; }
        .gas-o2 { fill: #d9534f; stroke: #2a1810; stroke-width: 5; }
        .bubble { fill: #eba7a3; stroke: #2a1810; stroke-width: 4; }

        .text-label { font-family: ''Comic Sans MS'', cursive, sans-serif; font-size: 22px; fill: #2a1810; text-anchor: middle; dominant-baseline: middle; }
        .text-white { fill: #faf6ed; }
        .text-note { font-family: ''Comic Sans MS'', cursive, sans-serif; font-size: 20px; fill: #92400e; text-anchor: middle; dominant-baseline: middle; }

        /* 虚线流动：模拟能量与物质传输 */
        .flow-line { fill: none; stroke-width: 5; stroke-dasharray: 14, 12; stroke-linecap: round; }
        .flow-sun { stroke: #f59e0b; animation: flow 1.1s linear infinite; }
        .flow-water { stroke: #8ab4f8; animation: flow 1.6s linear infinite reverse; }
        .flow-co2 { stroke: #7d9c7f; animation: flow 1.3s linear infinite reverse; }
        .flow-o2 { stroke: #d9534f; animation: flow 1s linear infinite; }

        @keyframes flow { to { stroke-dashoffset: -26; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        /* 浮动动画：只作用于内层 g，避免覆盖外层 transform="translate()" 定位 */
        .float-slow { animation: floatY 4.5s ease-in-out infinite alternate; }
        .float-fast { animation: floatY 2.8s ease-in-out infinite alternate-reverse; }
        .float-mid { animation: floatY 3.6s ease-in-out infinite alternate; }
        @keyframes floatY { from { transform: translateY(0); } to { transform: translateY(-14px); } }

        /* 太阳光芒缓慢自转 + 日核呼吸 */
        .sun-rays { animation: spin 36s linear infinite; transform-box: fill-box; transform-origin: center; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .sun-pulse { animation: pulse 3.4s ease-in-out infinite alternate; transform-box: fill-box; transform-origin: center; }
        @keyframes pulse { from { transform: scale(1); } to { transform: scale(1.06); } }

        /* 气泡上浮 */
        .bubble-rise { animation: rise 3.2s ease-in-out infinite alternate; }
        .bubble-rise.b2 { animation-duration: 4.4s; animation-delay: -1.2s; }
        @keyframes rise { from { transform: translateY(6px); opacity: .55; } to { transform: translateY(-18px); opacity: .95; } }
    </style>
</head>
<body>
    <div class="header">
        <div class="title">叶子如何制造氧气？</div>
        <div class="formula-text">阳光 + 水 + CO₂ → 葡萄糖 + O₂</div>
    </div>

    <svg class="stage" viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid meet">
        <!-- 太阳（左） -->
        <g transform="translate(150, 380)">
            <g class="float-slow">
                <g class="sun-pulse">
                    <g class="sun-rays">
                        <line x1="0" y1="-76" x2="0" y2="-104" class="sun-ray" />
                        <line x1="0" y1="76" x2="0" y2="104" class="sun-ray" />
                        <line x1="-76" y1="0" x2="-104" y2="0" class="sun-ray" />
                        <line x1="76" y1="0" x2="104" y2="0" class="sun-ray" />
                        <line x1="-54" y1="-54" x2="-74" y2="-74" class="sun-ray" />
                        <line x1="54" y1="54" x2="74" y2="74" class="sun-ray" />
                        <line x1="-54" y1="54" x2="-74" y2="74" class="sun-ray" />
                        <line x1="54" y1="-54" x2="74" y2="-74" class="sun-ray" />
                    </g>
                    <circle cx="0" cy="0" r="60" class="sun-core" />
                </g>
            </g>
        </g>
        <text x="330" y="316" class="text-note">光能</text>

        <!-- 传输虚线 -->
        <path d="M222,362 Q380,326 528,368" class="flow-line flow-sun" />
        <path d="M410,590 Q540,588 672,580" class="flow-line flow-water" />
        <path d="M862,352 Q786,384 712,436" class="flow-line flow-co2" />
        <path d="M724,458 Q860,482 986,432" class="flow-line flow-o2" />

        <!-- 中心大叶（倾斜） -->
        <g transform="translate(625, 406)">
            <g class="float-mid">
                <g transform="rotate(-20)">
                    <path d="M0,-160 C 95,-95 100,80 0,160 C -100,80 -95,-95 0,-160 Z" class="leaf-body" />
                    <path d="M0,158 L0,206" class="leaf-stem" />
                    <path d="M0,-142 L0,150" class="leaf-vein" />
                    <path d="M0,-96 L46,-116" class="leaf-vein-side" />
                    <path d="M0,-96 L-46,-116" class="leaf-vein-side" />
                    <path d="M0,-38 L66,-62" class="leaf-vein-side" />
                    <path d="M0,-38 L-66,-62" class="leaf-vein-side" />
                    <path d="M0,24 L62,2" class="leaf-vein-side" />
                    <path d="M0,24 L-62,2" class="leaf-vein-side" />
                    <path d="M0,86 L44,62" class="leaf-vein-side" />
                    <path d="M0,86 L-44,62" class="leaf-vein-side" />
                </g>
            </g>
        </g>

        <!-- 水滴 H₂O（左下） -->
        <g transform="translate(397, 617)">
            <g class="float-fast">
                <path d="M0,-40 C 28,-6 32,22 0,34 C -32,22 -28,-6 0,-40 Z" class="drop" />
                <text x="0" y="10" class="text-label text-white">H₂O</text>
            </g>
        </g>

        <!-- CO₂（右上） -->
        <g transform="translate(916, 340)">
            <g class="float-slow">
                <circle cx="0" cy="0" r="50" class="gas-co2" />
                <text x="0" y="2" class="text-label">CO₂</text>
            </g>
        </g>
        <text x="916" y="266" class="text-note">二氧化碳</text>

        <!-- O₂（右中） -->
        <g transform="translate(1054, 415)">
            <g class="float-mid">
                <circle cx="0" cy="0" r="65" class="gas-o2" />
                <text x="0" y="4" class="text-label text-white" style="font-size: 30px;">O₂</text>
            </g>
        </g>
        <text x="1054" y="516" class="text-note">氧气</text>

        <!-- 右上小气泡装饰 -->
        <g transform="translate(1149, 336)"><circle cx="0" cy="0" r="27" class="bubble bubble-rise" /></g>
        <g transform="translate(1194, 270)"><circle cx="0" cy="0" r="17" class="bubble bubble-rise b2" /></g>
    </svg>
</body>
</html>
',
  NULL, 1, 3, CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `description` = VALUES(`description`),
  `prompt` = VALUES(`prompt`),
  `demoHtml` = VALUES(`demoHtml`),
  `isBuiltin` = VALUES(`isBuiltin`),
  `sortOrder` = VALUES(`sortOrder`);

INSERT INTO `style_preset`
  (`id`, `slug`, `name`, `description`, `prompt`, `demoHtml`, `userId`, `isBuiltin`, `sortOrder`, `updatedAt`)
VALUES (
  '1730000000000000006',
  'ancient-charm',
  '古韵风格',
  '宣纸纹理，书法字体，朱砂红印章，时间轴曲线，沉稳淡入动画，适合历史、文化、国风内容',
  '【视觉风格：古韵风格（Ancient Charm）】

整体气质：沉稳、历史感、东方美学。宣纸底色 + 朱砂红 + 楷体/书法字 + 留白。

【配色】
- 背景：#eaddcf 宣纸色 (带横向细线纹理)
- 文字/线条：#3e2723 深褐
- 强调：#8b0000 朱砂红

【字体】
- 标题：''Kaiti'', ''STKaiti'', serif (楷体)
- 英文：sans-serif, uppercase, letter-spacing

【布局与元素】
- 背景：底部半透明山峦剪影 (clip-path)
- 核心：SVG 贝塞尔曲线时间轴，带节点弹出动画
- 装饰：右下角朱砂印章 (带边框和阴影)，右上角信息卡片

【动画】
- 整体慢速淡入 (fadeIn 2s)
- 时间轴线条绘制 (drawLine 3s)
- 节点弹性出现 (popIn)
- 印章盖下效果 (stamp: scale + rotate)

【绝对禁止】
- 禁止使用高饱和度现代色彩
- 禁止使用无衬线黑体作为主标题',
  '<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>古韵风格</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { width: 100%; height: 100%; }
        body {
            background-color: #eaddcf;
            background-image: repeating-linear-gradient(transparent, transparent 39px, rgba(139, 69, 19, 0.1) 40px);
            display: flex;
            flex-direction: column;
            padding: 56px 80px;
            font-family: ''Kaiti'', ''STKaiti'', ''KaiTi_GB2312'', serif;
            color: #3e2723;
            overflow: hidden;
            position: relative;
        }
        .mountains {
            position: absolute; bottom: 0; left: 0; width: 100%; height: 40%;
            background: linear-gradient(to top, rgba(160, 140, 120, 0.4), transparent);
            clip-path: polygon(0 100%, 0 60%, 20% 40%, 40% 70%, 60% 30%, 80% 60%, 100% 20%, 100% 100%);
            z-index: 0;
        }
        /* 山间雾气：持续横向漂移 */
        .mist {
            position: absolute; bottom: 12%; left: -30%; width: 70%; height: 16%;
            background: radial-gradient(ellipse at center, rgba(250, 244, 232, 0.75), transparent 70%);
            filter: blur(6px);
            animation: mistDrift 16s ease-in-out infinite alternate;
            z-index: 0;
        }
        @keyframes mistDrift { from { transform: translateX(0); } to { transform: translateX(150%); } }

        /* 14s 主循环：整幕在收尾时淡出，随后重新开场 */
        .stage {
            flex: 1; display: flex; flex-direction: column;
            position: relative; z-index: 1;
            animation: aStage 14s linear infinite;
        }
        @keyframes aStage { 0%, 84% { opacity: 1; } 88%, 100% { opacity: 0; } }

        .header { animation: aHeader 14s linear infinite; }
        @keyframes aHeader { 0% { opacity: 0; } 6%, 86% { opacity: 1; } 90%, 100% { opacity: 0; } }
        .title { font-size: 72px; font-weight: bold; letter-spacing: 8px; margin-bottom: 10px; }
        .subtitle {
            font-family: sans-serif; font-size: 14px; letter-spacing: 4px;
            color: #8b0000; text-transform: uppercase;
        }

        .content { flex: 1; position: relative; margin-top: 36px; }
        .timeline-svg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
        .timeline-path {
            fill: none; stroke: #8b0000; stroke-width: 4;
            stroke-dasharray: 1000; stroke-dashoffset: 1000;
            animation: aDraw 14s linear infinite;
        }
        @keyframes aDraw {
            0%, 8% { stroke-dashoffset: 1000; }
            34%, 86% { stroke-dashoffset: 0; }
            90%, 100% { stroke-dashoffset: 1000; }
        }
        .node {
            fill: #eaddcf; stroke: #8b0000; stroke-width: 4;
            transform-box: fill-box; transform-origin: center;
            opacity: 0;
        }
        .node-1 { animation: aNode1 14s linear infinite; }
        .node-2 { animation: aNode2 14s linear infinite; }
        @keyframes aNode1 {
            0%, 30% { opacity: 0; transform: scale(0); animation-timing-function: cubic-bezier(0.175, 0.885, 0.32, 1.275); }
            36%, 86% { opacity: 1; transform: scale(1); }
            90%, 100% { opacity: 0; transform: scale(0); }
        }
        @keyframes aNode2 {
            0%, 36% { opacity: 0; transform: scale(0); animation-timing-function: cubic-bezier(0.175, 0.885, 0.32, 1.275); }
            42%, 86% { opacity: 1; transform: scale(1); }
            90%, 100% { opacity: 0; transform: scale(0); }
        }
        /* 节点涟漪：常驻呼吸感 */
        .ping {
            fill: none; stroke: #8b0000; stroke-width: 2;
            transform-box: fill-box; transform-origin: center;
            animation: ping 3.2s ease-out infinite;
        }
        .ping-2 { animation-delay: -1.6s; }
        @keyframes ping {
            0% { transform: scale(0.6); opacity: 0.7; }
            70%, 100% { transform: scale(2.4); opacity: 0; }
        }

        .card {
            position: absolute; top: 16px; right: 100px;
            background: rgba(234, 221, 207, 0.9);
            border: 2px solid #3e2723;
            padding: 20px; width: 250px;
            box-shadow: 5px 5px 0 rgba(62, 39, 35, 0.2);
            animation: aCard 14s linear infinite;
        }
        @keyframes aCard {
            0%, 46% { opacity: 0; transform: translateY(24px); animation-timing-function: ease-out; }
            56%, 86% { opacity: 1; transform: translateY(0); }
            90%, 100% { opacity: 0; transform: translateY(24px); }
        }
        .card-line { height: 2px; background: #3e2723; margin-bottom: 15px; width: 100%; }
        .card-line.short { width: 60%; }
        .card-date { text-align: right; color: #8b0000; font-size: 14px; margin-top: 10px; }

        .seal {
            position: absolute; bottom: 56px; right: 80px;
            width: 80px; height: 80px;
            background: #8b0000; color: #eaddcf;
            display: flex; justify-content: center; align-items: center;
            font-size: 32px; font-weight: bold;
            border: 4px double #eaddcf;
            box-shadow: 0 0 0 2px #8b0000;
            animation: aSeal 14s linear infinite;
            z-index: 2;
        }
        @keyframes aSeal {
            0%, 60% { opacity: 0; transform: scale(1.6) rotate(-12deg); animation-timing-function: cubic-bezier(0.175, 0.885, 0.32, 1.275); }
            66%, 86% { opacity: 0.92; transform: scale(1) rotate(0deg); }
            90%, 100% { opacity: 0; transform: scale(1.6) rotate(-12deg); }
        }

        .footer {
            display: flex; gap: 20px; font-size: 14px; color: #5d4037; letter-spacing: 2px;
            animation: aFoot 14s linear infinite;
        }
        @keyframes aFoot { 0%, 70% { opacity: 0; } 78%, 86% { opacity: 1; } 90%, 100% { opacity: 0; } }
    </style>
</head>
<body>
    <div class="mountains"></div>
    <div class="mist"></div>
    <div class="stage">
        <div class="header">
            <div class="title">山河有迹</div>
            <div class="subtitle">History in Motion</div>
        </div>
        <div class="content">
            <svg class="timeline-svg" viewBox="0 0 1000 400" preserveAspectRatio="none">
                <path class="timeline-path" d="M 50,350 Q 250,300 400,200 T 800,50" />
                <circle class="ping" cx="250" cy="280" r="12" />
                <circle class="ping ping-2" cx="450" cy="160" r="12" />
                <circle class="node node-1" cx="250" cy="280" r="12" />
                <circle class="node node-2" cx="450" cy="160" r="12" />
            </svg>
            <div class="card">
                <div class="card-line"></div>
                <div class="card-line"></div>
                <div class="card-line short"></div>
                <div class="card-line"></div>
                <div class="card-date">公元前 1046</div>
            </div>
        </div>
        <div class="seal">古韵</div>
        <div class="footer">
            <span>山河</span> • <span>年代</span> • <span>文物</span> • <span>史迹</span>
        </div>
    </div>
</body>
</html>
',
  NULL, 1, 4, CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `description` = VALUES(`description`),
  `prompt` = VALUES(`prompt`),
  `demoHtml` = VALUES(`demoHtml`),
  `isBuiltin` = VALUES(`isBuiltin`),
  `sortOrder` = VALUES(`sortOrder`);
