'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { StudioLayout } from '@/components/studio/studio-layout';
import type { ProjectDetail, ChatMessage } from '@/types';

interface PageProps {
  params: { id: string };
}

export default function ProjectPage({ params }: PageProps) {
  const { id } = params;

  const { data, isLoading, error } = useQuery({
    queryKey: ['project', id],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) throw new Error((await res.json()).error || '加载失败');
      return (await res.json()) as ProjectDetail & { messages: ChatMessage[] };
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">加载项目中...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <p className="text-lg font-medium">项目加载失败</p>
          <p className="mt-1 text-sm text-muted-foreground">{(error as Error)?.message}</p>
        </div>
      </div>
    );
  }

  return <StudioLayout initialProject={data} initialMessages={data.messages} />;
}
