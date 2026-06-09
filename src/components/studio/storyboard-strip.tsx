'use client';

import { Volume2, ImageOff, Code2, Play, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HtmlThumb } from './html-thumb';
import { useStudioStore } from '@/stores/studio-store';
import type { ProjectDetail } from '@/types';

interface StoryboardStripProps {
  project: ProjectDetail;
  onProjectChange: (p: ProjectDetail) => void;
  selectedFrameId: string | null;
  onFrameSelect: (id: string | null) => void;
}

export function StoryboardStrip({ project, selectedFrameId, onFrameSelect }: StoryboardStripProps) {
  const generatingFrameId = useStudioStore(s => s.generatingFrameId);
  const generationPhase = useStudioStore(s => s.generationPhase);
  // ⚠️ 关键：缩略图完全不挂 iframe。AI HTML 可能含无限循环动画，
  // 即使加了 sandbox+看门狗也不够稳。统一用静态占位，主预览区才渲染真实 HTML。

  if (!project.outline) {
    return (
      <div className="h-32 border-t bg-white px-4 py-3">
        <p className="text-xs text-muted-foreground">等待生成视频大纲...</p>
      </div>
    );
  }

  const frames = project.outline.frames;
  const sources = project.videoSource?.frames ?? [];

  function playFrameAudio(audioPath: string) {
    const audio = new Audio(audioPath);
    audio.play().catch(() => {});
  }

  return (
    <div className="border-t bg-white">
      <div className="storyboard-strip flex gap-2 overflow-x-auto p-3">
        {frames.map((f, i) => {
          const fs = sources[i];
          const isSelected = f.id === selectedFrameId;
          const hasImage = !!fs?.imagePath;
          const hasHtml = !!fs?.htmlCode;
          const hasAudio = !!fs?.audioPath;
          const isGenerating = generatingFrameId === f.id && generationPhase !== 'done';

          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onFrameSelect(f.id)}
              className={cn(
                'group relative flex w-32 flex-shrink-0 flex-col overflow-hidden rounded-lg border-2 transition-all',
                isSelected
                  ? 'border-primary shadow-md'
                  : 'border-slate-200 hover:border-slate-300',
              )}
            >
              {/* 预览区：HTML 模式用静态占位（绝不在缩略图挂 iframe） */}
              <div className="relative h-16 w-full bg-gradient-to-br from-slate-100 to-slate-200">
                {project.type === 'image' && hasImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fs!.imagePath} alt={f.title} className="h-full w-full object-cover" />
                ) : project.type === 'html' && hasHtml ? (
                  <HtmlThumb htmlCode={fs!.htmlCode!} scale={0.1} />
                ) : (
                  <StaticThumb frame={f} type={project.type} generated={hasHtml || hasImage} />
                )}

                {isGenerating && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-slate-900/45 text-white backdrop-blur-[1px]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-[9px]">
                      {generationPhase === 'tts' ? '生成旁白中' : '生成画面中'}
                    </span>
                  </div>
                )}

                {/* 序号 */}
                <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  #{i + 1}
                </span>

                {/* 喇叭按钮 */}
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    if (fs?.audioPath) playFrameAudio(fs.audioPath);
                  }}
                  disabled={!hasAudio}
                  className={cn(
                    'absolute right-1 top-1 rounded-full p-1 transition-colors',
                    hasAudio
                      ? 'bg-orange-500/90 text-white hover:bg-orange-500'
                      : 'bg-slate-300/80 text-slate-500 cursor-not-allowed',
                  )}
                  title={hasAudio ? '播放旁白' : '尚无旁白'}
                >
                  <Volume2 className="h-3 w-3" />
                </button>
              </div>

              {/* 标题 */}
              <div className="bg-white px-2 py-1.5 text-left">
                <div className="truncate text-xs font-medium">{f.title}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 静态缩略图：根据分镜 id 哈希出色相，避免渲染 iframe 导致卡死 */
function StaticThumb({
  frame,
  type,
  generated,
}: {
  frame: { id: string; title: string; index: number };
  type: 'image' | 'html';
  generated: boolean;
}) {
  // 用 id 哈希出色相
  const hue = Array.from(frame.id).reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const bg = `linear-gradient(135deg, hsl(${hue} 60% 88%), hsl(${(hue + 40) % 360} 60% 92%))`;

  if (!generated) {
    return (
      <div className="flex h-full w-full items-center justify-center text-slate-400">
        {type === 'image' ? (
          <ImageOff className="h-4 w-4" />
        ) : (
          <Code2 className="h-4 w-4" />
        )}
      </div>
    );
  }

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ background: bg }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-white/40 via-white/10 to-black/10" />
      <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-full bg-black/35 px-1.5 py-0.5 text-[9px] text-white">
        <Play className="h-2.5 w-2.5" />
        <span>{type === 'html' ? 'HTML' : 'IMAGE'}</span>
      </div>
    </div>
  );
}
