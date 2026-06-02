'use client';

import { useState, useEffect } from 'react';
import { Check, ZoomIn, Loader2, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
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
  const [savingId, setSavingId] = useState<string | null>(null);
  const [previewStyle, setPreviewStyle] = useState<StylePreset | null>(null);

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

  /**
   * 选择风格（不关闭弹窗）
   */
  async function selectStyle(id: string) {
    if (savingId) return; // 防重
    setSavingId(id);
    try {
      onProjectChange({ ...project, styleId: id });
      await fetch(`/api/projects/${project.uuid}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ styleId: id }),
      });
      // ⭐ 不再 onOpenChange(false) — 弹窗保持打开，用户可继续浏览/预览
    } catch {
      // 静默失败
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      {/* 主弹窗：选择风格 */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>选择视觉风格</DialogTitle>
            <DialogDescription>
              点击卡片选中；点击放大镜可放大预览。选完后点右上角 ✕ 关闭。
            </DialogDescription>
          </DialogHeader>
          {loading ? (
            <div className="flex h-64 items-center justify-center text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              加载中...
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {styles.map(s => {
                const selected = (project.styleId || styles[0]?.id) === s.id;
                const isSaving = savingId === s.id;
                return (
                  <div
                    key={s.id}
                    className={cn(
                      'group relative overflow-hidden rounded-xl border-2 transition-all',
                      selected ? 'border-primary shadow-md' : 'border-slate-200 hover:border-slate-300',
                    )}
                  >
                    {/* 主选择按钮（覆盖缩略图+标题） */}
                    <button
                      type="button"
                      onClick={() => selectStyle(s.id)}
                      disabled={!!savingId}
                      className="block w-full text-left disabled:opacity-60"
                    >
                      <div className="relative aspect-video w-full overflow-hidden bg-slate-100">
                        <iframe
                          title={s.name}
                          srcDoc={s.demoHtml}
                          sandbox="allow-scripts"
                          className="pointer-events-none h-full w-full"
                        />
                        {isSaving && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                            <Loader2 className="h-5 w-5 animate-spin text-white" />
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-semibold">{s.name}</h4>
                          {selected && !isSaving && (
                            <Check className="h-4 w-4 text-primary" />
                          )}
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {s.description}
                        </p>
                      </div>
                    </button>

                    {/* 放大镜按钮 - 浮在右上角 */}
                    <button
                      type="button"
                      onClick={() => setPreviewStyle(s)}
                      className="absolute top-2 right-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover:opacity-100"
                      title="放大预览"
                    >
                      <ZoomIn className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 预览弹窗 - 嵌套 Dialog */}
      <StylePreviewDialog
        style={previewStyle}
        onClose={() => setPreviewStyle(null)}
      />
    </>
  );
}

/**
 * 风格预览大弹窗
 */
function StylePreviewDialog({
  style,
  onClose,
}: {
  style: StylePreset | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!style} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl max-h-[92vh] p-0 overflow-hidden">
        {style && (
          <div className="flex flex-col">
            {/* 顶部信息条 */}
            <div className="flex items-start justify-between gap-4 border-b bg-white p-5">
              <div>
                <h2 className="text-xl font-semibold">{style.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{style.description}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="flex-shrink-0"
                title="关闭预览"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* 大尺寸预览区 - 16:9 */}
            <div className="relative aspect-video w-full bg-slate-100">
              <iframe
                title={`${style.name} 预览`}
                srcDoc={style.demoHtml}
                sandbox="allow-scripts"
                className="h-full w-full"
              />
            </div>

            {/* 底部 prompt 信息 */}
            <div className="border-t bg-slate-50 p-4">
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                风格提示词（AI 生成分镜时使用）
              </div>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border bg-white p-3 text-xs leading-relaxed text-slate-700">
                {style.prompt}
              </pre>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
