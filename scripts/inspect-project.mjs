// 临时诊断脚本：打印项目的大纲/视频源生成状态
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const projects = await prisma.project.findMany({
  select: { uuid: true, title: true, type: true, outline: true, videoSource: true },
  orderBy: { updatedAt: 'desc' },
});

for (const p of projects) {
  const frames = p.outline?.frames ?? [];
  const src = p.videoSource?.frames ?? [];
  console.log('========================================');
  console.log('title :', p.title);
  console.log('type  :', p.type, '| uuid:', p.uuid);
  console.log('大纲帧数:', frames.length, '| videoSource帧数:', src.length);
  frames.forEach((f, i) => {
    const s = src[i] || {};
    console.log(
      `  #${i + 1} ${f.title?.slice(0, 20)} | htmlCode:${s.htmlCode ? s.htmlCode.length + '字符' : '空'} | imagePath:${s.imagePath || '空'} | audioPath:${s.audioPath || '空'}`
    );
  });
}
await prisma.$disconnect();
