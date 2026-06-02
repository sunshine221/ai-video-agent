'use client';

import { useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { ArrowLeft, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { ProjectList } from './project-list';
import { PreviewPanel } from './preview-panel';
import { ChatPanel } from './chat-panel';
import { useStudioStore } from '@/stores/studio-store';
import type { ProjectDetail, ChatMessage } from '@/types';
import { env } from '@/lib/env';

interface StudioLayoutProps {
  initialProject: ProjectDetail;
  initialMessages: ChatMessage[];
}

export function StudioLayout({ initialProject, initialMessages }: StudioLayoutProps) {
  const [project, setProject] = useState<ProjectDetail>(initialProject);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const setSelectedFrameId = useStudioStore(s => s.setSelectedFrameId);

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      {/* Top bar */}
      <header className="flex h-12 flex-shrink-0 items-center justify-between border-b bg-white px-4">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </Link>
          <span className="text-muted-foreground">·</span>
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">{env.APP_NAME}</span>
          </div>
        </div>
        <div className="text-sm">
          <span className="font-medium">{project.title}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {project.type === 'image' ? '图片轮播模式' : 'HTML 动画模式'}
          </span>
        </div>
      </header>

      {/* Main 3-column area */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal" autoSaveId="studio-layout">
          {/* Left: project list */}
          <Panel defaultSize={18} minSize={12} maxSize={28} className="bg-white">
            <ProjectList />
          </Panel>

          <PanelResizeHandle className="w-1 bg-slate-200 transition-colors hover:bg-primary data-[resize-handle-state=drag]:bg-primary" />

          {/* Middle: preview + storyboard */}
          <Panel defaultSize={50} minSize={30}>
            <PreviewPanel project={project} onProjectChange={setProject} onFrameSelect={setSelectedFrameId} />
          </Panel>

          <PanelResizeHandle className="w-1 bg-slate-200 transition-colors hover:bg-primary data-[resize-handle-state=drag]:bg-primary" />

          {/* Right: chat panel */}
          <Panel defaultSize={32} minSize={22} maxSize={50} className="bg-white">
            <ChatPanel
              project={project}
              messages={messages}
              onMessagesChange={setMessages}
              onProjectChange={setProject}
            />
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}
