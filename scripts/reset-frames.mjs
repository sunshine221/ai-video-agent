// 临时：清空指定项目的分镜产物（把 htmlCode/imagePath/audioPath 清掉），便于重新测试生成
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const uuid = process.argv[2] || 'a8651191-6d90-4703-b45c-c87af027d303';
const r = await prisma.frame.updateMany({
  where: { projectId: uuid },
  data: { htmlCode: null, imagePath: null, audioPath: null, audioDuration: null },
});
console.log('已清空 frame 产物，受影响行数 =', r.count);
await prisma.$disconnect();
