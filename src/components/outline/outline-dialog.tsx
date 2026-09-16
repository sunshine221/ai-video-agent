'use client';

import { useState, useEffect } from 'react';
import { Volume2, Loader2, ChevronDown, ChevronRight, Code2, ImageIcon, Image, AudioLines, Save, Pencil, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useStudioStore } from '@/stores/studio-store';
import { HtmlThumb } from '@/components/studio/html-thumb';
import type { ProjectDetail, Outline, FrameOutline } from '@/types';

interface OutlineDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: ProjectDetail;
  onProjectChange: (p: ProjectDetail) => void;
  /** 打开时自动展开的分镜 id（如从分镜条的编辑按钮进入） */
  initialFrameId?: string | null;
  /** 打开时是否直接进入编辑态 */
  initialEditing?: boolean;
}

export function OutlineDialog({ open, onOpenChange, project, onProjectChange, initialFrameId, initialEditing }: OutlineDialogProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // 是否处于编辑态：展开后默认只读，点「编辑」才进入编辑
  const [editing, setEditing] = useState(false);
  // 展开分镜的文字草稿（旁白 / 画面提示词），保存前只存在本地
  const [draftNarration, setDraftNarration] = useState('');
  const [draftPrompt, setDraftPrompt] = useState('');
  // html 模式画面设计的四个结构化字段草稿
  const [draftVisualSummary, setDraftVisualSummary] = useState('');
  const [draftLayout, setDraftLayout] = useState('');
  const [draftAnimation, setDraftAnimation] = useState('');
  const [draftTransition, setDraftTransition] = useState('');
  const setSelectedFrameId = useStudioStore(s => s.setSelectedFrameId);
  const qc = useQueryClient();

  // 打开时若指定了初始分镜：展开它，并按需进入编辑态、灌入草稿
  useEffect(() => {
    if (!open || !initialFrameId) return;
    const frame = project.outline?.frames.find(f => f.id === initialFrameId);
    if (!frame) return;
    setExpandedId(initialFrameId);
    setSelectedFrameId(initialFrameId);
    if (initialEditing) {
      startEdit(frame);
      setEditing(true);
    } else {
      setEditing(false);
    }
  }, [open, initialFrameId, initialEditing, project.outline, setSelectedFrameId]);

  async function refreshProject() {
    const res = await fetch(`/api/projects/${project.uuid}`);
    if (!res.ok) throw new Error('刷新项目失败');
    const data = await res.json();
    onProjectChange(data);
  }

  // 展开某个分镜：默认只读态
  function toggleExpand(frameId: string) {
    if (expandedId === frameId) {
      setExpandedId(null);
      setEditing(false);
      return;
    }
    setExpandedId(frameId);
    setSelectedFrameId(frameId);
    setEditing(false);
  }

  // 进入编辑态：把当前文字灌进草稿
  function startEdit(frame: FrameOutline) {
    setDraftNarration(frame.narration);
    setDraftPrompt((frame.imagePrompt || '') as string);
    setDraftVisualSummary((frame.visualSummary || '') as string);
    setDraftLayout((frame.layout || '') as string);
    setDraftAnimation((frame.animation || '') as string);
    setDraftTransition((frame.transition || '') as string);
    setEditing(true);
  }

  // 保存文字：只更新 outline 里该分镜的 narration / 提示词，不触发画面或音频生成
  const saveText = useMutation({
    mutationFn: async (frameId: string) => {
      if (!project.outline) throw new Error('大纲不存在');
      const nextFrames = project.outline.frames.map(f =>
        f.id === frameId
          ? {
              ...f,
              narration: draftNarration,
              // image 模式编辑画面提示词；html 模式编辑画面设计的四个结构化字段
              ...(project.type === 'image'
                ? { imagePrompt: draftPrompt }
                : {
                    visualSummary: draftVisualSummary,
                    layout: draftLayout,
                    animation: draftAnimation,
                    transition: draftTransition,
                  }),
            }
          : f,
      );
      const nextOutline: Outline = { ...project.outline, frames: nextFrames };
      const res = await fetch(`/api/projects/${project.uuid}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ outline: nextOutline }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '保存失败');
      return nextOutline;
    },
    onSuccess: () => {
      toast.success('文字已保存（画面和旁白未变，需手动重新生成）');
      setEditing(false);
      qc.invalidateQueries({ queryKey: ['project', project.uuid] });
      refreshProject().catch(() => {});
    },
    onError: e => toast.error((e as Error).message),
  });

  /**
   * 触发单帧「画面重新生成」并消费 SSE 流。
   * 帧生成接口返回的是 text/event-stream，需读取到 done 才算完成；
   * 出现 frame_error 事件时抛错，交给 mutation 的 onError 提示。
   */
  async function runFrameRegen(frameId: string) {
    const url = project.type === 'image' ? '/api/frames/image' : '/api/frames/html';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: project.uuid, frameIds: [frameId], regen: true }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '重新生成失败');
    }
    if (!res.body) return;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let frameError: string | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';
      for (const ev of events) {
        let event = 'message';
        let data = '';
        for (const line of ev.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) data += line.slice(5).trim();
        }
        if (event === 'frame_error' && data) {
          try {
            frameError = JSON.parse(data).message || '画面生成失败';
          } catch {
            frameError = '画面生成失败';
          }
        }
      }
    }

    if (frameError) throw new Error(frameError);
  }

  const regenImage = useMutation({
    mutationFn: (frameId: string) => runFrameRegen(frameId),
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
          <DialogDescription>展开分镜可编辑旁白与画面提示词；先保存文字，再按需重新生成画面或语音</DialogDescription>
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
                    onClick={() => toggleExpand(f.id)}
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
                      <div className="space-y-4">
                        {/* 旁白：默认只读，编辑态才可改 */}
                        <div>
                          <div className="mb-1 flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">旁白文字（决定语音内容）</span>
                            {!editing && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                onClick={() => startEdit(f)}
                                title="编辑文字"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                          {editing ? (
                            <Textarea
                              value={draftNarration}
                              onChange={e => setDraftNarration(e.target.value)}
                              placeholder="输入这一镜的旁白..."
                              className="min-h-[60px] resize-y bg-white text-sm"
                            />
                          ) : (
                            <p className="whitespace-pre-wrap rounded-md border bg-white p-2 text-sm">{f.narration}</p>
                          )}
                        </div>

                        {/* 画面设计：image 模式为可编辑提示词；html 模式为结构化四字段（只读，改用对话调整） */}
                        {project.type === 'image' ? (
                          <div>
                            <div className="mb-1 flex items-center justify-between">
                              <span className="text-xs font-medium text-muted-foreground">
                                画面提示词（决定文生图画面）
                              </span>
                              {!editing && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                  onClick={() => startEdit(f)}
                                  title="编辑文字"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                            {editing ? (
                              <Textarea
                                value={draftPrompt}
                                onChange={e => setDraftPrompt(e.target.value)}
                                placeholder="描述这一镜画面要呈现的内容..."
                                className="min-h-[72px] resize-y bg-white text-xs leading-relaxed"
                              />
                            ) : (
                              <p className="whitespace-pre-wrap rounded-md border bg-white p-2 text-xs leading-relaxed text-slate-700">
                                {(f.imagePrompt || '') as string}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div>
                            <div className="mb-1 flex items-center justify-between">
                              <span className="text-xs font-medium text-muted-foreground">
                                画面设计（决定 HTML 动画画面）
                              </span>
                              {!editing && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                  onClick={() => startEdit(f)}
                                  title="编辑文字"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                            {editing ? (
                              <div className="space-y-2">
                                {[
                                  { label: '视觉主张', value: draftVisualSummary, set: setDraftVisualSummary, placeholder: '这一镜要表达什么（核心视觉主张）...' },
                                  { label: '布局构图', value: draftLayout, set: setDraftLayout, placeholder: '空间构图（元素摆放、主次、留白）...' },
                                  { label: '动作与分步', value: draftAnimation, set: setDraftAnimation, placeholder: '动作/动效/分步节奏...' },
                                  { label: '与下一镜衔接', value: draftTransition, set: setDraftTransition, placeholder: '如何衔接下一镜...' },
                                ].map(item => (
                                  <div key={item.label}>
                                    <span className="mb-1 block text-[11px] text-slate-400">{item.label}</span>
                                    <Textarea
                                      value={item.value}
                                      onChange={e => item.set(e.target.value)}
                                      placeholder={item.placeholder}
                                      className="min-h-[56px] resize-y bg-white text-xs leading-relaxed"
                                    />
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="space-y-1.5 rounded-md border bg-white p-2 text-xs leading-relaxed text-slate-700">
                                {[
                                  { label: '视觉主张', value: f.visualSummary },
                                  { label: '布局构图', value: f.layout },
                                  { label: '动作与分步', value: f.animation },
                                  { label: '与下一镜衔接', value: f.transition },
                                ].filter(item => item.value).map(item => (
                                  <p key={item.label}>
                                    <span className="text-slate-400">{item.label}：</span>
                                    {item.value as string}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* 保存区：仅编辑态显示 */}
                        {editing && (
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              disabled={saveText.isPending}
                              onClick={() => saveText.mutate(f.id)}
                            >
                              {saveText.isPending ? (
                                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Save className="mr-1 h-3.5 w-3.5" />
                              )}
                              保存
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={saveText.isPending}
                              onClick={() => setEditing(false)}
                            >
                              <X className="mr-1 h-3.5 w-3.5" />
                              取消
                            </Button>
                          </div>
                        )}

                        {/* 按当前文字重新产出媒体（编辑中禁用，需先保存） */}
                        <div className="border-t pt-3">
                          <div className="mb-2 text-[11px] font-medium text-muted-foreground">
                            {editing ? '请先保存文字，再重新生成画面或音频' : '按当前文字重新生成媒体（不会修改上面的文字）'}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={editing || regenImage.isPending}
                              onClick={() => regenImage.mutate(f.id)}
                            >
                              {regenImage.isPending ? (
                                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Image className="mr-1 h-3.5 w-3.5" />
                              )}
                              重新生成画面（{project.type === 'image' ? '图片' : 'HTML 动画'}）
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={editing || regenTTS.isPending}
                              onClick={() => regenTTS.mutate(f.id)}
                            >
                              {regenTTS.isPending ? (
                                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <AudioLines className="mr-1 h-3.5 w-3.5" />
                              )}
                              重新生成旁白语音（音频）
                            </Button>
                          </div>
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
