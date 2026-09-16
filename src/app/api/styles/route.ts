import { NextResponse } from 'next/server';
import { getAllStyles } from '@/lib/styles/presets';

// 该路由读数据库，不能在构建期静态预渲染，标记为运行时动态执行
export const dynamic = 'force-dynamic';

/**
 * GET /api/styles
 * 返回所有视觉风格（读数据库）
 */
export async function GET() {
  const styles = await getAllStyles();
  return NextResponse.json({ styles });
}
