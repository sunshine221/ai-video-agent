/**
 * 内置视觉风格 demo 同步脚本。
 *
 * 数据流：scripts/style-demos/<slug>.html（唯一可编辑源）
 *   → 1) 写入数据库 style_preset.demoHtml（可选覆盖 prompt）
 *   → 2) 从数据库现状重新导出 prisma/init.sql 的种子块 与 仓库根 newStyle.sql
 *
 * 运行：node scripts/sync-style-demos.mjs
 *
 * SQL 快照一律由本脚本生成（保证单引号/反斜杠/换行转义正确），请勿手改这两份 SQL。
 */
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const demoDir = path.join(__dirname, 'style-demos');
const initSqlPath = path.join(__dirname, '..', 'prisma', 'init.sql');
const newStyleSqlPath = path.join(__dirname, '..', '..', 'newStyle.sql');

/** 需要同步 demoHtml 的风格：slug → demo 文件名 */
const DEMO_FILES = {
  'hand-drawn-story': 'hand-drawn-story.html',
  'warm-photosynthesis': 'warm-photosynthesis.html',
  'ancient-charm': 'ancient-charm.html',
  'tech-blogger': 'tech-blogger.html',
};

/** 需要一并覆盖的 prompt（其余风格保持数据库现状） */
const PROMPT_OVERRIDES = {
  'hand-drawn-story': `【视觉风格：手绘讲故事（Hand-drawn Story）】

整体气质：复古、叙事感、娓娓道来。米色纸张基底 + 纯黑线条 + 手写字体。

【配色】
- 背景：#f4f1ea 纸张米色
- 线条/文字：#2c2c2c 深炭黑

【字体】
- 手写体：'Comic Sans MS', cursive

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
- 禁止使用现代科技感元素`,
};

// MySQL 字符串转义：反斜杠 + 单引号；换行统一为 CRLF 后转成 \r\n 转义序列（保持单行 INSERT）
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "''");
const sqlStr = (s) =>
  esc(s.replace(/\r?\n/g, '\r\n')).replace(/\r/g, '\\r').replace(/\n/g, '\\n');

const fmtTs = (d) => {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
};

const prisma = new PrismaClient();

// 1) 写库
for (const [slug, file] of Object.entries(DEMO_FILES)) {
  const demoHtml = fs.readFileSync(path.join(demoDir, file), 'utf8');
  const data = { demoHtml };
  if (PROMPT_OVERRIDES[slug]) data.prompt = PROMPT_OVERRIDES[slug];
  const row = await prisma.stylePreset.update({ where: { slug }, data });
  console.log(`[sync] ${slug}: demoHtml=${row.demoHtml.length}B prompt=${row.prompt.length}B`);
}

// 2) 读全表，重新生成 SQL 快照
const rows = await prisma.stylePreset.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
await prisma.$disconnect();

const tuple = (r, tsMode) => {
  const ts = tsMode === 'now' ? 'NOW(), NOW()' : `'${fmtTs(new Date(r.createdAt))}', '${fmtTs(new Date(r.updatedAt))}'`;
  return `('${r.id}', '${r.slug}', '${esc(r.name)}', '${esc(r.description)}', '${sqlStr(r.prompt)}', '${sqlStr(r.demoHtml)}', ${r.userId ? `'${r.userId}'` : 'NULL'}, ${r.isBuiltin ? 1 : 0}, ${r.sortOrder}, ${ts})`;
};

// --- prisma/init.sql：替换种子块（注释块 + 每条一行 INSERT） ---
const initSql = fs.readFileSync(initSqlPath, 'utf8');
const marker = '-- 内置视觉风格种子数据';
const markerIdx = initSql.indexOf(marker);
if (markerIdx === -1) throw new Error('init.sql 中未找到种子块注释标记');
const blockStart = initSql.lastIndexOf('-- ===', markerIdx);
const head = initSql.slice(0, blockStart);
const seedBlock = [
  '-- ===============================================',
  `-- 内置视觉风格种子数据（${rows.length} 套）`,
  '-- 由 scripts/sync-style-demos.mjs 从数据库 style_preset 现状导出，请勿手改。',
  '-- ===============================================',
  ...rows.map((r) => `INSERT INTO \`ai_video\`.\`style_preset\` (\`id\`, \`slug\`, \`name\`, \`description\`, \`prompt\`, \`demoHtml\`, \`userId\`, \`isBuiltin\`, \`sortOrder\`, \`createdAt\`, \`updatedAt\`) VALUES ${tuple(r, 'ts')};`),
  '',
].join('\n');
fs.writeFileSync(initSqlPath, head + seedBlock, 'utf8');
console.log(`[sync] 已重写 ${initSqlPath} 种子块（${rows.length} 条）`);

// --- 仓库根 newStyle.sql：单条多值 INSERT，元组之间空行分隔（与历史格式一致） ---
const tuplesJoined = rows.map((r, i) => tuple(r, 'now') + (i === rows.length - 1 ? ';' : ',')).join('\n\n');
fs.writeFileSync(
  newStyleSqlPath,
  'INSERT INTO `ai_video`.`style_preset` (`id`, `slug`, `name`, `description`, `prompt`, `demoHtml`, `userId`, `isBuiltin`, `sortOrder`, `createdAt`, `updatedAt`) VALUES \n' + tuplesJoined + '\n',
  'utf8',
);
console.log(`[sync] 已重写 ${newStyleSqlPath}（${rows.length} 条元组）`);
