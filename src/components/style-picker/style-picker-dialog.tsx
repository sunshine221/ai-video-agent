'use client';

import { useState, useEffect } from 'react';
import { Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { ProjectDetail, StylePreset } from '@/types';

interface StylePickerDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: ProjectDetail;
  onProjectChange: (p: ProjectDetail) => void;
}

export function StylePickerDialog({ open, onOpenChange, project, onProjectChange }: StylePickerDialogProps) {
  const [styles, setStyles] = useState<StylePreset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/styles')
      .then(r => r.json())
      .then(d => {
        setStyles(d.styles || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [open]);

  function pick(id: string) {
    onProjectChange({ ...project, styleId: id });
    // 持久化
    fetch(`/api/projects/${project.uuid}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ styleId: id }),
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>选择视觉风格</DialogTitle>
          <DialogDescription>选择后，AI 生成分镜动画时会按此风格渲染</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex h-64 items-center justify-center text-muted-foreground">加载中...</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {styles.map(s => {
              const selected = (project.styleId || styles[0]?.id) === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => pick(s.id)}
                  className={cn(
                    'group relative overflow-hidden rounded-xl border-2 text-left transition-all',
                    selected ? 'border-primary shadow-md' : 'border-slate-200 hover:border-slate-300',
                  )}
                >
                  <div className="aspect-video w-full overflow-hidden bg-slate-100">
                    <iframe
                      title={s.name}
                      srcDoc={s.demoHtml}
                      sandbox="allow-scripts"
                      className="pointer-events-none h-full w-full"
                    />
                  </div>
                  <div className="p-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold">{s.name}</h4>
                      {selected && <Check className="h-4 w-4 text-primary" />}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{s.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
