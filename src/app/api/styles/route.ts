import { NextResponse } from 'next/server';
import { STYLE_PRESETS } from '@/lib/styles/presets';

/**
 * GET /api/styles
 * 返回所有内置视觉风格
 */
export async function GET() {
  return NextResponse.json({ styles: STYLE_PRESETS });
}
