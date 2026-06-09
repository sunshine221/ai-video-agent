'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Images, Code2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn, formatRelativeTime } from '@/lib/utils';
import { useState } from 'react';
import type { ProjectSummary, ProjectType } from '@/types';

export function ProjectList() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [loadingType, setLoadingType] = useState<ProjectType | null>(null);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await fetch('/api/projects');
      if (!res.ok) throw new Error('加载项目列表失败');
      return (await res.json()) as ProjectSummary[];
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (uuid: string) => {
      const res = await fetch(`/api/projects/${uuid}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除失败');
    },
    onSuccess: () => {
      toast.success('项目已删除');
      qc.invalidateQueries({ queryKey: ['projects'] });
      // 删的是当前打开的项目则跳回首页
      if (params.id) {
        const remaining = projects.filter(p => p.uuid !== params.id);
        if (remaining.length) router.push(`/projects/${remaining[0].uuid}`);
        else router.push('/');
      }
    },
    onError: e => toast.error((e as Error).message),
  });

  async function handleCreate(type: ProjectType) {
    setLoadingType(type);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '创建项目失败');
      qc.invalidateQueries({ queryKey: ['projects'] });
      router.push(`/projects/${data.uuid}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingType(null);
    }
  }

  return (
    <div className="flex h-full flex-col border-r bg-slate-50/50">
      <div className="border-b p-3">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
          新建项目
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={loadingType !== null}
            onClick={() => handleCreate('image')}
            className="h-auto flex-col gap-1 py-2"
          >
            {loadingType === 'image' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Images className="h-4 w-4 text-blue-600" />
            )}
            <span className="text-xs">图片模式</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={loadingType !== null}
            onClick={() => handleCreate('html')}
            className="h-auto flex-col gap-1 py-2"
          >
            {loadingType === 'html' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Code2 className="h-4 w-4 text-purple-600" />
            )}
            <span className="text-xs">HTML 模式</span>
          </Button>
        </div>
      </div>

      <div className="border-b px-3 py-2">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          历史项目
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="w-full max-w-full space-y-1 p-2">
          {isLoading ? (
            <div className="flex justify-center py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : projects.length === 0 ? (
            <div className="px-2 py-8 text-center text-xs text-muted-foreground">
              暂无项目，点击上方按钮创建
            </div>
          ) : (
            projects.map(p => {
              const active = p.uuid === params.id;
              return (
                <div
                  key={p.uuid}
                  className={cn(
                    'group grid w-full min-w-0 grid-cols-[auto,minmax(0,1fr),auto] items-start gap-2 rounded-lg border px-3 py-2 transition-colors',
                    active
                      ? 'border-primary bg-primary/5'
                      : 'border-transparent hover:bg-accent',
                  )}
                >
                  <div
                    role="link"
                    tabIndex={0}
                    onClick={() => router.push(`/projects/${p.uuid}`)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        router.push(`/projects/${p.uuid}`);
                      }
                    }}
                    className="col-span-2 grid min-w-0 cursor-pointer grid-cols-[auto,minmax(0,1fr)] items-start gap-2"
                  >
                    {p.type === 'image' ? (
                      <Images className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" />
                    ) : (
                      <Code2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-purple-600" />
                    )}
                    <div className="min-w-0">
                      <div className="line-clamp-2 break-words text-sm font-medium leading-5">
                        {p.title}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                        <span>{formatRelativeTime(p.createdAt)}</span>
                        {p.hasOutline && (
                          <>
                            <span>·</span>
                            <span>已生成</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (confirm('确定要删除这个项目吗？')) deleteMut.mutate(p.uuid);
                    }}
                    className="mt-0.5 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                    title="删除项目"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
