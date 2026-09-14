'use client';

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ImageOff, Code2 } from 'lucide-react';
import { SubtitleLayer } from '@/components/player/subtitle-layer';
import { splitSubtitles, estimateFrameDuration, type SubtitleCue } from '@/lib/subtitle';
import { wrapHtmlWithWatchdog, sanitizeAiHtml } from '@/lib/iframe-utils';
import type { ProjectDetail, FrameSource } from '@/types';

interface PreviewCanvasProps {
  project: ProjectDetail;
  frameSource: FrameSource | null;
  showSubtitle: boolean;
  currentTime?: number;
  isPlaying?: boolean;
  audioRef?: React.RefObject<HTMLAudioElement>;
}

export const PreviewCanvas = forwardRef<HTMLDivElement, PreviewCanvasProps>(
  function PreviewCanvas(
    { project, frameSource, showSubtitle, currentTime = 0, isPlaying = false, audioRef },
    ref,
  ) {
    if (!project.outline || !frameSource) {
      return (
        <div
          ref={ref}
          className="flex h-full items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50"
        >
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <Code2 className="h-6 w-6 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-700">还没有可预览的内容</p>
            <p className="mt-1 text-xs text-slate-500">
              在右侧输入提示词，让 AI 先生成视频大纲
            </p>
          </div>
        </div>
      );
    }

    return (
      <PreviewBody
        ref={ref}
        project={project}
        frameSource={frameSource}
        showSubtitle={showSubtitle}
        currentTime={currentTime}
        isPlaying={isPlaying}
        audioRef={audioRef}
      />
    );
  },
);

interface PreviewBodyProps {
  project: ProjectDetail;
  frameSource: FrameSource;
  showSubtitle: boolean;
  currentTime: number;
  isPlaying: boolean;
  audioRef?: React.RefObject<HTMLAudioElement>;
}

const TRANSITION_MS = 500;

const PreviewBody = forwardRef<HTMLDivElement, PreviewBodyProps>(function PreviewBody(
  { project, frameSource, showSubtitle, currentTime, isPlaying, audioRef },
  ref,
) {
  // ⭐ 叠化转场核心 state
  // - `displayed` 滞后于 `frameSource`，是当前真正显示的那一帧
  // - 当 frameSource 变化时：把 displayed 存为 outgoing，displayed 切到新帧
  // - 渲染时同时叠加 outgoing（淡出）和 displayed（淡入）
  const [displayed, setDisplayed] = useState<FrameSource>(frameSource);
  const [outgoing, setOutgoing] = useState<FrameSource | null>(null);
  const [incomingKey, setIncomingKey] = useState(0);
  const initRef = useRef(false);

  // 跟踪 frameSource 变化
  useEffect(() => {
    if (initRef.current === false) {
      initRef.current = true;
      return;
    }
    if (frameSource.id === displayed.id) {
      setDisplayed(frameSource);
      return;
    }

    // 1) 把当前 displayed 存为 outgoing
    setOutgoing(displayed);
    // 2) 切换到新帧
    setDisplayed(frameSource);
    // 3) 改变 incoming 的 key 强制重挂载，触发淡入动画
    setIncomingKey(k => k + 1);
    // 4) 500ms 后清掉 outgoing
    const timer = setTimeout(() => setOutgoing(null), TRANSITION_MS);
    return () => clearTimeout(timer);
  }, [frameSource, displayed]);

  // 字幕切片（基于当前 displayed 帧）
  const cues: SubtitleCue[] = useMemo(() => {
    const idx = project.outline?.frames.findIndex(f => f.id === displayed.id) ?? -1;
    if (idx < 0) return [];
    const frame = project.outline!.frames[idx];
    const dur = displayed.audioDuration ?? estimateFrameDuration(frame.narration);
    return splitSubtitles(frame.narration, dur);
  }, [displayed, project.outline]);

  return (
    <div
      ref={ref}
      className="preview-stage relative h-full overflow-hidden rounded-xl bg-slate-900 shadow-inner"
      style={{ background: '#0f172a' }}
    >
      {/* 旧帧 — 淡出中（pointer-events-none 防止拦截点击） */}
      {outgoing && (
        <div
          key={`out-${outgoing.id}`}
          className="absolute inset-0 frame-fade-out pointer-events-none"
        >
          <FrameContent
            project={project}
            frameSource={outgoing}
            isPlaying={false}
            audioRef={audioRef}
          />
        </div>
      )}

      {/* 新帧 — 淡入中（key 变化强制重挂载 → 重新触发动画） */}
      <div key={`in-${incomingKey}`} className="absolute inset-0 frame-fade-in">
        <FrameContent
          project={project}
          frameSource={displayed}
          isPlaying={isPlaying}
          audioRef={audioRef}
        />
      </div>

      {/* 字幕只挂在最上层（跟着新帧） */}
      {showSubtitle && cues.length > 0 && (
        <SubtitleLayer cues={cues} currentTime={currentTime} />
      )}
    </div>
  );
});

