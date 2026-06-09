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
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useStudioStore } from '@/stores/studio-store';
import { HtmlThumb } from '@/components/studio/html-thumb';
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

  async function refreshProject() {
    const res = await fetch(`/api/projects/${project.uuid}`);
    if (!res.ok) throw new Error('刷新项目失败');
    const data = await res.json();
    onProjectChange(data);
  }

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
      refreshProject().catch(() => {});
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
      refreshProject().catch(() => {});
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
      <DialogContent className="flex max-h-[85vh] min-h-0 max-w-4xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{project.outline.title}</span>
            <span className="text-xs font-normal text-muted-foreground">
              · {frames.length} 个分镜 · {Math.round(project.outline.totalDuration)}秒
            </span>
          </DialogTitle>
          <DialogDescription>查看每个分镜的画面预览、旁白、提示词；可单独重新生成</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-1">
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
                    {/* 缩略图 */}
                    <div className="h-16 w-24 flex-shrink-0 overflow-hidden rounded-md bg-slate-100">
                      {project.type === 'image' && fs?.imagePath ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={fs.imagePath} alt={f.title} className="h-full w-full object-cover" />
                      ) : project.type === 'html' && fs?.htmlCode ? (
                        <HtmlThumb htmlCode={fs.htmlCode} scale={0.075} title="完整大纲分镜缩略预览" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-400">
                          {project.type === 'image' ? <ImageIcon className="h-5 w-5" /> : <Code2 className="h-5 w-5" />}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono">
                          #{f.index}
                        </span>
                        <h4 className="truncate text-sm font-medium">{f.title}</h4>
                      </div>
                      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{f.narration}</p>
                    </div>

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
        </div>
      </DialogContent>
    </Dialog>
  );
}
