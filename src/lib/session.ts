import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * 服务端获取当前登录用户 id。未登录返回 null。
 * 用于 API 路由做登录校验与数据隔离。
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.id ?? null;
}

export type ProjectAccess =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 404 };

/**
 * 校验：当前用户已登录，且指定项目归属该用户。
 * - 未登录 → 401
 * - 项目不存在 / 不属于当前用户 → 404（不暴露他人项目的存在）
 */
export async function assertProjectAccess(projectId: string): Promise<ProjectAccess> {
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, status: 401 };

  const project = await prisma.project.findUnique({
    where: { uuid: projectId },
    select: { userId: true },
  });
  if (!project || project.userId !== userId) {
    return { ok: false, status: 404 };
  }
  return { ok: true, userId };
}
