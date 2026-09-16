'use client';

import { useMemo, useRef, useState } from 'react';
import { useStudioStore } from '@/stores/studio-store';
import { PlayerBar } from './player-bar';
import { StoryboardStrip } from './storyboard-strip';
import { PreviewCanvas } from './preview-canvas';
import { PreviewToolbar } from './preview-toolbar';
import { ExportRecordingOverlay } from './export-recording-overlay';
import { usePlayer } from '@/components/player/use-player';
import { toast } from 'sonner';
import type { ProjectDetail, FrameSource } from '@/types';

interface PreviewPanelProps {
  project: ProjectDetail;
  onProjectChange: (p: ProjectDetail) => void;
  onFrameSelect: (id: string | null) => void;
}

export type ExportStatus = 'idle' | 'preparing' | 'rendering' | 'encoding' | 'finalizing' | 'failed';

interface ExportJob {
  status: ExportStatus;
  message: string;
  progress: number;
}

export function PreviewPanel({ project, onProjectChange, onFrameSelect }: PreviewPanelProps) {
  const selectedFrameId = useStudioStore(s => s.selectedFrameId);
  const showSubtitle = useStudioStore(s => s.showSubtitle);
  const previewStageRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLDivElement>(null);
  // 服务端导出：SSE 连接的 AbortController，用于前端断开观察
  const exportSseAbortRef = useRef<AbortController | null>(null);
  const [exportJob, setExportJob] = useState<ExportJob>({
    status: 'idle',
    message: '',
    progress: 0,
  });

  // 大纲更新时默认选中第一帧
  const outlineFirstId = project.outline?.frames?.[0]?.id;
  useMemo(() => {
    if (!selectedFrameId && outlineFirstId) {
      onFrameSelect(outlineFirstId);
    }
  }, [outlineFirstId, selectedFrameId, onFrameSelect]);

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

  // 每个分镜的时长
  const frameDurations = useMemo(() => {
    if (!project.videoSource || !project.outline) return [] as number[];
    return project.outline.frames.map((_, i) => {
      const fs = project.videoSource!.frames[i];
      return fs?.audioDuration ?? 3;
    });
  }, [project.videoSource, project.outline]);

  const totalDuration = useMemo(
    () => frameDurations.reduce((sum, d) => sum + d, 0),
    [frameDurations],
  );

  // 全局累计播放时间
  const globalCurrentTime = useMemo(() => {
    const elapsedBefore = frameDurations
      .slice(0, displayIndex)
      .reduce((sum, d) => sum + d, 0);
    const currentDuration = frameDurations[displayIndex] ?? 0;
    const withinCurrent = Math.min(player.currentTime, currentDuration);
    return elapsedBefore + withinCurrent;
  }, [frameDurations, displayIndex, player.currentTime]);
  // ⭐ 服务端导出：POST /api/export，通过 SSE 接收渲染/编码进度，完成后下载产物。
  async function handleExport() {
    if (!project.outline?.frames.length) return;
    if (exportJob.status !== 'idle' && exportJob.status !== 'failed') return;

    const controller = new AbortController();
    exportSseAbortRef.current = controller;
    setExportJob({ status: 'preparing', message: '正在准备导出…', progress: 0 });

    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: project.uuid, showSubtitle }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `导出请求失败（${res.status}）`);
      }
      await consumeExportSse(res.body);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setExportJob({ status: 'idle', message: '', progress: 0 });
        return;
      }
      setExportJob({
        status: 'failed',
        message: error instanceof Error ? error.message : '导出失败，请重试。',
        progress: 0,
      });
    } finally {
      exportSseAbortRef.current = null;
    }
  }

  async function consumeExportSse(body: ReadableStream<Uint8Array>) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    const total = project.outline?.frames.length ?? 1;
    let buffer = '';

    // 每个分镜占 1/total；分镜内渲染占前 70%，编码占后 30%。
    const handleEvent = (event: string, data: Record<string, unknown>) => {
      if (event === 'start') {
        setExportJob({ status: 'rendering', message: '开始渲染分镜…', progress: 0 });
      } else if (event === 'scene_start') {
        const index = Number(data.index ?? 0);
        const isEncode = data.phase === 'encode';
        const status: ExportStatus = isEncode ? 'encoding' : 'rendering';
        const base = (index / total) * 100;
        const span = 100 / total;
        // 进入编码时渲染阶段已完成（前 70%），从该点起算避免进度回退
        const startProgress = isEncode ? base + 0.7 * span : base;
        setExportJob(job => ({
          ...job,
          status,
          message: isEncode
            ? `正在合成第 ${index + 1}/${total} 个分镜…`
            : `正在渲染第 ${index + 1}/${total} 个分镜…`,
          progress: Math.min(99, Math.round(startProgress)),
        }));
      } else if (event === 'scene_progress') {
        const index = Number(data.index ?? 0);
        const fp = Number(data.frameProgress ?? 0);
        const phase = data.phase;
        const base = (index / total) * 100;
        const span = 100 / total;
        // render 占前 70%，encode 占后 30%；image 模式整段即合成进度
        let within: number;
        let status: ExportStatus;
        if (phase === 'encode') {
          within = (0.7 + fp * 0.3) * span;
          status = 'encoding';
        } else if (phase === 'image') {
          within = fp * span;
          status = 'encoding';
        } else {
          within = fp * 0.7 * span;
          status = 'rendering';
        }
        setExportJob(job => ({
          ...job,
          status,
          progress: Math.min(99, Math.round(base + within)),
        }));
      } else if (event === 'scene_done') {
        const index = Number(data.index ?? 0);
        const base = ((index + 1) / total) * 100;
        setExportJob(job => ({ ...job, progress: Math.min(99, Math.round(base)) }));
      } else if (event === 'concat') {
        setExportJob({ status: 'finalizing', message: '正在拼接最终视频…', progress: 99 });
      } else if (event === 'done') {
        const url = String(data.url ?? '');
        const fileName = String(data.fileName ?? 'ai-video-export.mp4');
        setExportJob({ status: 'idle', message: '', progress: 100 });
        if (url) triggerDownload(url, fileName);
        toast.success('MP4 视频已开始下载');
      } else if (event === 'error') {
        setExportJob({
          status: 'failed',
          message: String(data.message ?? '导出失败，请重试。'),
          progress: 0,
        });
      }
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() ?? '';
      for (const chunk of chunks) {
        let event = 'message';
        let dataLine = '';
        for (const line of chunk.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLine += line.slice(5).trim();
        }
        if (!dataLine) continue;
        try {
          handleEvent(event, JSON.parse(dataLine));
        } catch {
          /* 忽略无法解析的数据行 */
        }
      }
    }
  }

  async function handleCancelExport() {
    exportSseAbortRef.current?.abort();
    exportSseAbortRef.current = null;
    setExportJob({ status: 'idle', message: '', progress: 0 });
    try {
      await fetch('/api/export/abort', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: project.uuid }),
      });
    } catch {
      /* 中断请求失败可忽略 */
    }
  }

  function triggerDownload(url: string, fileName: string) {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <PreviewToolbar project={project} onProjectChange={onProjectChange} />
      <div className="flex-1 overflow-hidden p-4">
        <div ref={previewStageRef} className="preview-fullscreen-stage relative h-full w-full overflow-hidden bg-black">
          <PreviewCanvas
            ref={previewCanvasRef}
            project={project}
            frameSource={displayFrameSource}
            showSubtitle={showSubtitle}
            currentTime={player.currentTime}
            isPlaying={player.isPlaying}
            audioRef={player.audioRef}
          />
          <ExportRecordingOverlay
            open={exportJob.status !== 'idle' && exportJob.status !== 'failed'}
            status={exportJob.status}
            message={exportJob.message}
            progress={exportJob.progress}
          />
        </div>
      </div>
      <PlayerBar
        project={project}
        currentIndex={displayIndex}
        totalDuration={totalDuration}
        isPlaying={player.isPlaying}
        currentTime={globalCurrentTime}
        audioRef={player.audioRef}
        onTogglePlay={player.togglePlay}
        onStop={player.stop}
        previewRef={previewStageRef}
        exportStatus={exportJob.status}
        exportMessage={exportJob.message}
        onExport={handleExport}
        onCancelExport={handleCancelExport}
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
