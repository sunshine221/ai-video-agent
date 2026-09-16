'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

type ExportStatus = 'idle' | 'preparing' | 'rendering' | 'encoding' | 'finalizing' | 'failed';

interface ExportRecordingOverlayProps {
  open: boolean;
  status: ExportStatus;
  message: string;
  progress: number;
}

export function ExportRecordingOverlay({
  open,
  status,
  message,
  progress,
}: ExportRecordingOverlayProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!open || !mounted) return null;

  const label =
    status === 'preparing' ? '正在准备导出' :
    status === 'rendering' ? '正在渲染分镜' :
    status === 'encoding' ? '正在合成片段' :
    status === 'finalizing' ? '正在拼接视频' :
    '正在导出';

  const pct = Math.max(0, Math.min(100, Math.round(progress)));

  const overlayContent = (
    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-[320px] rounded-2xl border border-slate-700 bg-slate-950/92 px-6 py-6 text-white shadow-2xl">
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 h-3 w-3 rounded-full bg-orange-400 animate-pulse" />
          <div className="mb-2 rounded bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
            MP4 (H.264 + AAC)
          </div>
          <div className="text-sm text-slate-200">{label}</div>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-700">
            <div
              className="h-full rounded-full bg-gradient-to-r from-orange-500 to-orange-400 transition-all duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">{pct}%</div>
          {message ? (
            <div className="mt-2 text-xs text-slate-400">{message}</div>
          ) : null}
        </div>
      </div>
    </div>
  );

  return createPortal(overlayContent, document.body);
}
