'use client';

import { useMemo, useRef, useState, useCallback } from 'react';
import { Play, Pause, Square, ZoomIn, ZoomOut, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, formatDuration } from '@/lib/utils';
import { splitSubtitles } from '@/lib/subtitle';
import { HtmlThumb } from './html-thumb';
import { OutlineDialog } from '@/components/outline/outline-dialog';
import type { ProjectDetail } from '@/types';

const BASE_PX_PER_SEC = 40; // zoom=1 时每秒像素
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 6;

interface TimelineProps {
  project: ProjectDetail;
  onProjectChange: (p: ProjectDetail) => void;
  frameDurations: number[];
  totalDuration: number;
  /** 全局当前时间（秒） */
  currentTime: number;
  isPlaying: boolean;
  /** 按全局时间定位；play=true 表示从该点继续播放 */
  onSeek: (globalT: number, opts?: { play?: boolean }) => void;
  onTogglePlay: () => void;
  onStop: () => void;
  selectedFrameId: string | null;
  onFrameSelect: (id: string) => void;
  generatingFrameId: string | null;
  generationPhase: string | null;
}

export function Timeline(props: TimelineProps) {
  const {
    project, onProjectChange, frameDurations, totalDuration, currentTime, isPlaying,
    onSeek, onTogglePlay, onStop, selectedFrameId, onFrameSelect,
    generatingFrameId, generationPhase,
  } = props;

  const [zoom, setZoom] = useState(1);
  const [editFrameId, setEditFrameId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const pxPerSec = BASE_PX_PER_SEC * zoom;
  const contentW = Math.max(totalDuration * pxPerSec, 1);

  const frames = project.outline?.frames ?? [];
  const sources = project.videoSource?.frames ?? [];

  // 每帧起始时间（全局秒）
  const starts = useMemo(() => {
    const arr: number[] = [];
    let acc = 0;
    for (const d of frameDurations) { arr.push(acc); acc += d; }
    return arr;
  }, [frameDurations]);

  // 全局字幕 cue（把每帧内部 cue 平移到全局时间轴）
  const cues = useMemo(() => {
    const out: { start: number; end: number; text: string }[] = [];
    frames.forEach((f, i) => {
      const dur = frameDurations[i] ?? 0;
      const narration = f.narration?.trim();
      if (!narration || dur <= 0) return;
      const local = splitSubtitles(narration, dur);
      const base = starts[i] ?? 0;
      for (const c of local) out.push({ start: base + c.startTime, end: base + c.endTime, text: c.text });
    });
    return out;
  }, [frames, frameDurations, starts]);

  // 刻度间隔（秒）随缩放自适应
  const tickStep = useMemo(() => {
    const target = 80; // 期望每个刻度间约 80px
    const raw = target / pxPerSec;
    const candidates = [0.5, 1, 2, 3, 5, 10, 15, 30, 60];
    return candidates.find(c => c >= raw) ?? 60;
  }, [pxPerSec]);

  const ticks = useMemo(() => {
    const arr: number[] = [];
    for (let t = 0; t <= totalDuration + 1e-6; t += tickStep) arr.push(t);
    return arr;
  }, [totalDuration, tickStep]);

  const timeFromClientX = useCallback((clientX: number) => {
    const el = scrollRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft;
    return Math.max(0, Math.min(x / pxPerSec, totalDuration));
  }, [pxPerSec, totalDuration]);

  const onTrackPointerDown = useCallback((e: React.PointerEvent) => {
    draggingRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    onSeek(timeFromClientX(e.clientX), { play: false });
  }, [onSeek, timeFromClientX]);

  const onTrackPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    onSeek(timeFromClientX(e.clientX), { play: false });
  }, [onSeek, timeFromClientX]);

  const onTrackPointerUp = useCallback((e: React.PointerEvent) => {
    draggingRef.current = false;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  }, []);

  const hasFrames = frames.length > 0;
  const playheadLeft = currentTime * pxPerSec;

  return (
    <div className="flex flex-col border-t bg-slate-900 text-slate-100 select-none">
      {/* 顶部工具条：播放 / 时间 / 缩放 */}
      <div className="flex items-center gap-3 px-3 py-2">
        <Button
          size="icon"
          onClick={onTogglePlay}
          disabled={!hasFrames}
          className="h-9 w-9 rounded-full bg-orange-500 hover:bg-orange-600 text-white"
          title={isPlaying ? '暂停' : '播放'}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={onStop}
          disabled={!hasFrames}
          className="h-8 w-8 text-slate-300 hover:bg-slate-800 hover:text-white"
          title="停止"
        >
          <Square className="h-3.5 w-3.5" />
        </Button>
        <div className="font-mono text-sm tabular-nums text-slate-200">
          {formatDuration(currentTime)} / {formatDuration(totalDuration)}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setZoom(z => Math.max(MIN_ZOOM, +(z / 1.5).toFixed(2)))}
            className="h-8 w-8 text-slate-300 hover:bg-slate-800 hover:text-white"
            title="缩小时间轴"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setZoom(z => Math.min(MAX_ZOOM, +(z * 1.5).toFixed(2)))}
            className="h-8 w-8 text-slate-300 hover:bg-slate-800 hover:text-white"
            title="放大时间轴"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 轨道区：左侧固定图标列 + 右侧横向滚动的刻度/轨道 */}
      <div className="flex">
        <TrackGutter />
        <div ref={scrollRef} className="relative flex-1 overflow-x-auto overflow-y-hidden">
          <div style={{ width: contentW }} className="relative">
            {/* 刻度尺（同时作为拖动 seek 的热区） */}
            <div
              className="relative h-6 cursor-ew-resize border-b border-slate-700"
              onPointerDown={onTrackPointerDown}
              onPointerMove={onTrackPointerMove}
              onPointerUp={onTrackPointerUp}
            >
              {ticks.map((t, i) => (
                <div key={i} className="absolute top-0 h-full" style={{ left: t * pxPerSec }}>
                  <div className="h-2 w-px bg-slate-600" />
                  <span className="absolute left-1 top-1 text-[10px] text-slate-400 tabular-nums">
                    {formatDuration(t)}
                  </span>
                </div>
              ))}
            </div>

            {/* 字幕轨 */}
            <div className="relative h-8 border-b border-slate-800">
              {cues.map((c, i) => (
                <div
                  key={i}
                  className="absolute top-1 flex h-6 items-center overflow-hidden rounded bg-slate-700/70 px-1.5 text-[10px] text-slate-200"
                  style={{ left: c.start * pxPerSec, width: Math.max(2, (c.end - c.start) * pxPerSec) }}
                  title={c.text}
                >
                  <span className="truncate">{c.text}</span>
                </div>
              ))}
            </div>

            {/* 分镜轨 */}
            <div className="relative h-16 border-b border-slate-800">
              {frames.map((f, i) => {
                const fs = sources[i];
                const w = Math.max(2, (frameDurations[i] ?? 0) * pxPerSec);
                const isSel = f.id === selectedFrameId;
                const isGen = generatingFrameId === f.id && generationPhase !== 'done';
                return (
                  <div
                    key={f.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => { onFrameSelect(f.id); onSeek(starts[i] ?? 0, { play: false }); }}
                    className={cn(
                      'group absolute top-1 flex h-14 cursor-pointer flex-col overflow-hidden rounded border text-left',
                      isSel ? 'border-orange-500' : 'border-slate-700 hover:border-slate-500',
                    )}
                    style={{ left: (starts[i] ?? 0) * pxPerSec, width: w }}
                  >
                    <div className="relative flex-1 bg-slate-800">
                      {project.type === 'html' && fs?.htmlCode ? (
                        <HtmlThumb htmlCode={fs.htmlCode} scale={0.06} />
                      ) : project.type === 'image' && fs?.imagePath ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={fs.imagePath} alt={f.title} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[10px] text-slate-500">未生成</div>
                      )}
                      {isGen && (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 text-[9px] text-white">
                          {generationPhase === 'tts' ? '生成旁白' : '生成画面'}
                        </div>
                      )}
                      {/* 悬浮：编辑 / 重新生成这一镜 */}
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); onFrameSelect(f.id); setEditFrameId(f.id); }}
                        className="absolute right-0.5 top-0.5 rounded bg-slate-900/70 p-0.5 text-white opacity-0 transition-opacity hover:bg-slate-900 group-hover:opacity-100"
                        title="编辑 / 重新生成这一镜"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="truncate bg-slate-900/80 px-1 py-0.5 text-[9px] text-slate-200">
                      分镜{i + 1}: {f.title}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 音频轨（伪波形，用分镜 id 生成稳定的条形） */}
            <div className="relative h-10">
              {frames.map((f, i) => {
                const w = Math.max(2, (frameDurations[i] ?? 0) * pxPerSec);
                const hasAudio = !!sources[i]?.audioPath;
                return (
                  <div
                    key={f.id}
                    className={cn(
                      'absolute top-1 flex h-8 items-center gap-px overflow-hidden rounded px-1',
                      hasAudio ? 'bg-orange-500/15' : 'bg-slate-800/60',
                    )}
                    style={{ left: (starts[i] ?? 0) * pxPerSec, width: w }}
                    title={`第${i + 1}个分镜配音`}
                  >
                    {hasAudio && <PseudoWave seed={f.id} width={w - 8} />}
                  </div>
                );
              })}
            </div>

            {/* 红色播放头竖线（不拦截点击，轨道仍可点） */}
            <div
              className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-red-500"
              style={{ left: playheadLeft }}
            >
              <div className="absolute -left-1.5 -top-0.5 h-3 w-3 rounded-full bg-red-500" />
            </div>
          </div>
        </div>
      </div>

      {/* 分镜编辑 / 重新生成弹窗 */}
      <OutlineDialog
        open={!!editFrameId}
        onOpenChange={v => { if (!v) setEditFrameId(null); }}
        project={project}
        onProjectChange={onProjectChange}
        initialFrameId={editFrameId}
        initialEditing
      />
    </div>
  );
}

