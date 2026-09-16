/**
 * 分镜产物（frame 表）读写辅助层
 *
 * frame 表把每个分镜的 htmlCode / imagePath / audioPath 拆成独立行，
 * 每次生成只 upsert 单行，避免旧方案整列 JSON 的写放大与并发覆盖问题。
 *
 * 对外仍暴露与旧结构一致的 VideoSource（{ frames: FrameSource[] }，按 outline 顺序对齐），
 * 前端消费方式保持不变。
 */

import { prisma } from '@/lib/db';
import { newId } from '@/lib/id';
import type { Outline, VideoSource, FrameSource } from '@/types';

/** 单帧可写字段 */
export interface FrameMediaPatch {
  htmlCode?: string | null;
  imagePath?: string | null;
  audioPath?: string | null;
  audioDuration?: number | null;
}

/** 把一行 frame 记录转成对外的 FrameSource（丢弃 null 字段，保持与旧结构一致） */
function toFrameSource(row: {
  frameId: string;
  htmlCode: string | null;
  imagePath: string | null;
  audioPath: string | null;
  audioDuration: number | null;
}): FrameSource {
  const src: FrameSource = { id: row.frameId };
  if (row.htmlCode != null) src.htmlCode = row.htmlCode;
  if (row.imagePath != null) src.imagePath = row.imagePath;
  if (row.audioPath != null) src.audioPath = row.audioPath;
  if (row.audioDuration != null) src.audioDuration = row.audioDuration;
  return src;
}

/**
 * 聚合某项目的 videoSource（按 outline.frames 顺序对齐）。
 * outline 为空时返回 { frames: [] }。
 */
export async function getVideoSource(
  projectId: string,
  outline: Outline | null,
): Promise<VideoSource> {
  if (!outline) return { frames: [] };
  const rows = await prisma.frame.findMany({ where: { projectId } });
  const byFrameId = new Map(rows.map(r => [r.frameId, r]));
  const frames = outline.frames.map(f => {
    const row = byFrameId.get(f.id);
    return row ? toFrameSource(row) : { id: f.id };
  });
  return { frames };
}

/**
 * upsert 单个分镜的媒体产物。只更新传入的字段（undefined 字段保持不变）。
 * orderIndex 用于新建时对齐 outline 顺序。
 */
export async function upsertFrame(
  projectId: string,
  frameId: string,
  orderIndex: number,
  patch: FrameMediaPatch,
): Promise<void> {
  const data: Record<string, unknown> = {};
  if (patch.htmlCode !== undefined) data.htmlCode = patch.htmlCode;
  if (patch.imagePath !== undefined) data.imagePath = patch.imagePath;
  if (patch.audioPath !== undefined) data.audioPath = patch.audioPath;
  if (patch.audioDuration !== undefined) data.audioDuration = patch.audioDuration;

  await prisma.frame.upsert({
    where: { projectId_frameId: { projectId, frameId } },
    create: { id: newId(), projectId, frameId, orderIndex, ...data },
    update: { ...data, orderIndex },
  });
}

/** 取某分镜当前的 htmlCode（用于风格连续参考），不存在返回 null */
export async function getFrameHtml(
  projectId: string,
  frameId: string,
): Promise<string | null> {
  const row = await prisma.frame.findUnique({
    where: { projectId_frameId: { projectId, frameId } },
    select: { htmlCode: true },
  });
  return row?.htmlCode ?? null;
}

/**
 * 让 frame 表与 outline 对齐：
 * - outline 中不存在的分镜（frameId）删除
 * - 存在的更新 orderIndex（保持顺序）
 * - 不主动创建占位行（生成时按需 upsert 即可）
 */
export async function syncFramesToOutline(
  projectId: string,
  outline: Outline,
): Promise<void> {
  const validIds = outline.frames.map(f => f.id);
  await prisma.$transaction([
    prisma.frame.deleteMany({
      where: { projectId, frameId: { notIn: validIds.length ? validIds : ['__none__'] } },
    }),
    ...outline.frames.map((f, i) =>
      prisma.frame.updateMany({
        where: { projectId, frameId: f.id },
        data: { orderIndex: i },
      }),
    ),
  ]);
}

/** 清空单个分镜的媒体产物（重新生成前调用） */
export async function resetFrameMedia(
  projectId: string,
  frameId: string,
): Promise<void> {
  await prisma.frame.updateMany({
    where: { projectId, frameId },
    data: { htmlCode: null, imagePath: null, audioPath: null, audioDuration: null },
  });
}
