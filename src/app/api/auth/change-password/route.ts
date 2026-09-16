import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { compare, hash } from 'bcryptjs';
import { prisma } from '@/lib/db';
import { getCurrentUserId } from '@/lib/session';

const schema = z.object({
  oldPassword: z.string().min(1, '请输入当前密码'),
  newPassword: z.string().min(6, '新密码至少 6 位').max(72),
});

/**
 * POST /api/auth/change-password
 * 修改当前登录用户的密码：校验旧密码 -> bcrypt 哈希新密码 -> 更新。
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || '参数错误' },
        { status: 400 },
      );
    }
    const { oldPassword, newPassword } = parsed.data;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return NextResponse.json({ error: '用户不存在' }, { status: 404 });

    const ok = await compare(oldPassword, user.passwordHash);
    if (!ok) return NextResponse.json({ error: '当前密码不正确' }, { status: 400 });

    const passwordHash = await hash(newPassword, 10);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/auth/change-password]', err);
    return NextResponse.json({ error: '修改密码失败' }, { status: 500 });
  }
}
