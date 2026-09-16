'use client';

import { User, Bot, Loader2 } from 'lucide-react';
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
  /** 是否为最新的大纲消息：只有最新大纲卡片显示「一键生成」按钮 */
  isLatestOutline?: boolean;
}

export function ChatMessageBubble({ message, project, onProjectChange, isLatestOutline }: ChatMessageBubbleProps) {
  const isUser = message.role === 'user';
  // 卡片类消息（大纲等）需要占满可用宽度并由内部自行截断，避免窄面板下溢出
  const isCard = message.metadata?.kind === 'outline';

  return (
    <div className={cn('flex w-full min-w-0 gap-2', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div
        className={cn(
          'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-slate-200 text-slate-700' : 'bg-primary/10 text-primary',
        )}
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>
      <div
        className={cn(
          'flex min-w-0 flex-col',
          isUser ? 'items-end' : 'items-start',
          isCard ? 'w-full max-w-md' : 'max-w-[85%]',
        )}
      >
        <div
          className={cn(
            'rounded-2xl px-3 py-2 text-sm shadow-sm',
            isUser
              ? 'rounded-tr-sm bg-slate-100 text-slate-900'
              : 'rounded-tl-sm border bg-white',
            isCard ? 'w-full min-w-0' : 'max-w-full min-w-0',
          )}
        >
          {/* 大纲卡片 */}
          {message.metadata?.kind === 'outline' && (
            <OutlineCard
              outline={message.metadata.outline}
              project={project}
              onProjectChange={onProjectChange}
              showGenerate={isLatestOutline}
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

          {/* 等待态气泡 */}
          {message.metadata?.kind === 'pending' && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
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
