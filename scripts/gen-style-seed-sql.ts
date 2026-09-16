/**
 * 生成第一代版本的单一基线迁移：建表 DDL + 内置风格种子数据。
 *
 * 运行：npx tsx scripts/gen-style-seed-sql.ts
 * 输出：prisma/migrations/0001_init/migration.sql
 *
 * 用脚本生成而非手写，是为了保证 demoHtml/prompt 里大量单引号被正确转义。
 * 当以后修改了 presets.ts 里的内置风格，可重新运行本脚本刷新该迁移。
 *
 * DDL 部分与 schema.prisma 完全一致（由
 * `npx prisma migrate diff --from-empty --to-schema-datamodel ./prisma/schema.prisma --script`
 * 生成），修改 schema 后需同步更新下方 DDL 常量。
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { STYLE_PRESET_SEEDS } from '../src/lib/styles/presets';

// 建表语句，与 prisma/schema.prisma 保持一致
const DDL = `-- CreateTable
CREATE TABLE \`user\` (
    \`id\` VARCHAR(191) NOT NULL,
    \`email\` VARCHAR(191) NOT NULL,
    \`passwordHash\` VARCHAR(191) NOT NULL,
    \`name\` VARCHAR(191) NULL,
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updatedAt\` DATETIME(3) NOT NULL,

    UNIQUE INDEX \`user_email_key\`(\`email\`),
    PRIMARY KEY (\`id\`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE \`project\` (
    \`uuid\` VARCHAR(191) NOT NULL,
    \`title\` VARCHAR(191) NOT NULL,
    \`type\` VARCHAR(191) NOT NULL,
    \`styleId\` VARCHAR(191) NULL,
    \`brief\` JSON NULL,
    \`outline\` JSON NULL,
    \`userId\` VARCHAR(191) NULL,
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updatedAt\` DATETIME(3) NOT NULL,

    INDEX \`project_createdAt_idx\`(\`createdAt\`),
    INDEX \`project_userId_idx\`(\`userId\`),
    PRIMARY KEY (\`uuid\`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE \`frame\` (
    \`id\` VARCHAR(191) NOT NULL,
    \`projectId\` VARCHAR(191) NOT NULL,
    \`frameId\` VARCHAR(191) NOT NULL,
    \`orderIndex\` INTEGER NOT NULL,
    \`htmlCode\` LONGTEXT NULL,
    \`imagePath\` VARCHAR(191) NULL,
    \`audioPath\` VARCHAR(191) NULL,
    \`audioDuration\` DOUBLE NULL,
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updatedAt\` DATETIME(3) NOT NULL,

    INDEX \`frame_projectId_orderIndex_idx\`(\`projectId\`, \`orderIndex\`),
    UNIQUE INDEX \`frame_projectId_frameId_key\`(\`projectId\`, \`frameId\`),
    PRIMARY KEY (\`id\`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE \`message\` (
    \`id\` VARCHAR(191) NOT NULL,
    \`projectId\` VARCHAR(191) NOT NULL,
    \`role\` VARCHAR(191) NOT NULL,
    \`content\` TEXT NOT NULL,
    \`metadata\` JSON NULL,
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX \`message_projectId_createdAt_idx\`(\`projectId\`, \`createdAt\`),
    PRIMARY KEY (\`id\`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE \`style_preset\` (
    \`id\` VARCHAR(191) NOT NULL,
    \`slug\` VARCHAR(191) NOT NULL,
    \`name\` VARCHAR(191) NOT NULL,
    \`description\` TEXT NOT NULL,
    \`prompt\` TEXT NOT NULL,
    \`demoHtml\` LONGTEXT NOT NULL,
    \`userId\` VARCHAR(191) NULL,
    \`isBuiltin\` BOOLEAN NOT NULL DEFAULT true,
    \`sortOrder\` INTEGER NOT NULL DEFAULT 0,
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updatedAt\` DATETIME(3) NOT NULL,

    UNIQUE INDEX \`style_preset_slug_key\`(\`slug\`),
    INDEX \`style_preset_userId_idx\`(\`userId\`),
    PRIMARY KEY (\`id\`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`;

// MySQL 字符串转义：反斜杠 + 单引号
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "''");

const statements = STYLE_PRESET_SEEDS.map((s, i) => {
  return [
    'INSERT INTO `style_preset`',
    '  (`id`, `slug`, `name`, `description`, `prompt`, `demoHtml`, `userId`, `isBuiltin`, `sortOrder`, `updatedAt`)',
    'VALUES (',
    `  '${esc(s.id)}',`,
    `  '${esc(s.slug)}',`,
    `  '${esc(s.name)}',`,
    `  '${esc(s.description)}',`,
    `  '${esc(s.prompt)}',`,
    `  '${esc(s.demoHtml)}',`,
    `  NULL, 1, ${i}, CURRENT_TIMESTAMP(3)`,
    ')',
    'ON DUPLICATE KEY UPDATE',
    '  `name` = VALUES(`name`),',
    '  `description` = VALUES(`description`),',
    '  `prompt` = VALUES(`prompt`),',
    '  `demoHtml` = VALUES(`demoHtml`),',
    '  `isBuiltin` = VALUES(`isBuiltin`),',
    '  `sortOrder` = VALUES(`sortOrder`);',
  ].join('\n');
});

const sql = `-- ===============================================
-- AI 视频制作智能体 — 第一代基线迁移
-- 建表 DDL 与 schema.prisma 一致；风格种子数据由
-- scripts/gen-style-seed-sql.ts 从 STYLE_PRESET_SEEDS 生成，请勿手改。
-- 数据库：MySQL 8.0+，字符集 utf8mb4
-- ===============================================

${DDL}

-- 内置视觉风格初始数据（${STYLE_PRESET_SEEDS.length} 套）
${statements.join('\n\n')}\n`;

const dir = join(process.cwd(), 'prisma', 'migrations', '0001_init');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'migration.sql'), sql, 'utf8');

console.log(`[gen] 已写入 ${join(dir, 'migration.sql')}，含建表 DDL + ${STYLE_PRESET_SEEDS.length} 条风格 INSERT。`);
