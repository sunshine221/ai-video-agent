'use client';

import { useState, useEffect, useRef } from 'react';
import { ListTree, Play, Square, RefreshCw, CheckCircle2, XCircle, Loader2, Sparkles, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { OutlineDialog } from './outline-dialog';
import { useFrameGeneration, type ActivityLog } from '@/hooks/use-frame-generation';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { ProjectDetail, Outline } from '@/types';

/** 生成过程活动流：让用户实时看到 AI 在思考/生成/处理，避免"卡住"错觉 */
function ActivityFeed({ logs, active }: { logs: ActivityLog[]; active: boolean }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [logs.length]);

  if (logs.length === 0) return null;

  return (
    <div className="mt-2 max-h-40 overflow-y-auto rounded-md border bg-slate-50/80 p-2">
      <div className="space-y-1">
        {logs.map((log, i) => {
          // working 表示进行中的步骤：仅当它是最后一条且生成仍在进行时才转圈；
          // 一旦有后续日志或生成结束，该步骤已完成，显示静态圆点而非持续旋转
          const spinning = log.level === 'working' && active && i === logs.length - 1;
          return (
          <div key={log.id} className="flex items-start gap-1.5 text-[11px] leading-relaxed">
            <span className="mt-0.5 flex-shrink-0">
              {log.level === 'thinking' && <Sparkles className="h-3 w-3 text-violet-500" />}
              {log.level === 'working' && (spinning
                ? <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                : <span className="flex h-3 w-3 items-center justify-center"><span className="h-1.5 w-1.5 rounded-full bg-blue-400" /></span>)}
              {log.level === 'success' && <CheckCircle2 className="h-3 w-3 text-green-600" />}
              {log.level === 'warn' && <AlertTriangle className="h-3 w-3 text-amber-500" />}
              {log.level === 'error' && <XCircle className="h-3 w-3 text-red-500" />}
            </span>
            <span
              className={cn(
                'min-w-0',
                log.level === 'error' && 'text-red-600',
                log.level === 'warn' && 'text-amber-700',
                log.level === 'success' && 'text-slate-600',
                (log.level === 'thinking' || log.level === 'working') && 'text-slate-700',
              )}
            >
              {log.text}
            </span>
          </div>
          );
        })}
        <div ref={endRef} />
      </div>
    </div>
  );
}

interface OutlineCardProps {
  outline: Outline;
  project: ProjectDetail;
  onProjectChange: (p: ProjectDetail) => void;
  /** 是否显示「一键生成/重新生成」按钮：仅最新大纲卡片显示 */
  showGenerate?: boolean;
}

