'use client';

import { useState, useEffect, useRef } from 'react';
import { Check, ZoomIn, Loader2, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ProjectDetail, StylePreset } from '@/types';

interface StylePickerDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: ProjectDetail;
  onProjectChange: (p: ProjectDetail) => void;
}

/**
 * 等比缩放预览：demo HTML 以 1280x720 设计稿尺寸渲染，
 * 外层整体 transform: scale 后居中，避免 100vh 布局在小框里被压变形。
 * fitHeight=true 时同时受容器高度约束（用于全屏预览弹窗，保证画面完整可见）。
 */
function ScaledPreview({
  html,
  className,
  fitHeight = false,
}: {
  html: string;
  className?: string;
  fitHeight?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.25);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const s = fitHeight
        ? Math.min(el.clientWidth / 1280, el.clientHeight / 720)
        : el.clientWidth / 1280;
      setScale(s);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitHeight]);

  return (
    <div
      ref={ref}
      className={cn(
        'relative w-full overflow-hidden bg-slate-100',
        fitHeight ? 'h-full' : 'aspect-video',
        className,
      )}
    >
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: 1280 * scale,
          height: 720 * scale,
          transform: 'translate(-50%, -50%)',
        }}
      >
        <div style={{ width: 1280, height: 720, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <iframe
            title="风格预览"
            srcDoc={html}
            sandbox="allow-scripts"
            className="pointer-events-none block border-0 bg-transparent"
            style={{ width: 1280, height: 720 }}
          />
        </div>
      </div>
    </div>
  );
}

export function StylePickerDialog({ open, onOpenChange, project, onProjectChange }: StylePickerDialogProps) {
  const [styles, setStyles] = useState<StylePreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewStyle, setPreviewStyle] = useState<StylePreset | null>(null);
  // 暂存选中项（本地态），点「确认」后才写库
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/styles')
      .then(r => r.json())
      .then(d => {
        const list: StylePreset[] = d.styles || [];
        setStyles(list);
        // 打开时同步为项目当前风格；无则默认「手绘讲故事」，再退化为列表第一个
        const fallback = list.find(s => s.slug === 'hand-drawn-story')?.id || list[0]?.id || null;
        setSelectedId(project.styleId || fallback);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [open, project.styleId]);

  const defaultId = styles.find(s => s.slug === 'hand-drawn-story')?.id || styles[0]?.id || null;
  const currentId = project.styleId || defaultId;
  const dirty = selectedId !== currentId;

  /**
   * 确认选择：写库并关闭弹窗
   */
  async function confirmSelection() {
    if (!selectedId || saving) return;
    if (!dirty) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    try {
      onProjectChange({ ...project, styleId: selectedId });
      await fetch(`/api/projects/${project.uuid}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ styleId: selectedId }),
      });
      onOpenChange(false);
    } catch {
      // 静默失败，保持弹窗打开
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* 主弹窗：选择风格 */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[85vh] max-w-4xl flex-col">
          <DialogHeader>
            <DialogTitle>选择视觉风格</DialogTitle>
            <DialogDescription>
              点击卡片选中，点右上角放大镜可全屏预览动效。选好后点「确认使用」生效。
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex h-64 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              加载中...
            </div>
          ) : (
            /* 原生滚动容器：保证风格多于半屏时始终可见滚动条并滚到全部卡片 */
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
              <div className="grid grid-cols-1 gap-3 py-1 md:grid-cols-2">
                {styles.map(s => {
                  const selected = selectedId === s.id;
                  const isCurrent = currentId === s.id;
                  return (
                    <div
                      key={s.id}
                      className={cn(
                        'group relative overflow-hidden rounded-xl border-2 transition-all',
                        selected
                          ? 'border-primary shadow-md ring-2 ring-primary/20'
                          : 'border-slate-200 hover:border-slate-300',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedId(s.id)}
                        className="block w-full text-left"
                      >
                        <ScaledPreview html={s.demoHtml} />
                        <div className="p-3">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="flex items-center gap-2 text-sm font-semibold">
                              {s.name}
                              {isCurrent && (
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                                  当前
                                </span>
                              )}
                            </h4>
                            {selected && <Check className="h-4 w-4 flex-shrink-0 text-primary" />}
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {s.description}
                          </p>
                        </div>
                      </button>

                      {/* 放大镜：全屏预览动效 */}
                      <button
                        type="button"
                        onClick={() => setPreviewStyle(s)}
                        className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover:opacity-100"
                        title="放大预览"
                      >
                        <ZoomIn className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <DialogFooter className="flex-shrink-0 border-t pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={confirmSelection} disabled={saving || !selectedId}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {dirty ? '确认使用' : '完成'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 预览弹窗 - 嵌套 Dialog */}
      <StylePreviewDialog style={previewStyle} onClose={() => setPreviewStyle(null)} />
    </>
  );
}

/**
 * 风格预览大弹窗（全屏尺寸演示动效）
 */
function StylePreviewDialog({
  style,
  onClose,
}: {
  style: StylePreset | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!style} onOpenChange={o => !o && onClose()}>
      <DialogContent
        hideClose
        className="flex max-h-[92vh] max-w-6xl flex-col gap-0 overflow-hidden p-0"
      >
        {style && (
          <>
            {/* 顶部信息条 */}
            <div className="flex flex-shrink-0 items-start justify-between gap-4 border-b bg-white p-5">
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

            {/* 大尺寸预览区：同时受宽高约束等比缩放，画面完整不裁切 */}
            <div className="min-h-0 flex-1 bg-slate-100">
              <ScaledPreview html={style.demoHtml} fitHeight />
            </div>

            {/* 底部 prompt 信息 */}
            <div className="flex-shrink-0 border-t bg-slate-50 p-4">
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                风格提示词（AI 生成分镜时使用）
              </div>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border bg-white p-3 text-xs leading-relaxed text-slate-700">
                {style.prompt}
              </pre>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
