import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { abortJob } from '@/lib/ai/job-manager';
import { assertProjectAccess } from '@/lib/session';

const schema = z.object({ projectId: z.string().min(1) });

/**
 * POST /api/frames/html/abort
 * 显式中断 HTML 生成任务（唯一会真正停止后台任务的入口）。
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '参数错误' }, { status: 400 });

  const access = await assertProjectAccess(parsed.data.projectId);
  if (!access.ok) {
    return NextResponse.json(
      { error: access.status === 401 ? '未登录' : '项目不存在' },
      { status: access.status },
    );
  }

  const ok = abortJob(parsed.data.projectId, 'html');
  return NextResponse.json({ ok });
}
