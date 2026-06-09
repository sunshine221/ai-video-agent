'use client';

import { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { useStudioStore } from '@/stores/studio-store';
import { PlayerBar } from './player-bar';
import { StoryboardStrip } from './storyboard-strip';
import { PreviewCanvas } from './preview-canvas';
import { PreviewToolbar } from './preview-toolbar';
import { ExportRecordingOverlay } from './export-recording-overlay';
import { usePlayer } from '@/components/player/use-player';
import { toast } from 'sonner';
import { isWebCodecsMP4Supported, recordStreamToMP4 } from '@/lib/webcodecs-mp4-encoder';
import type { ProjectDetail, FrameSource } from '@/types';

interface PreviewPanelProps {
  project: ProjectDetail;
  onProjectChange: (p: ProjectDetail) => void;
  onFrameSelect: (id: string | null) => void;
}

type ExportStatus = 'idle' | 'preparing' | 'prompting' | 'countdown' | 'recording' | 'finalizing' | 'failed';

interface ExportJob {
  status: ExportStatus;
  message: string;
  progress: number;
  elapsedSec: number;
  remainingSec: number;
  countdown: number;
}

export function PreviewPanel({ project, onProjectChange, onFrameSelect }: PreviewPanelProps) {
  const selectedFrameId = useStudioStore(s => s.selectedFrameId);
  const showSubtitle = useStudioStore(s => s.showSubtitle);
  // 全屏目标需要同时包含预览画面和录制悬浮窗，否则倒计时/进度层不会出现在全屏里。
  const previewStageRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLDivElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const focusStateRef = useRef<{ style: string; attr: string | null } | null>(null);
  const progressWindowRef = useRef<Window | null>(null);
  const exportJobRef = useRef<ExportJob>({
    status: 'idle',
    message: '',
    progress: 0,
    elapsedSec: 0,
    remainingSec: 0,
    countdown: 3,
  });
  const isFinalizingExportRef = useRef(false);
  const exportCompletionRequestedRef = useRef(false);
  const exportAbortRef = useRef<AbortController | null>(null);
  const [exportJob, setExportJob] = useState<ExportJob>({
    status: 'idle',
    message: '',
    progress: 0,
    elapsedSec: 0,
    remainingSec: 0,
    countdown: 3,
  });

  useEffect(() => {
    exportJobRef.current = exportJob;
  }, [exportJob]);

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

  const lastFrameIndex = Math.max(0, (project.outline?.frames.length ?? 1) - 1);

  useEffect(() => {
    if (exportJob.status !== 'recording') return;
    if (player.isPlaying) return;
    if (player.currentIndex < lastFrameIndex) return;
    void finalizeExport('completed');
  }, [exportJob.status, player.isPlaying, player.currentIndex, lastFrameIndex]);

  function applyRecordingFocus() {
    const target = previewStageRef.current;
    if (!target || focusStateRef.current) return;
    focusStateRef.current = {
      style: target.getAttribute('style') || '',
      attr: target.getAttribute('data-recording-target'),
    };
    target.setAttribute('data-recording-target', 'true');
    target.style.position = 'fixed';
    target.style.top = '0';
    target.style.left = '0';
    target.style.bottom = '0';
    target.style.right = '0';
    target.style.width = '100vw';
    target.style.height = '100vh';
    target.style.maxWidth = 'none';
    target.style.maxHeight = 'none';
    target.style.borderRadius = '0';
    target.style.boxShadow = 'none';
    target.style.border = 'none';
    target.style.margin = '0';
    target.style.padding = '0';
    target.style.zIndex = '2147483646';
    document.body.classList.add('recording-mode');
    if (!document.getElementById('recording-mode-style')) {
      const style = document.createElement('style');
      style.id = 'recording-mode-style';
      style.textContent = [
        'body.recording-mode * { visibility: hidden !important; }',
        'body.recording-mode [data-recording-target="true"],',
        'body.recording-mode [data-recording-target="true"] * { visibility: visible !important; }',
        'body.recording-mode { background: #000 !important; }',
        'body.recording-mode [data-recording-target="true"] .preview-stage { border-radius: 0 !important; box-shadow: none !important; }',
      ].join('\n');
      document.head.appendChild(style);
    }
  }

  function clearRecordingFocus() {
    const target = previewStageRef.current;
    const state = focusStateRef.current;
    if (state && target) {
      target.setAttribute('style', state.style);
      if (state.attr === null) {
        target.removeAttribute('data-recording-target');
      } else {
        target.setAttribute('data-recording-target', state.attr);
      }
      focusStateRef.current = null;
    }
    document.body.classList.remove('recording-mode');
    document.getElementById('recording-mode-style')?.remove();
  }

  function createProgressWindow(durationSec: number): Window | null {
    const w = window.open(
      '',
      'export_progress',
      'width=320,height=240,top=100,left=100,toolbar=no,menubar=no,scrollbars=no,resizable=no',
    );
    progressWindowRef.current = w;
    if (w) {
      w.document.write(`<!DOCTYPE html><html><head><title>录制进度</title>
<style>*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:linear-gradient(135deg,#1e293b,#0f172a);color:#fff;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px}
.dot{width:12px;height:12px;background:#ef4444;border-radius:50%;animation:pulse 1s ease-in-out infinite;margin-bottom:16px}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.9)}}
.badge{font-size:11px;color:#22c55e;background:rgba(34,197,94,.15);padding:2px 8px;border-radius:4px;margin-bottom:12px}
.title{font-size:14px;color:#94a3b8;margin-bottom:12px}
.wrap{width:100%;max-width:240px;height:8px;background:#334155;border-radius:4px;overflow:hidden;margin-bottom:12px}
.bar{height:100%;background:linear-gradient(90deg,#f97316,#fb923c);border-radius:4px;transition:width .1s}
.pct{font-size:24px;font-weight:600}
.remain{font-size:12px;color:#64748b;margin-top:8px}
</style></head><body>
<div class="dot"></div>
<div class="badge">MP4 (H.264)</div>
<div class="title">正在录制...</div>
<div class="wrap"><div class="bar" id="bar" style="width:0%"></div></div>
<div class="pct" id="pct">0%</div>
<div class="remain" id="remain">剩余: ${durationSec}s</div>
</body></html>`);
      w.document.close();
    }
    return w;
  }

  function updateProgressWindow(pct: number, remainingSec: number) {
    const w = progressWindowRef.current;
    if (!w || w.closed) return;
    try {
      const bar = w.document.getElementById('bar');
      const pctEl = w.document.getElementById('pct');
      const remain = w.document.getElementById('remain');
      if (bar) bar.style.width = `${pct}%`;
      if (pctEl) pctEl.textContent = `${pct}%`;
      if (remain) remain.textContent = remainingSec < 0 ? `进度: ${pct}%` : `剩余: ${Math.ceil(Math.max(0, remainingSec))}s`;
    } catch { /* popup may be closed */ }
  }

  function closeProgressWindow() {
    const w = progressWindowRef.current;
    if (w && !w.closed) { try { w.close(); } catch { /* ignore */ } }
    progressWindowRef.current = null;
  }

  async function handleExport() {
    if (!project.outline?.frames.length) return;
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getDisplayMedia ||
      !isWebCodecsMP4Supported()
    ) {
      setExportJob({
        status: 'failed',
        message: '当前浏览器不支持 MP4 录屏导出，请使用最新版 Chrome。',
        progress: 0,
        elapsedSec: 0,
        remainingSec: 0,
        countdown: 3,
      });
      return;
    }

    setExportJob({
      status: 'prompting',
      message: '请在共享弹窗中选择当前标签页，并勾选共享标签页音频。',
      progress: 0,
      elapsedSec: 0,
      remainingSec: totalDuration,
      countdown: 3,
    });
    exportCompletionRequestedRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: 30,
        },
        audio: true,
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
        surfaceSwitching: 'exclude',
      } as DisplayMediaStreamOptions & {
        preferCurrentTab?: boolean;
        selfBrowserSurface?: 'include' | 'exclude';
        surfaceSwitching?: 'include' | 'exclude';
      });

      const displaySurface = stream.getVideoTracks()[0]?.getSettings().displaySurface;
      if (displaySurface && displaySurface !== 'browser') {
        stopMediaStream(stream);
        throw new Error('请选择“当前标签页”进行录制。');
      }

      mediaStreamRef.current = stream;

      for (const track of stream.getTracks()) {
        track.addEventListener(
          'ended',
          () => {
            const status = exportJobRef.current.status;
            if (status === 'recording' || status === 'countdown' || status === 'prompting' || status === 'finalizing') {
              void finalizeExport('completed');
            }
          },
          { once: true },
        );
      }

      await beginCountdownAndRecord(stream);
    } catch (error) {
      cleanupRecorder();
      if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'NotAllowedError')) {
        setExportJob({ status: 'idle', message: '', progress: 0, elapsedSec: 0, remainingSec: 0, countdown: 3 });
        return;
      }
      setExportJob({
        status: 'failed',
        message: error instanceof Error ? error.message : '导出失败，请重试。',
        progress: 0,
        elapsedSec: 0,
        remainingSec: 0,
        countdown: 3,
      });
    }
  }

  async function handleCancelExport() {
    await finalizeExport('cancelled');
  }

  async function finalizeExport(reason: 'completed' | 'cancelled') {
    if (isFinalizingExportRef.current) return;
    isFinalizingExportRef.current = true;

    try {
      const stream = mediaStreamRef.current;

      if (!stream) {
        cleanupRecorder();
        setExportJob({ status: 'idle', message: '', progress: 0, elapsedSec: 0, remainingSec: 0, countdown: 3 });
        return;
      }

      if (reason === 'cancelled') {
        exportAbortRef.current?.abort();
        cleanupRecorder();
        await exitPreviewFullscreen();
        player.stop();
        setExportJob({ status: 'idle', message: '', progress: 0, elapsedSec: 0, remainingSec: 0, countdown: 3 });
        return;
      }

      if (exportCompletionRequestedRef.current) {
        return;
      }
      exportCompletionRequestedRef.current = true;
      setExportJob(job => ({
        ...job,
        status: 'finalizing',
        message: '正在封装 MP4 文件…',
      }));
      stopMediaStream(stream);
    } catch (error) {
      cleanupRecorder();
      await exitPreviewFullscreen();
      setExportJob({
        status: 'failed',
        message: error instanceof Error ? error.message : '导出失败，请重试。',
        progress: 0,
        elapsedSec: 0,
        remainingSec: 0,
        countdown: 3,
      });
    } finally {
      isFinalizingExportRef.current = false;
    }
  }

  function cleanupRecorder() {
    if (mediaStreamRef.current) {
      stopMediaStream(mediaStreamRef.current);
    }
    mediaStreamRef.current = null;
    exportAbortRef.current = null;
    exportCompletionRequestedRef.current = false;
  }

  async function exitPreviewFullscreen() {
    clearRecordingFocus();
    closeProgressWindow();
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    }
  }

  async function beginCountdownAndRecord(stream: MediaStream) {
    let remaining = 3;
    setExportJob({
      status: 'countdown',
      message: '录屏即将开始',
      progress: 0,
      elapsedSec: 0,
      remainingSec: totalDuration,
      countdown: remaining,
    });

    await new Promise<void>(resolve => {
      const timer = window.setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          window.clearInterval(timer);
          resolve();
          return;
        }
        setExportJob(job => ({
          ...job,
          countdown: remaining,
        }));
      }, 1000);
    });

    // Apply CSS fake-fullscreen: hide all UI, show only the canvas element.
    // This ensures the recording stream captures only the video content without
    // any surrounding padding, toolbars, or overlay panels.
    applyRecordingFocus();

    // Wait two animation frames so the CSS changes are painted before we start encoding.
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    const controller = new AbortController();
    exportAbortRef.current = controller;

    setExportJob({
      status: 'recording',
      message: '正在录制并编码 MP4…',
      progress: 0,
      elapsedSec: 0,
      remainingSec: totalDuration,
      countdown: 0,
    });
    player.playFromIndex(0);

    // Show progress in a separate popup so it doesn't appear in the recording.
    createProgressWindow(Math.round(totalDuration));

    try {
      const blob = await recordStreamToMP4(stream, Math.max(totalDuration, 1), {
        frameRate: 30,
        maxWidth: 1920,
        signal: controller.signal,
        onProgress: progress => {
          setExportJob(job => ({
            ...job,
            status: progress >= 100 ? 'finalizing' : 'recording',
            progress,
            message: progress >= 100 ? '正在封装 MP4 文件…' : '正在录制并编码 MP4…',
          }));
        },
        onTimeUpdate: (elapsedSec, remainingSec) => {
          setExportJob(job => ({
            ...job,
            elapsedSec,
            remainingSec,
          }));
          updateProgressWindow(
            Math.min(99, Math.round((elapsedSec / Math.max(totalDuration, 1)) * 100)),
            remainingSec,
          );
        },
      });

      downloadBlob(blob, buildExportFileName(project.title));
      cleanupRecorder();
      await exitPreviewFullscreen();
      player.stop();
      setExportJob({ status: 'idle', message: '', progress: 100, elapsedSec: totalDuration, remainingSec: 0, countdown: 0 });
      toast.success('MP4 视频已开始下载');
    } catch (error) {
      cleanupRecorder();
      await exitPreviewFullscreen();
      if (error instanceof DOMException && error.name === 'AbortError') {
        setExportJob({ status: 'idle', message: '', progress: 0, elapsedSec: 0, remainingSec: 0, countdown: 3 });
        return;
      }
      setExportJob({
        status: 'failed',
        message: error instanceof Error ? error.message : 'MP4 导出失败，请重试。',
        progress: 0,
        elapsedSec: 0,
        remainingSec: 0,
        countdown: 3,
      });
    }
  }

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <PreviewToolbar project={project} onProjectChange={onProjectChange} onRefresh={refresh} />
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
            countdown={exportJob.countdown}
            elapsedSec={exportJob.elapsedSec}
            remainingSec={exportJob.remainingSec}
          />
        </div>
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

function stopMediaStream(stream: MediaStream) {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function buildExportFileName(title: string) {
  const base = (title || 'ai-video-export')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 48);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${base || 'ai-video-export'}-${timestamp}.mp4`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
