'use client';

import { useState } from 'react';
import { User, Bot, ListTree } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OutlineCard } from '@/components/outline/outline-card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/utils';
import type { ChatMessage, ProjectDetail, MessageMetadata } from '@/types';

interface ChatMessageBubbleProps {
  message: ChatMessage;
  project: ProjectDetail;
  onProjectChange: (p: ProjectDetail) => void;
}

export function ChatMessageBubble({ message, project, onProjectChange }: ChatMessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex w-full gap-2', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div
        className={cn(
          'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-slate-200 text-slate-700' : 'bg-primary/10 text-primary',
        )}
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>
      <div className={cn('flex max-w-[85%] flex-col', isUser ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'rounded-2xl px-3 py-2 text-sm shadow-sm',
            isUser
              ? 'rounded-tr-sm bg-slate-100 text-slate-900'
              : 'rounded-tl-sm border bg-white',
          )}
        >
          {/* 大纲卡片 */}
          {message.metadata?.kind === 'outline' && (
            <OutlineCard
              outline={message.metadata.outline}
              project={project}
              onProjectChange={onProjectChange}
            />
          )}

          {/* 进度卡片 */}
          {message.metadata?.kind === 'frame_progress' && (
            <ProgressCard metadata={message.metadata} />
          )}

          {/* 错误卡片 */}
          {message.metadata?.kind === 'error' && (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 px-2 py-1 text-xs text-destructive">
              ⚠️ {message.metadata.message}
            </div>
          )}

          {/* 文本内容 */}
          {(!message.metadata || message.metadata.kind === 'text') && (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          )}
        </div>
        <span className="mt-1 px-1 text-[10px] text-muted-foreground">
          {formatRelativeTime(message.createdAt)}
        </span>
      </div>
    </div>
  );
}

function ProgressCard({ metadata }: { metadata: Extract<MessageMetadata, { kind: 'frame_progress' }> }) {
  const pct = Math.round((metadata.current / metadata.total) * 100);
  return (
    <div className="space-y-2">
      <p className="text-sm">{message_text(metadata)}</p>
      <div className="flex items-center gap-2">
        <Progress value={pct} className="h-1.5 flex-1" />
        <span className="text-xs text-muted-foreground">
          {metadata.current}/{metadata.total}
        </span>
      </div>
    </div>
  );
}

function message_text(metadata: { current: number; total: number }) {
  return `正在生成分镜画面...`;
}
