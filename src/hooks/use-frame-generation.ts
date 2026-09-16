'use client';

import { useState, useRef, useCallback } from 'react';
import { useStudioStore } from '@/stores/studio-store';
import type { ProjectDetail } from '@/types';

export interface GenerationProgress {
  total: number;
  current: number;
  phase: 'image' | 'html' | 'tts' | 'review' | 'done';
  frameId?: string;
  message?: string;
  aborted?: boolean;
  /** 终检修复中的说明文案 */
  reviewNote?: string;
  /** 终检后仍未解决的问题（优雅降级，如实告知用户） */
  unresolved?: Array<{ frameId: string; issue: string }>;
}

/** 活动流日志级别，决定前端展示的图标/颜色 */
export type ActivityLevel = 'thinking' | 'working' | 'success' | 'warn' | 'error';

/** 一条活动流记录：让用户实时看到 AI 在思考/生成/处理什么 */
export interface ActivityLog {
  id: string;
  time: number;
  level: ActivityLevel;
  text: string;
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
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const setGeneratingFrame = useStudioStore(s => s.setGeneratingFrame);

  // frameId → "#index 标题"，让日志读起来像人话而不是一串 uuid
  const frameLabel = useCallback(
    (frameId?: string) => {
      if (!frameId) return '';
      const f = project.outline?.frames.find(fr => fr.id === frameId);
      return f ? `#${f.index}《${f.title}》` : '该分镜';
    },
    [project.outline],
  );

  const start = useCallback(async (frameIds?: string[], regen?: boolean) => {
    setGenerating(true);
    setProgress({ total: 0, current: 0, phase: 'image' });
    setLogs([]);
    setGeneratingFrame(null, null);
    const url = project.type === 'image' ? '/api/frames/image' : '/api/frames/html';
    abortRef.current = new AbortController();

    let logSeq = 0;
    const pushLog = (level: ActivityLevel, text: string) => {
      setLogs(prev => [...prev, { id: `log-${Date.now()}-${logSeq++}`, time: Date.now(), level, text }]);
    };

    pushLog('thinking', regen ? '收到重新生成指令，正在准备…' : '收到生成指令，正在准备…');

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: project.uuid, frameIds, regen }),
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
        pushLog('error', `生成出错：${(e as Error).message}`);
        setProgress(p => (p ? { ...p, message: (e as Error).message } : null));
      }
    } finally {
      setGenerating(false);
      setGeneratingFrame(null, null);
      // 保留 progress 几秒以便用户看到完成状态
      setTimeout(() => setProgress(null), 3000);
    }

    // 去重：progress 事件对同一帧同一阶段会重复触发，只在阶段切换时打日志
    let lastPhaseKey = '';

    function handleEvent(event: string, payload: any) {
      switch (event) {
        case 'start':
          setProgress({ total: payload.total, current: 0, phase: project.type === 'image' ? 'image' : 'html' });
          pushLog('thinking', `已拆解脚本，共 ${payload.total} 个分镜待生成，开始逐镜制作…`);
          break;
        case 'progress': {
          const phase = payload.phase || 'image';
          setGeneratingFrame(payload.frameId || null, phase);
          setProgress({
            total: payload.total,
            current: payload.current,
            phase,
            frameId: payload.frameId,
          });
          const key = `${payload.frameId}:${phase}`;
          if (key !== lastPhaseKey) {
            lastPhaseKey = key;
            const label = frameLabel(payload.frameId);
            if (phase === 'tts') pushLog('working', `正在为 ${label} 合成旁白配音…`);
            else if (phase === 'html') pushLog('working', `正在为 ${label} 设计 HTML 动画画面…`);
            else if (phase === 'image') pushLog('working', `正在为 ${label} 生成画面…`);
          }
          break;
        }
        case 'frame_done':
          setGeneratingFrame(null, 'done');
          setProgress({
            total: payload.total,
            current: payload.current,
            phase: 'done',
            frameId: payload.frameId,
          });
          pushLog(
            'success',
            `${frameLabel(payload.frameId)} 已完成${payload.repaired ? '（补齐）' : ''}（${payload.current}/${payload.total}）`,
          );
          // 立即刷新以便分镜卡显示
          onProjectRefresh();
          break;
        case 'frame_error':
          pushLog('error', `${frameLabel(payload.frameId)} 生成失败：${payload.message || '未知错误'}`);
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
          pushLog('success', `${frameLabel(payload.frameId)} 已有产物，跳过（${payload.current}/${payload.total}）`);
          break;
        case 'repair':
          pushLog('warn', `第 ${payload.round} 轮补齐：还有 ${payload.missing} 个分镜未完成，重试中…`);
          break;
        case 'aborted':
          setGeneratingFrame(null, null);
          pushLog('warn', `已中断：${payload.reason || '用户中断'}`);
          setProgress(p => (p ? { ...p, aborted: true, message: payload.reason } : null));
          break;
        case 'review_start':
          setGeneratingFrame(null, null);
          pushLog('thinking', '所有分镜生成完毕，开始全片终检（内容/风格/排版一致性）…');
          setProgress(p => ({
            total: payload.total ?? p?.total ?? 0,
            current: p?.current ?? 0,
            phase: 'review',
            reviewNote: '正在终检全片...',
          }));
          break;
        case 'review_round':
          pushLog('warn', `第 ${payload.round} 轮终检：发现 ${payload.issues} 处问题，自动修复中…`);
          setProgress(p => (p ? { ...p, phase: 'review', reviewNote: `第 ${payload.round} 轮检查，发现 ${payload.issues} 处问题，修复中...` } : null));
          break;
        case 'review_issue':
          setGeneratingFrame(payload.frameId || null, 'html');
          pushLog('working', `修复 ${frameLabel(payload.frameId)}：${payload.issue || payload.category}`);
          setProgress(p => (p ? { ...p, phase: 'review', frameId: payload.frameId, reviewNote: `修复中：${payload.issue || payload.category}` } : null));
          break;
        case 'review_fixed':
          setGeneratingFrame(null, 'done');
          pushLog('success', `${frameLabel(payload.frameId)} 已修复`);
          onProjectRefresh();
          break;
        case 'review_done':
          if (payload.unresolved?.length) {
            pushLog('warn', `终检完成，${payload.unresolved.length} 处仍需留意（已保留当前最佳版本）`);
          } else {
            pushLog('success', '终检完成，全片通过检查');
          }
          setProgress(p => (p ? { ...p, phase: 'review', reviewNote: undefined, unresolved: payload.unresolved || [] } : null));
          break;
        case 'done':
          setGeneratingFrame(null, 'done');
          pushLog('success', `🎬 制作完成：成功生成 ${payload.completed}/${payload.total} 个分镜`);
          setProgress(p => ({
            total: payload.total,
            current: payload.completed,
            phase: 'done',
            unresolved: p?.unresolved,
          }));
          break;
      }
    }
  }, [project.type, project.uuid, onProjectRefresh, setGeneratingFrame, frameLabel]);

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

  return { generating, progress, logs, start, abort };
}
