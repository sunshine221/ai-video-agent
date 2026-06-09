'use client';

import { useState, useRef, useCallback } from 'react';
import { useStudioStore } from '@/stores/studio-store';
import type { ProjectDetail } from '@/types';

export interface GenerationProgress {
  total: number;
  current: number;
  phase: 'image' | 'html' | 'tts' | 'done';
  frameId?: string;
  message?: string;
  aborted?: boolean;
}

interface UseFrameGenerationProps {
  project: ProjectDetail;
  onProjectRefresh: () => Promise<ProjectDetail | undefined> | void;
}

/**
 * 通用：驱动 /api/frames/(image|html) 的 SSE 流式生成
 */
export function useFrameGeneration({ project, onProjectRefresh }: UseFrameGenerationProps) {
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const setGeneratingFrame = useStudioStore(s => s.setGeneratingFrame);

  const start = useCallback(async (frameIds?: string[]) => {
    setGenerating(true);
    setProgress({ total: 0, current: 0, phase: 'image' });
    setGeneratingFrame(null, null);
    const url = project.type === 'image' ? '/api/frames/image' : '/api/frames/html';
    abortRef.current = new AbortController();

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: project.uuid, frameIds }),
        signal: abortRef.current.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error('启动生成失败');
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const ev of events) {
          const lines = ev.split('\n');
          let event = 'message';
          let data = '';
          for (const line of lines) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data += line.slice(5).trim();
          }
          if (!data) continue;
          try {
            const payload = JSON.parse(data);
            handleEvent(event, payload);
          } catch (e) {
            // ignore
          }
        }
      }

      // 完成后刷新项目
      await onProjectRefresh();
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        console.error('生成失败', e);
        setProgress(p => (p ? { ...p, message: (e as Error).message } : null));
      }
    } finally {
      setGenerating(false);
      setGeneratingFrame(null, null);
      // 保留 progress 几秒以便用户看到完成状态
      setTimeout(() => setProgress(null), 3000);
    }

    function handleEvent(event: string, payload: any) {
      switch (event) {
        case 'start':
          setProgress({ total: payload.total, current: 0, phase: project.type === 'image' ? 'image' : 'html' });
          break;
        case 'progress':
          setGeneratingFrame(payload.frameId || null, payload.phase || 'image');
          setProgress({
            total: payload.total,
            current: payload.current,
            phase: payload.phase || 'image',
            frameId: payload.frameId,
          });
          break;
        case 'frame_done':
          setGeneratingFrame(null, 'done');
          setProgress({
            total: payload.total,
            current: payload.current,
            phase: 'done',
            frameId: payload.frameId,
          });
          // 立即刷新以便分镜卡显示
          onProjectRefresh();
          break;
        case 'frame_error':
          setProgress(p => (p ? { ...p, message: payload.message } : null));
          break;
        case 'skip':
          setGeneratingFrame(null, 'done');
          setProgress({
            total: payload.total,
            current: payload.current,
            phase: 'done',
            frameId: payload.frameId,
          });
          break;
        case 'aborted':
          setGeneratingFrame(null, null);
          setProgress(p => (p ? { ...p, aborted: true, message: payload.reason } : null));
          break;
        case 'done':
          setGeneratingFrame(null, 'done');
          setProgress({
            total: payload.total,
            current: payload.completed,
            phase: 'done',
          });
          break;
      }
    }
  }, [project.type, project.uuid, onProjectRefresh, setGeneratingFrame]);

  const abort = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    setGeneratingFrame(null, null);
    await fetch(
      project.type === 'image' ? '/api/frames/image/abort' : '/api/frames/html/abort',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: project.uuid }),
      },
    );
  }, [project.type, project.uuid, setGeneratingFrame]);

  return { generating, progress, start, abort };
}
