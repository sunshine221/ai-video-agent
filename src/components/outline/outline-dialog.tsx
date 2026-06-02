'use client';

import { useState } from 'react';
import { Volume2, RefreshCw, Loader2, ChevronDown, ChevronRight, Code2, ImageIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useStudioStore } from '@/stores/studio-store';
import type { ProjectDetail } from '@/types';

interface OutlineDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: ProjectDetail;
  onProjectChange: (p: ProjectDetail) => void;
}

export function OutlineDialog({ open, onOpenChange, project, onProjectChange }: OutlineDialogProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const setSelectedFrameId = useStudioStore(s => s.setSelectedFrameId);
  const qc = useQueryClient();

  const regenImage = useMutation({
    mutationFn: async (frameId: string) => {
      const res = await fetch(`/api/frames/image`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: project.uuid, frameIds: [frameId] }),
      });
      if (!res.ok) throw new Error((await res.json()).error || '重生成失败');
      return res.json();
    },
    onSuccess: () => {
      toast.success('画面已重新生成');
      qc.invalidateQueries({ queryKey: ['project', project.uuid] });
    },
    onError: e => toast.error((e as Error).message),
  });

  const regenTTS = useMutation({
    mutationFn: async (frameId: string) => {
      const res = await fetch(`/api/tts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: project.uuid, frameId, regen: true }),
      });
      if (!res.ok) throw new Error((await res.json()).error || '重生成功');
      return res.json();
    },
    onSuccess: () => {
      toast.success('旁白已重新生成');
      qc.invalidateQueries({ queryKey: ['project', project.uuid] });
    },
    onError: e => toast.error((e as Error).message),
  });

  if (!project.outline) return null;

  const frames = project.outline.frames;
  const sources = project.videoSource?.frames ?? [];

  function playAudio(path?: string) {
    if (!path) return;
    const audio = new Audio(path);
    audio.play().catch(() => {});
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{project.outline.title}</span>
            <span className="text-xs font-normal text-muted-foreground">
              · {frames.length} 个分镜 · {Math.round(project.outline.totalDuration)}秒
            </span>
          </DialogTitle>
          <DialogDescription>查看每个分镜的画面预览、旁白、提示词；可单独重新生成</DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-3 pb-4">
            {frames.map((f, i) => {
              const fs = sources[i];
              const isExpanded = expandedId === f.id;
              return (
                <div key={f.id} className="overflow-hidden rounded-lg border bg-white">
                  <div
                    className="flex cursor-pointer items-center gap-3 p-3 hover:bg-slate-50"
                    onClick={() => {
                      setExpandedId(isExpanded ? null : f.id);
                      setSelectedFrameId(f.id);
                    }}
                  >
                    {/* 缩略图：HTML 模式用静态占位避免多 iframe 卡死 */}
                    <div className="h-16 w-24 flex-shrink-0 overflow-hidden rounded-md bg-slate-100">
                      {project.type === 'image' && fs?.imagePath ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={fs.imagePath} alt={f.title} className="h-full w-full object-cover" />
                      ) : project.type === 'html' && fs?.htmlCode ? (
                        <div
                          className="h-full w-full"
                          style={{
                            background: `linear-gradient(135deg, hsl(${
                              Array.from(f.id).reduce((a, c) => a + c.charCodeAt(0), 0) % 360
                            } 60% 88%), hsl(0 0% 96%))`,
                          }}
                        >
                          <Code2 className="m-auto mt-4 block h-5 w-5 text-slate-500" />
                        </div>
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-400">
                          {project.type === 'image' ? <ImageIcon className="h-5 w-5" /> : <Code2 className="h-5 w-5" />}
                        </div>
                      )}
                    </div>

                    {/* 信息 */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono">
                          #{f.index}
                        </span>
                        <h4 className="truncate text-sm font-medium">{f.title}</h4>
                      </div>
                      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{f.narration}</p>
                    </div>

                    {/* 操作 */}
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={!fs?.audioPath}
                        onClick={() => playAudio(fs?.audioPath)}
                        title={fs?.audioPath ? '播放旁白' : '尚无旁白'}
                      >
                        <Volume2 className={cn('h-4 w-4', fs?.audioPath ? 'text-orange-500' : 'text-slate-300')} />
                      </Button>
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>

                  {/* 展开详情 */}
                  {isExpanded && (
                    <div className="border-t bg-slate-50 p-3">
                      <div className="space-y-3">
                        <div>
                          <div className="mb-1 text-xs font-medium text-muted-foreground">旁白</div>
                          <p className="text-sm">{f.narration}</p>
                        </div>
                        <div>
                          <div className="mb-1 text-xs font-medium text-muted-foreground">
                            画面提示词（{project.type === 'image' ? '用于文生图' : '用于 HTML 动画'}）
                          </div>
                          <p className="rounded-md border bg-white p-2 text-xs leading-relaxed text-slate-700">
                            {f.imagePrompt || f.htmlPrompt}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={regenImage.isPending}
                            onClick={() => regenImage.mutate(f.id)}
                          >
                            {regenImage.isPending ? (
                              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="mr-1 h-3.5 w-3.5" />
                            )}
                            重新生成画面
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={regenTTS.isPending}
                            onClick={() => regenTTS.mutate(f.id)}
                          >
                            {regenTTS.isPending ? (
                              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="mr-1 h-3.5 w-3.5" />
                            )}
                            重新生成旁白
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
