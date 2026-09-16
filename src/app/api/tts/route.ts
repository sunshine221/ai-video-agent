import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { generateAndSaveTTS } from '@/lib/ai/tts';
import { upsertFrame } from '@/lib/frames';
import { assertProjectAccess } from '@/lib/session';
import type { Outline } from '@/types';

const schema = z.object({
  projectId: z.string().min(1),
  frameId: z.string().min(1),
  regen: z.boolean().optional(),
});

/**
 * POST /api/tts
 * 单独重生成分镜旁白（用于大纲弹窗中点"重新生成旁白"）。
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: '参数错误' }, { status: 400 });
    const { projectId, frameId } = parsed.data;

    const access = await assertProjectAccess(projectId);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.status === 401 ? '未登录' : '项目不存在' },
        { status: access.status },
      );
    }

    const project = await prisma.project.findUnique({ where: { uuid: projectId } });
    if (!project || !project.outline) {
      return NextResponse.json({ error: '项目或大纲不存在' }, { status: 404 });
    }
    const outline = project.outline as unknown as Outline;
    const frame = outline.frames.find(f => f.id === frameId);
    if (!frame) return NextResponse.json({ error: '分镜不存在' }, { status: 404 });
    const idx = outline.frames.findIndex(f => f.id === frameId);

    const tts = await generateAndSaveTTS({ projectId, frameId, text: frame.narration });
    await upsertFrame(projectId, frameId, idx, {
      audioPath: tts.url,
      audioDuration: tts.duration,
    });

    return NextResponse.json({ audioPath: tts.url, audioDuration: tts.duration });
  } catch (err) {
    console.error('[POST /api/tts]', err);
    return NextResponse.json({ error: '旁白生成失败' }, { status: 500 });
  }
}
