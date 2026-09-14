import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const createSchema = z.object({
  type: z.enum(['image', 'html']),
});

/**
 * POST /api/projects
 * 创建项目
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: '参数错误：type 必须为 image 或 html' }, { status: 400 });
    }
    const { type } = parsed.data;
    const title = type === 'image' ? '图片轮播视频项目' : 'HTML 动画视频项目';

    const project = await prisma.project.create({
      data: {
        title,
        type,
        outline: undefined,
      },
    });

    return NextResponse.json({ uuid: project.uuid, title: project.title, type: project.type });
  } catch (err) {
    console.error('[POST /api/projects]', err);
    return NextResponse.json({ error: '创建项目失败' }, { status: 500 });
  }
}

/**
 * GET /api/projects
 * 获取项目列表（按创建时间倒序）
 */
export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        uuid: true,
        title: true,
        type: true,
        createdAt: true,
        updatedAt: true,
        outline: true,
      },
    });
    const list = projects.map(p => ({
      uuid: p.uuid,
      title: p.title,
      type: p.type,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      hasOutline: Boolean(p.outline),
    }));
    return NextResponse.json(list);
  } catch (err) {
    console.error('[GET /api/projects]', err);
    return NextResponse.json({ error: '获取项目列表失败' }, { status: 500 });
  }
}
