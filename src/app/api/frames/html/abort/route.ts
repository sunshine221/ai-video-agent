import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { abortJob } from '@/lib/ai/job-manager';

const schema = z.object({ projectId: z.string().uuid() });

/**
 * POST /api/frames/html/abort
 * 显式中断 HTML 生成任务（唯一会真正停止后台任务的入口）。
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '参数错误' }, { status: 400 });
  const ok = abortJob(parsed.data.projectId, 'html');
  return NextResponse.json({ ok });
}
