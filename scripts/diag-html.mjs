// 诊断：用与 generateFrameHtml 完全相同的参数，直接调 LLM，打印原始返回
import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const uuid = 'a8651191-6d90-4703-b45c-c87af027d303';
const p = await prisma.project.findUnique({ where: { uuid } });
const outline = p.outline;
const frame = outline.frames[0];
const globalScript = outline.frames.map(f => `[#${f.index}] ${f.title}: ${f.narration}`).join('\n');
await prisma.$disconnect();

const system = `你是一位网页动画视频设计工程师。输出严格 JSON：{ "html": "完整 HTML 文档" }`;
const user = `【全局脚本】\n${globalScript}\n\n【当前分镜】\n标题：${frame.title}\n旁白：${frame.narration}\n\n请输出 JSON：{ "html": "..." }`;

const client = new OpenAI({ apiKey: process.env.AI_API_KEY, baseURL: process.env.AI_BASE_URL });
console.log('model =', process.env.AI_MODEL);
console.log('globalScript 长度 =', globalScript.length, '| 旁白长度 =', frame.narration.length);
try {
  const t = Date.now();
  const c = await client.chat.completions.create({
    model: process.env.AI_MODEL,
    temperature: 0.8,
    max_tokens: 16000,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    enable_thinking: false,
  });
  const choice = c.choices[0];
  console.log('耗时 =', Date.now() - t, 'ms');
  console.log('finish_reason =', choice?.finish_reason);
  console.log('usage =', JSON.stringify(c.usage));
  const text = choice?.message?.content || '';
  console.log('content 长度 =', text.length);
  console.log('content 前 300 字符 =\n', text.slice(0, 300));
  try { JSON.parse(text); console.log('JSON.parse: OK'); }
  catch (e) { console.log('JSON.parse 失败:', e.message); }
} catch (err) {
  console.log('API 调用异常:', err.status || '', err.message);
  if (err.error) console.log('error 详情:', JSON.stringify(err.error).slice(0, 500));
}
