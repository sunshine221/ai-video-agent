import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

interface RouteContext {
  params: { id: string };
}

/**
 * GET /api/projects/[id]
 */
export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const project = await prisma.project.findUnique({
      where: { uuid: params.id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!project) return NextResponse.json({ error: '项目不存在' }, { status: 404 });
    return NextResponse.json({
      uuid: project.uuid,
      title: project.title,
      type: project.type,
      styleId: project.styleId,
      outline: project.outline,
      videoSource: project.videoSource,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      messages: project.messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        metadata: m.metadata,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error('[GET /api/projects/[id]]', err);
    return NextResponse.json({ error: '获取项目失败' }, { status: 500 });
  }
}

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  outline: z.any().optional(),
  videoSource: z.any().optional(),
  styleId: z.string().nullable().optional(),
});

/**
 * PATCH /api/projects/[id]
 * 部分更新项目
 */
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: '参数错误' }, { status: 400 });
    }
    const project = await prisma.project.update({
      where: { uuid: params.id },
      data: parsed.data,
    });
    return NextResponse.json({ uuid: project.uuid });
  } catch (err) {
    console.error('[PATCH /api/projects/[id]]', err);
    return NextResponse.json({ error: '更新项目失败' }, { status: 500 });
  }
}

/**
 * DELETE /api/projects/[id]
 */
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  try {
    await prisma.project.delete({ where: { uuid: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/projects/[id]]', err);
    return NextResponse.json({ error: '删除项目失败' }, { status: 500 });
  }
}