// ===== FrameContent：根据项目类型渲染对应画面 =====
function FrameContent({
  project,
  frameSource,
  isPlaying,
  audioRef,
}: {
  project: ProjectDetail;
  frameSource: FrameSource;
  isPlaying: boolean;
  audioRef?: React.RefObject<HTMLAudioElement>;
}) {
  if (project.type === 'image') {
    return (
      <ImageFrame
        frameSource={frameSource}
        isPlaying={isPlaying}
        audioRef={audioRef}
        frameDuration={frameSource.audioDuration ?? 3}
      />
    );
  }
  return (
    <HtmlFrame
      htmlCode={frameSource.htmlCode}
      frameId={frameSource.id}
      frameDuration={frameSource.audioDuration ?? 3}
    />
  );
}

// ===== ImageFrame：rAF 60fps 缩放 =====
function ImageFrame({
  frameSource,
  isPlaying,
  audioRef,
  frameDuration,
}: {
  frameSource: FrameSource;
  isPlaying: boolean;
  audioRef?: React.RefObject<HTMLAudioElement>;
  frameDuration: number;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const totalMs = Math.max(1, frameDuration * 1000);

  useEffect(() => {
    if (!isPlaying) {
      if (imgRef.current) imgRef.current.style.transform = 'scale(1)';
      return;
    }
    const audio = audioRef?.current;
    const img = imgRef.current;
    if (!audio || !img) return;

    let raf = 0;
    const tick = () => {
      const t = audio.currentTime || 0;
      const p = Math.min((t * 1000) / totalMs, 1);
      const scale = 1 + p * 0.1;
      img.style.transform = `scale(${scale})`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (imgRef.current) imgRef.current.style.transform = 'scale(1)';
    };
  }, [isPlaying, frameDuration, audioRef, totalMs, frameSource.id]);

  if (!frameSource.imagePath) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        <div className="text-center">
          <ImageOff className="mx-auto h-8 w-8" />
          <p className="mt-2 text-sm">该分镜尚未生成图片</p>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-hidden">
      <img
        ref={imgRef}
        src={frameSource.imagePath}
        alt="分镜画面"
        className="h-full w-full object-cover"
        style={{
          transformOrigin: 'center',
          willChange: 'transform',
        }}
      />
    </div>
  );
}

// ===== HtmlFrame：iframe srcdoc 沙箱 + 看门狗 + 动态尺寸缩放（cover 模式）=====
/** iframe 内容"设计尺寸"（postMessage 失败时的兜底值） */
const DEFAULT_DESIGN_SIZE = { w: 1280, h: 720 };

function HtmlFrame({
  htmlCode,
  frameId,
  frameDuration,
}: {
  htmlCode?: string;
  frameId?: string;
  frameDuration: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  /** iframe 内部 HTML 的"设计尺寸"，由 iframe 通过 postMessage 上报 */
  const [designSize, setDesignSize] = useState<{ w: number; h: number }>(DEFAULT_DESIGN_SIZE);
  const watchdogMs = Math.max(8_000, Math.ceil(frameDuration * 1000) + 1_500);

  // ⭐ 监听 iframe 的 postMessage 上报（sandbox 阻止我们直接读 contentDocument）
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (e.data && e.data.type === '__ai_video_iframe_size') {
        const w = Number(e.data.w);
        const h = Number(e.data.h);
        if (w > 0 && h > 0 && w < 10000 && h < 10000) {
          setDesignSize({ w, h });
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    setDesignSize(DEFAULT_DESIGN_SIZE);
  }, [frameId, htmlCode]);

  // ResizeObserver：容器尺寸变化时重新计算 scale + 显式 left/top 居中
  useEffect(() => {
    const container = containerRef.current;
    const iframe = iframeRef.current;
    if (!container || !iframe) return;

    const update = () => {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (cw === 0 || ch === 0) return;

      const baseW = designSize.w;
      const baseH = designSize.h;
      // ⭐ contain 模式：完整展示整个 HTML 画面，避免边缘被裁切
      const scale = Math.min(cw / baseW, ch / baseH);
      const scaledW = baseW * scale;
      const scaledH = baseH * scale;
      // ⭐ 关键：transform-origin: 0 0 + left/top 显式居中
      // （不用 transform-origin: center，因为 flex 居中和它会冲突）
      iframe.style.transformOrigin = '0 0';
      iframe.style.transform = `scale(${scale})`;
      iframe.style.left = `${(cw - scaledW) / 2}px`;
      iframe.style.top = `${(ch - scaledH) / 2}px`;
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [designSize]);

  const safeHtml = useMemo(
    () => wrapHtmlWithWatchdog(sanitizeAiHtml(htmlCode || ''), watchdogMs),
    [htmlCode, watchdogMs],
  );

  if (!htmlCode) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        <div className="text-center">
          <Code2 className="mx-auto h-8 w-8" />
          <p className="mt-2 text-sm">该分镜尚未生成 HTML 动画</p>
        </div>
      </div>
    );
  }
  return (
    <div ref={containerRef} className="html-frame-container">
      <iframe
        ref={iframeRef}
        key={frameId}
        title="HTML 分镜动画"
        srcDoc={safeHtml}
        sandbox="allow-scripts"
        loading="lazy"
        referrerPolicy="no-referrer"
        className="block bg-transparent"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: `${designSize.w}px`,
          height: `${designSize.h}px`,
          border: 0,
        }}
      />
    </div>
  );
}
