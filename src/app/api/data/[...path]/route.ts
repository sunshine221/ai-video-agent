import { NextRequest, NextResponse } from 'next/server';
import { createReadStream, statSync } from 'fs';
import { readFile } from 'fs/promises';
import { join, normalize, resolve } from 'path';
import { Readable } from 'stream';
import { getCurrentUserId } from '@/lib/session';

interface RouteContext {
  params: { path: string[] };
}

/**
 * GET /api/data/[...path]
 * 服务 data/ 目录下的本地文件（图片、音频）。
 * 路径越界检查：必须落在 DATA_ROOT 之下。
 */
const DATA_ROOT = resolve(process.cwd(), 'data');

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
};

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const rel = params.path.join('/');
    const fullPath = normalize(join(DATA_ROOT, rel));
    if (!fullPath.startsWith(DATA_ROOT)) {
      return NextResponse.json({ error: '路径非法' }, { status: 400 });
    }
    const ext = fullPath.slice(fullPath.lastIndexOf('.')).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      return NextResponse.json({ error: '不允许访问目录' }, { status: 404 });
    }
    const buf = await readFile(fullPath);
    return new NextResponse(buf, {
      headers: {
        'content-type': mime,
        'content-length': String(stat.size),
        'cache-control': 'private, max-age=3600',
      },
    });
  } catch (err) {
    console.error('[GET /api/data]', err);
    return NextResponse.json({ error: '文件不存在' }, { status: 404 });
  }
}

// 防止 lint 警告
void createReadStream;
void Readable;
