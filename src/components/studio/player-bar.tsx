'use client';

import { Play, Pause, Square, Maximize2, Minimize2, Download, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDuration, cn } from '@/lib/utils';
import type { ProjectDetail, FrameSource } from '@/types';
import { useEffect, useRef, useState } from 'react';

type ExportStatus = 'idle' | 'preparing' | 'rendering' | 'encoding' | 'finalizing' | 'failed';

interface PlayerBarProps {
  project: ProjectDetail;
  currentIndex: number;
  totalDuration: number;
  isPlaying: boolean;
  currentTime: number;
  audioRef: React.RefObject<HTMLAudioElement>;
  onTogglePlay: () => void;
  onStop: () => void;
  /** 预览区 DOM ref，用于"全屏预览区域"（而不是全屏整个页面） */
  previewRef?: React.RefObject<HTMLElement>;
  /** 进入全屏后自动开始播放 */
  onEnterFullscreenAutoPlay?: () => void;
  exportStatus: ExportStatus;
  exportMessage: string;
  onExport: () => void;
  onCancelExport: () => void;
}

export function PlayerBar({
  project,
  currentIndex,
  totalDuration,
  isPlaying,
  currentTime,
  audioRef,
  onTogglePlay,
  onStop,
  previewRef,
  onEnterFullscreenAutoPlay,
  exportStatus,
  exportMessage,
  onExport,
  onCancelExport,
}: PlayerBarProps) {
  const [isFs, setIsFs] = useState(false);
  const fsContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onFsChange() {
      setIsFs(!!document.fullscreenElement);
    }
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const currentFrameSource: FrameSource | null =
    project.videoSource?.frames[currentIndex] ?? null;
  const hasFrames = (project.outline?.frames.length ?? 0) > 0;
  const progressPct = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;
  const isExportBusy = exportStatus !== 'idle' && exportStatus !== 'failed';

  async function handleFullscreen() {
    const target = (previewRef?.current ?? fsContainerRef.current) as HTMLElement | null;
    if (!target) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      try {
        await target.requestFullscreen?.();
        onEnterFullscreenAutoPlay?.();
      } catch (err) {
        console.warn('[fullscreen] 进入失败：', err);
      }
    }
  }

  return (
    <>
      <div
        ref={fsContainerRef}
        className={cn(
          'flex h-12 flex-shrink-0 items-center gap-3 border-t bg-white px-4',
          isFs && 'bg-slate-900 text-white',
        )}
      >
        {/* 播放/停止/进度由下方 Timeline 统一承担，这里仅保留全屏时的播放控制 */}
        {isFs && (
          <>
            <Button
              size="icon"
              variant={isPlaying ? 'default' : 'secondary'}
              onClick={onTogglePlay}
              disabled={!hasFrames || isExportBusy}
              title={isPlaying ? '暂停' : '播放'}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={onStop}
              disabled={!hasFrames || isExportBusy}
              title="停止"
              className="hover:bg-slate-800 text-white"
            >
              <Square className="h-3.5 w-3.5" />
            </Button>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-700">
              <div className="h-full bg-primary transition-all duration-100" style={{ width: `${progressPct}%` }} />
            </div>
          </>
        )}

        <div className={cn('font-mono text-xs tabular-nums', isFs ? 'text-slate-300' : 'text-muted-foreground')}>
          {formatDuration(currentTime)}/{formatDuration(totalDuration)}
          <span className="ml-2">
            ({project.outline?.frames.length ?? 0} 镜)
          </span>
        </div>
        {!isFs && <div className="flex-1" />}

        {exportMessage ? (
          <div className={cn('max-w-56 truncate text-xs', exportStatus === 'failed' ? 'text-red-500' : isFs ? 'text-slate-300' : 'text-muted-foreground')}>
            {exportMessage}
          </div>
        ) : null}

        {isExportBusy ? (
          <Button
            size="sm"
            variant="destructive"
            onClick={onCancelExport}
            title="取消导出"
          >
            <X className="mr-1 h-3.5 w-3.5" />
            取消导出
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={onExport}
            disabled={!hasFrames}
            title="导出带声音的 MP4 视频"
          >
            <Download className="mr-1 h-3.5 w-3.5" />
            导出视频
          </Button>
        )}

        <Button
          size="icon"
          variant="ghost"
          onClick={handleFullscreen}
          title={isFs ? '退出全屏' : '全屏预览区（自动播放）'}
          className={isFs ? 'hover:bg-slate-800 text-white' : ''}
          disabled={isExportBusy}
        >
          {isFs ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
      </div>

      {/*
        稳定挂载一个 audio，通过 src 切换帧（不要用 key 强制重建）。
        src 由父组件根据 currentIndex 算出。
      */}
      {currentFrameSource?.audioPath && (
        <audio
          ref={audioRef}
          src={currentFrameSource.audioPath}
          preload="auto"
        />
      )}
    </>
  );
}
