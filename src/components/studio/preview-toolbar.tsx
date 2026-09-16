'use client';

import { Subtitles, ListTree } from 'lucide-react';
import { useStudioStore } from '@/stores/studio-store';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';
import { OutlineDialog } from '@/components/outline/outline-dialog';
import type { ProjectDetail } from '@/types';

interface PreviewToolbarProps {
  project: ProjectDetail;
  onProjectChange: (p: ProjectDetail) => void;
}

export function PreviewToolbar({ project, onProjectChange }: PreviewToolbarProps) {
  const showSubtitle = useStudioStore(s => s.showSubtitle);
  const setShowSubtitle = useStudioStore(s => s.setShowSubtitle);
  const [outlineOpen, setOutlineOpen] = useState(false);

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
        </div>
        <div className="flex items-center gap-1">
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
