import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { generateOutline } from '@/lib/ai/outline';
import { syncFramesToOutline } from '@/lib/frames';

const schema = z.object({
  projectId: z.string().uuid(),
  prompt: z.string().min(1).max(4000),
});

/**
 * POST /api/outline
 * 单独暴露大纲生成（便于直接调用、调试）。
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: '参数错误' }, { status: 400 });
    const { projectId, prompt } = parsed.data;

    const project = await prisma.project.findUnique({ where: { uuid: projectId } });
    if (!project) return NextResponse.json({ error: '项目不存在' }, { status: 404 });

    const outline = await generateOutline(project.type as 'image' | 'html', prompt);
    const updated = await prisma.project.update({
      where: { uuid: projectId },
      data: {
        outline: outline as any,
        title: outline.title,
      },
    });
    // 大纲重建：同步 frame 表（清掉旧分镜产物、对齐新顺序）
    await syncFramesToOutline(projectId, outline);

    return NextResponse.json({ outline, uuid: updated.uuid });
  } catch (err) {
    console.error('[POST /api/outline]', err);
    return NextResponse.json({ error: '大纲生成失败' }, { status: 500 });
  }
}
