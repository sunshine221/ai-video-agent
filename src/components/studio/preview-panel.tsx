'use client';

import { useMemo, useCallback, useRef } from 'react';
import { useStudioStore } from '@/stores/studio-store';
import { PlayerBar } from './player-bar';
import { StoryboardStrip } from './storyboard-strip';
import { PreviewCanvas } from './preview-canvas';
import { PreviewToolbar } from './preview-toolbar';
import { usePlayer } from '@/components/player/use-player';
import type { ProjectDetail, FrameSource } from '@/types';

interface PreviewPanelProps {
  project: ProjectDetail;
  onProjectChange: (p: ProjectDetail) => void;
  onFrameSelect: (id: string | null) => void;
}

export function PreviewPanel({ project, onProjectChange, onFrameSelect }: PreviewPanelProps) {
  const selectedFrameId = useStudioStore(s => s.selectedFrameId);
  const showSubtitle = useStudioStore(s => s.showSubtitle);
  // ⭐ ref 指向 PreviewCanvas 内容本身（不是外层 wrapper），
  // 这样全屏时不会带 padding/rounded border，画面才能真正铺满
  const previewCanvasRef = useRef<HTMLDivElement>(null);

  // 大纲更新时默认选中第一帧
  const outlineFirstId = project.outline?.frames?.[0]?.id;
  useMemo(() => {
    if (!selectedFrameId && outlineFirstId) {
      onFrameSelect(outlineFirstId);
    }
  }, [outlineFirstId, selectedFrameId, onFrameSelect]);

  // 拉取最新项目数据
  const refresh = useCallback(async (): Promise<ProjectDetail | undefined> => {
    try {
      const res = await fetch(`/api/projects/${project.uuid}`);
      if (!res.ok) return undefined;
      const data = await res.json();
      onProjectChange(data);
      return data;
    } catch {
      return undefined;
    }
  }, [project.uuid, onProjectChange]);

  // 外部选中帧的索引（用于初始 / 暂停时切帧）
  const selectedFrameIndex = useMemo(() => {
    if (!selectedFrameId || !project.outline) return 0;
    const idx = project.outline.frames.findIndex(f => f.id === selectedFrameId);
    return idx < 0 ? 0 : idx;
  }, [selectedFrameId, project.outline]);

  // ⭐ 整个 Studio 只调一次 usePlayer — 状态单一来源
  const player = usePlayer(project, selectedFrameIndex);

  // 显示哪一帧：播放时用 player.currentIndex，暂停时用 selectedFrameIndex
  const displayIndex = player.isPlaying ? player.currentIndex : selectedFrameIndex;
  const displayFrameSource: FrameSource | null = useMemo(() => {
    if (!project.videoSource) return null;
    return project.videoSource.frames[displayIndex] ?? null;
  }, [displayIndex, project.videoSource]);

  const totalDuration = useMemo(() => {
    if (!project.videoSource || !project.outline) return 0;
    return project.outline.frames.reduce((sum, _, i) => {
      const fs = project.videoSource!.frames[i];
      return sum + (fs?.audioDuration ?? 3);
    }, 0);
  }, [project.videoSource, project.outline]);

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <PreviewToolbar project={project} onProjectChange={onProjectChange} onRefresh={refresh} />
      <div className="flex-1 overflow-hidden p-4">
        <PreviewCanvas
          ref={previewCanvasRef}
          project={project}
          frameSource={displayFrameSource}
          showSubtitle={showSubtitle}
          currentTime={player.currentTime}
          isPlaying={player.isPlaying}
          audioRef={player.audioRef}
        />
      </div>
      <PlayerBar
        project={project}
        currentIndex={displayIndex}
        totalDuration={totalDuration}
        isPlaying={player.isPlaying}
        currentTime={player.currentTime}
        audioRef={player.audioRef}
        onTogglePlay={player.togglePlay}
        onStop={player.stop}
        previewRef={previewCanvasRef}
        onEnterFullscreenAutoPlay={() => {
          if (!player.isPlaying) player.play();
        }}
      />
      <StoryboardStrip
        project={project}
        onProjectChange={onProjectChange}
        selectedFrameId={selectedFrameId}
        onFrameSelect={onFrameSelect}
      />
    </div>
  );
}