export function OutlineCard({ outline, project, onProjectChange, showGenerate = true }: OutlineCardProps) {
  const [open, setOpen] = useState(false);

  async function refreshProject(): Promise<ProjectDetail | undefined> {
    const res = await fetch(`/api/projects/${project.uuid}`);
    if (!res.ok) return undefined;
    const data = (await res.json()) as ProjectDetail;
    onProjectChange(data);
    return data;
  }

  const { generating, progress, logs, start, abort } = useFrameGeneration({
    project,
    onProjectRefresh: refreshProject,
  });

  // 是否已经生成过画面/旁白：决定按钮文案（一键生成 / 重新生成）
  const sources = project.videoSource?.frames ?? [];
  const hasGenerated = sources.some(
    fs => fs && (fs.imagePath || fs.htmlCode || fs.audioPath),
  );

  async function handleGenerate() {
    if (!project.outline) {
      toast.error('请先生成视频大纲');
      return;
    }
    if (hasGenerated) {
      // 重新生成：强制重跑所有分镜
      await start(project.outline.frames.map(f => f.id), true);
    } else {
      // 一键生成：只生成尚未产出的分镜
      const pending = project.outline.frames
        .filter((_, i) => {
          const fs = sources[i];
          return !fs || (!fs.imagePath && !fs.htmlCode);
        })
        .map(f => f.id);
      await start(pending.length ? pending : project.outline.frames.map(f => f.id));
    }
  }

  return (
    <div className="w-full min-w-0">
      <div className="mb-2 flex items-center gap-2 border-b pb-2">
        <ListTree className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-semibold">{outline.title}</h4>
      </div>
      <p className="mb-2 text-xs text-muted-foreground">
        已生成 {outline.frames.length} 个分镜，{Math.round(outline.totalDuration)} 秒
      </p>
      <div className="overflow-hidden rounded-md border">
        <table className="w-full table-fixed text-xs">
          <thead className="bg-slate-50">
            <tr className="border-b">
              <th className="w-8 px-2 py-1.5 text-left font-medium">#</th>
              <th className="w-[30%] px-2 py-1.5 text-left font-medium">标题</th>
              <th className="px-2 py-1.5 text-left font-medium">旁白</th>
            </tr>
          </thead>
          <tbody>
            {outline.frames.slice(0, 6).map(f => (
              <tr key={f.id} className="border-b last:border-0">
                <td className="px-2 py-1.5 font-mono text-muted-foreground">{f.index}</td>
                <td className="truncate px-2 py-1.5 font-medium">{f.title}</td>
                <td className="truncate px-2 py-1.5 text-muted-foreground">
                  {f.narration}
                </td>
              </tr>
            ))}
            {outline.frames.length > 6 && (
              <tr>
                <td colSpan={3} className="px-2 py-1.5 text-center text-muted-foreground">
                  ... 还有 {outline.frames.length - 6} 个分镜
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 生成进度（仅最新大纲卡片显示） */}
      {showGenerate && generating && progress && (
        <div className="mt-2 space-y-1">
          <div className="flex items-center gap-2">
            <Progress value={progress.total ? Math.round((progress.current / progress.total) * 100) : 0} className="h-1.5 flex-1" />
            <span className="text-xs text-muted-foreground">
              {progress.current}/{progress.total}
            </span>
          </div>
          <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
            {progress.phase === 'review'
              ? (progress.reviewNote || '正在终检全片...')
              : progress.phase === 'image' ? '正在生成画面...' : progress.phase === 'html' ? '正在生成 HTML 动画...' : progress.phase === 'tts' ? '正在生成旁白...' : '完成'}
          </p>
        </div>
      )}

      {/* 实时活动流：生成中或刚结束都展示，让用户看到完整过程 */}
      {showGenerate && logs.length > 0 && <ActivityFeed logs={logs} active={generating} />}
      {showGenerate && !generating && progress?.phase === 'done' && (
        <div className="mt-2 space-y-1">
          <div className="flex items-center gap-1 text-xs text-green-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            生成完成，已通过全片终检
          </div>
          {progress.unresolved && progress.unresolved.length > 0 && (
            <div className="rounded bg-amber-50 p-1.5 text-[10px] text-amber-700">
              <div className="mb-0.5 font-medium">以下 {progress.unresolved.length} 处仍需留意（已保留当前最佳版本）：</div>
              <ul className="list-inside list-disc space-y-0.5">
                {progress.unresolved.slice(0, 5).map((u, i) => (
                  <li key={i}>{u.issue}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {showGenerate && progress?.aborted && (
        <div className="mt-2 flex items-center gap-1 text-xs text-orange-700">
          <XCircle className="h-3.5 w-3.5" />
          已中断
        </div>
      )}

      <div className="mt-2 flex flex-wrap justify-end gap-2">
        {showGenerate && (
          !generating ? (
            <Button size="sm" onClick={handleGenerate}>
              {hasGenerated ? (
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
              ) : (
                <Play className="mr-1 h-3.5 w-3.5" />
              )}
              {hasGenerated ? '重新生成' : '一键生成'}
            </Button>
          ) : (
            <Button size="sm" variant="destructive" onClick={abort}>
              <Square className="mr-1 h-3.5 w-3.5" />
              中断生成
            </Button>
          )
        )}
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <ListTree className="mr-1 h-3.5 w-3.5" />
          查看完整大纲
        </Button>
      </div>
      <OutlineDialog
        open={open}
        onOpenChange={setOpen}
        project={{ ...project, outline }}
        onProjectChange={onProjectChange}
      />
    </div>
  );
}
