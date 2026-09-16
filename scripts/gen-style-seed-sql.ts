/**
 * 从 STYLE_PRESET_SEEDS 生成内置风格的初始数据 SQL 迁移文件。
 *
 * 运行：npx tsx scripts/gen-style-seed-sql.ts
 * 输出：prisma/migrations/0005_seed_style_preset/migration.sql
 *
 * 用脚本生成而非手写，是为了保证 demoHtml/prompt 里大量单引号被正确转义。
 * 当以后修改了 presets.ts 里的内置风格，可重新运行本脚本刷新该 SQL。
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { STYLE_PRESET_SEEDS } from '../src/lib/styles/presets';

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

const sql = `-- 内置视觉风格初始数据（${STYLE_PRESET_SEEDS.length} 套）\n-- 由 scripts/gen-style-seed-sql.ts 从 STYLE_PRESET_SEEDS 生成，请勿手改。\n\n${statements.join('\n\n')}\n`;

const dir = join(process.cwd(), 'prisma', 'migrations', '0005_seed_style_preset');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'migration.sql'), sql, 'utf8');

console.log(`[gen] 已写入 ${join(dir, 'migration.sql')}，共 ${STYLE_PRESET_SEEDS.length} 条 INSERT。`);
