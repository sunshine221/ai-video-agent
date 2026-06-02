'use client';

import { useState, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Loader2, Palette } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChatMessageBubble } from '@/components/chat/chat-message';
import { StylePickerDialog } from '@/components/style-picker/style-picker-dialog';
import type { ProjectDetail, ChatMessage } from '@/types';

interface ChatPanelProps {
  project: ProjectDetail;
  messages: ChatMessage[];
  onMessagesChange: (m: ChatMessage[]) => void;
  onProjectChange: (p: ProjectDetail) => void;
}

export function ChatPanel({ project, messages, onMessagesChange, onProjectChange }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [stylePickerOpen, setStylePickerOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  // 滚动到底
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const sendMut = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: project.uuid, content }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '请求失败');
      }
      return res.json() as Promise<{
        userMessage: ChatMessage;
        assistantMessage: ChatMessage;
        project: ProjectDetail;
      }>;
    },
    onSuccess: data => {
      onMessagesChange([...messages, data.userMessage, data.assistantMessage]);
      onProjectChange(data.project);
      qc.invalidateQueries({ queryKey: ['projects'] });
      setInput('');
    },
    onError: e => toast.error((e as Error).message),
  });

  function handleSend() {
    const text = input.trim();
    if (!text || sendMut.isPending) return;
    sendMut.mutate(text);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 flex-shrink-0 items-center justify-between border-b bg-white px-4">
        <span className="text-sm font-medium">AI 对话</span>
        <span className="text-xs text-muted-foreground">{messages.length} 条消息</span>
      </div>

      <ScrollArea className="flex-1" ref={scrollRef as never}>
        <div className="space-y-3 p-3">
          {messages.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-slate-50 p-4 text-center text-sm text-muted-foreground">
              <p className="font-medium">开始创作</p>
              <p className="mt-1 text-xs">输入提示词，例如：</p>
              <p className="mt-1 text-xs italic">"帮我做一个 3 分钟介绍黑洞的视频"</p>
            </div>
          ) : (
            messages.map(m => (
              <ChatMessageBubble
                key={m.id}
                message={m}
                project={project}
                onProjectChange={onProjectChange}
              />
            ))
          )}
          {sendMut.isPending && (
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              AI 正在思考...
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="flex-shrink-0 border-t bg-white p-3">
        <div className="relative">
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="输入提示词，⌘/Ctrl+Enter 发送"
            className="min-h-[60px] resize-none pr-20 text-sm"
          />
          <div className="absolute bottom-2 right-2 flex items-center gap-1">
            {project.type === 'html' && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setStylePickerOpen(true)}
                title="选择视觉风格"
              >
                <Palette className="h-4 w-4" />
              </Button>
            )}
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!input.trim() || sendMut.isPending}
              title="发送"
            >
              {sendMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          支持的操作：生成大纲 · 新增/删除/重生成分镜
        </p>
      </div>

      <StylePickerDialog
        open={stylePickerOpen}
        onOpenChange={setStylePickerOpen}
        project={project}
        onProjectChange={onProjectChange}
      />
    </div>
  );
}
