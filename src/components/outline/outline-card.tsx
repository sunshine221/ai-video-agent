'use client';

import { useState } from 'react';
import { ListTree, Image as ImageIcon, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OutlineDialog } from './outline-dialog';
import type { ProjectDetail, Outline } from '@/types';

interface OutlineCardProps {
  outline: Outline;
  project: ProjectDetail;
  onProjectChange: (p: ProjectDetail) => void;
}

export function OutlineCard({ outline, project, onProjectChange }: OutlineCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-w-[280px] max-w-md">
      <div className="mb-2 flex items-center gap-2 border-b pb-2">
        <ListTree className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-semibold">{outline.title}</h4>
      </div>
      <p className="mb-2 text-xs text-muted-foreground">
        已生成 {outline.frames.length} 个分镜，{Math.round(outline.totalDuration)} 秒
      </p>
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr className="border-b">
              <th className="w-8 px-2 py-1.5 text-left font-medium">#</th>
              <th className="px-2 py-1.5 text-left font-medium">标题</th>
              <th className="px-2 py-1.5 text-left font-medium">旁白</th>
            </tr>
          </thead>
          <tbody>
            {outline.frames.slice(0, 6).map(f => (
              <tr key={f.id} className="border-b last:border-0">
                <td className="px-2 py-1.5 font-mono text-muted-foreground">{f.index}</td>
                <td className="px-2 py-1.5 font-medium">{f.title}</td>
                <td className="max-w-[140px] truncate px-2 py-1.5 text-muted-foreground">
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
      <div className="mt-2 flex justify-end">
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
