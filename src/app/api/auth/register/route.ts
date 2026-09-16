import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/db';
import { newId } from '@/lib/id';

const schema = z.object({
  email: z.string().email('邮箱格式不正确'),
  password: z.string().min(6, '密码至少 6 位').max(72),
  name: z.string().max(50).optional(),
});

/**
 * POST /api/auth/register
 * 邮箱 + 密码注册。密码用 bcrypt 哈希后存库。
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || '参数错误' },
        { status: 400 },
      );
    }
    const email = parsed.data.email.trim().toLowerCase();
    const { password, name } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: '该邮箱已被注册' }, { status: 409 });
    }

    const passwordHash = await hash(password, 10);
    const user = await prisma.user.create({
      data: { id: newId(), email, passwordHash, name: name || null },
    });

    return NextResponse.json({ id: user.id, email: user.email });
  } catch (err) {
    console.error('[POST /api/auth/register]', err);
    return NextResponse.json({ error: '注册失败' }, { status: 500 });
  }
}