/** 左侧固定图标列，高度与右侧各轨道对齐 */
function TrackGutter() {
  return (
    <div className="flex w-9 flex-shrink-0 flex-col border-r border-slate-800 bg-slate-900">
      <div className="h-6 border-b border-slate-700" />
      <div className="flex h-8 items-center justify-center border-b border-slate-800 text-slate-400" title="字幕">
        <span className="text-xs">字</span>
      </div>
      <div className="flex h-16 items-center justify-center border-b border-slate-800 text-slate-400" title="分镜">
        <span className="text-xs">镜</span>
      </div>
      <div className="flex h-10 items-center justify-center text-slate-400" title="配音">
        <span className="text-xs">音</span>
      </div>
    </div>
  );
}

/** 伪波形：用 seed 生成稳定的高度序列，纯视觉展示（非真实解码） */
function PseudoWave({ seed, width }: { seed: string; width: number }) {
  const bars = Math.max(1, Math.floor(width / 3));
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const heights: number[] = [];
  for (let i = 0; i < bars; i++) {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    heights.push(20 + (h % 80)); // 20%~100%
  }
  return (
    <div className="flex h-full w-full items-center gap-px">
      {heights.map((ht, i) => (
        <div key={i} className="w-0.5 flex-shrink-0 rounded-sm bg-orange-400/70" style={{ height: `${ht}%` }} />
      ))}
    </div>
  );
}
