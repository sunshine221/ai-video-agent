import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { generateAndSaveTTS } from '@/lib/ai/tts';
import type { Outline, VideoSource } from '@/types';

const schema = z.object({
  projectId: z.string().uuid(),
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

    const project = await prisma.project.findUnique({ where: { uuid: projectId } });
    if (!project || !project.outline) {
      return NextResponse.json({ error: '项目或大纲不存在' }, { status: 404 });
    }
    const outline = project.outline as unknown as Outline;
    const videoSource = (project.videoSource as unknown as VideoSource) || { frames: [] };
    const frame = outline.frames.find(f => f.id === frameId);
    if (!frame) return NextResponse.json({ error: '分镜不存在' }, { status: 404 });
    const idx = outline.frames.findIndex(f => f.id === frameId);

    const tts = await generateAndSaveTTS({ projectId, frameId, text: frame.narration });
    const newSources = [...videoSource.frames];
    newSources[idx] = {
      ...(newSources[idx] || { id: frameId }),
      audioPath: tts.url,
      audioDuration: tts.duration,
    };
    await prisma.project.update({
      where: { uuid: projectId },
      data: { videoSource: { frames: newSources } as any },
    });

    return NextResponse.json({ audioPath: tts.url, audioDuration: tts.duration });
  } catch (err) {
    console.error('[POST /api/tts]', err);
    return NextResponse.json({ error: '旁白生成失败' }, { status: 500 });
  }
}
