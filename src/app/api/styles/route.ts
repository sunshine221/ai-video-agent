import { NextResponse } from 'next/server';
import { getAllStyles } from '@/lib/styles/presets';

/**
 * GET /api/styles
 * 返回所有视觉风格（读数据库）
 */
export async function GET() {
  const styles = await getAllStyles();
  return NextResponse.json({ styles });
}
