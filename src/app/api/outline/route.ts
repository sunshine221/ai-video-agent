import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { generateOutline } from '@/lib/ai/outline';
import { updateBrief } from '@/lib/ai/brief';
import { syncFramesToOutline } from '@/lib/frames';
import { assertProjectAccess } from '@/lib/session';
import type { CreativeBrief } from '@/types';

const schema = z.object({
  projectId: z.string().min(1),
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

    const access = await assertProjectAccess(projectId);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.status === 401 ? '未登录' : '项目不存在' },
        { status: access.status },
      );
    }

    const project = await prisma.project.findUnique({ where: { uuid: projectId } });
    if (!project) return NextResponse.json({ error: '项目不存在' }, { status: 404 });

    // 先把用户要求合并进创作简报，再从简报派生大纲（唯一事实来源）
    const currentBrief = (project.brief as unknown as CreativeBrief) ?? null;
    const brief = await updateBrief(currentBrief, prompt);
    const outline = await generateOutline(project.type as 'image' | 'html', brief);
    const updated = await prisma.project.update({
      where: { uuid: projectId },
      data: {
        brief: brief as any,
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
