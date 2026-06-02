'use client';

import { Subtitles, ListTree, Play, Square, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useStudioStore } from '@/stores/studio-store';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';
import { OutlineDialog } from '@/components/outline/outline-dialog';
import { useFrameGeneration } from '@/hooks/use-frame-generation';
import { toast } from 'sonner';
import type { ProjectDetail } from '@/types';

interface PreviewToolbarProps {
  project: ProjectDetail;
  onProjectChange: (p: ProjectDetail) => void;
  onRefresh: () => Promise<ProjectDetail | undefined>;
}

export function PreviewToolbar({ project, onProjectChange, onRefresh }: PreviewToolbarProps) {
  const showSubtitle = useStudioStore(s => s.showSubtitle);
  const setShowSubtitle = useStudioStore(s => s.setShowSubtitle);
  const [outlineOpen, setOutlineOpen] = useState(false);

  const { generating, progress, start, abort } = useFrameGeneration({
    project,
    onProjectRefresh: async () => {
      const fresh = await onRefresh();
      return fresh;
    },
  });

  async function handleStart() {
    if (!project.outline) {
      toast.error('请先生成视频大纲');
      return;
    }
    const source = project.videoSource?.frames ?? [];
    const pending = project.outline.frames
      .filter((_, i) => {
        const fs = source[i];
        return !fs || (!fs.imagePath && !fs.htmlCode);
      })
      .map(f => f.id);
    if (pending.length === 0) {
      toast.success('所有分镜已生成完毕');
      return;
    }
    await start(pending);
  }

  return (
    <>
      <div className="flex h-12 flex-shrink-0 items-center justify-between border-b bg-white px-4">
        <div className="flex items-center gap-2">
          <Badge variant={project.type === 'image' ? 'default' : 'secondary'}>
            {project.type === 'image' ? '图片轮播' : 'HTML 动画'}
          </Badge>
          {project.outline ? (
            <Badge variant="outline" className="text-xs">
              {project.outline.frames.length} 个分镜
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">等待生成大纲...</span>
          )}
          {generating && progress && (
            <Badge variant="secondary" className="text-xs">
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              {progress.current}/{progress.total} · {progress.phase === 'image' ? '生图' : progress.phase === 'html' ? 'HTML' : progress.phase === 'tts' ? '语音' : '完成'}
            </Badge>
          )}
          {!generating && progress?.phase === 'done' && (
            <Badge variant="outline" className="border-green-200 bg-green-50 text-xs text-green-700">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              完成
            </Badge>
          )}
          {progress?.aborted && (
            <Badge variant="outline" className="border-orange-200 bg-orange-50 text-xs text-orange-700">
              <XCircle className="mr-1 h-3 w-3" />
              已中断
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* 一键生成 / 中断 */}
          {!generating ? (
            <Button
              size="sm"
              variant="default"
              onClick={handleStart}
              disabled={!project.outline}
              title="一键生成分镜画面+旁白"
            >
              <Play className="mr-1 h-3.5 w-3.5" />
              一键生成
            </Button>
          ) : (
            <Button size="sm" variant="destructive" onClick={abort}>
              <Square className="mr-1 h-3.5 w-3.5" />
              中断生成
            </Button>
          )}

          <div className="mx-1 h-5 w-px bg-slate-200" />

          <div className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent">
            <Subtitles className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">字幕</span>
            <Switch checked={showSubtitle} onCheckedChange={setShowSubtitle} />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOutlineOpen(true)}
            title="查看完整大纲"
            disabled={!project.outline}
          >
            <ListTree className="h-4 w-4" />
          </Button>
          {/* 全屏按钮已搬至 PlayerBar（按"全屏预览区"语义） */}
        </div>
      </div>
      <OutlineDialog
        open={outlineOpen}
        onOpenChange={setOutlineOpen}
        project={project}
        onProjectChange={onProjectChange}
      />
    </>
  );
}
