'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useStudioStore } from '@/stores/studio-store';
import { estimateFrameDuration } from '@/lib/subtitle';
import type { ProjectDetail } from '@/types';

interface UsePlayerResult {
  isPlaying: boolean;
  currentTime: number;
  currentIndex: number;
  audioRef: React.RefObject<HTMLAudioElement>;
  togglePlay: () => void;
  play: () => void;
  stop: () => void;
  pause: () => void;
  seekToFrame: (frameId: string) => void;
  playFromIndex: (index: number) => void;
}

/**
 * 全屏播放 Hook（**单实例** — 整个 Studio 只调一次）。
 *
 * 关键设计：
 * 1. audio 元素保持稳定挂载，不使用 key 重建
 * 2. isPlaying 由我们自己的 play/pause/stop 函数控制 — 不监听 audio 的 play/pause 事件
 *    （因为 audio.src 变化时浏览器会自动派发 pause 事件，会误判为用户暂停）
 * 3. 监听 `ended` 事件自动推进
 * 4. 监听 `canplay` 事件确保新 src 加载好再 play
 */
export function usePlayer(project: ProjectDetail, initialIndex: number): UsePlayerResult {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(Math.max(0, initialIndex));
  const [currentTime, setCurrentTime] = useState(0);
  const setSelectedFrameId = useStudioStore(s => s.setSelectedFrameId);
  const setIsPlayingStore = useStudioStore(s => s.setIsPlaying);
  const initRef = useRef(false);

  // 无音频时 currentTime 定时器的推进步长（秒）
  const TICK_INTERVAL = 0.1;

  // 推进到下一帧（音频 ended 与无音频定时器共用）
  const advanceToNext = useCallback(() => {
    setCurrentIndex(prev => {
      const outline = project.outline;
      if (!outline) return prev;
      if (prev + 1 < outline.frames.length) {
        const nextIdx = prev + 1;
        setSelectedFrameId(outline.frames[nextIdx].id);
        return nextIdx;
      }
      // 全部播完
      setIsPlaying(false);
      return prev;
    });
  }, [project.outline, setSelectedFrameId]);

  // 同步 store
  useEffect(() => {
    setIsPlayingStore(isPlaying);
  }, [isPlaying, setIsPlayingStore]);

  // 跟随外部 selected index 变化（仅非播放态下）
  useEffect(() => {
    if (initRef.current === false) {
      initRef.current = true;
      return;
    }
    if (!isPlaying) {
      const next = Math.max(0, initialIndex);
      if (next !== currentIndex) {
        setCurrentIndex(next);
        setCurrentTime(0);
        const a = audioRef.current;
        if (a) {
          a.pause();
          a.currentTime = 0;
        }
      }
    }
  }, [initialIndex, isPlaying, currentIndex]);

  // 监听 audio 事件：timeupdate（驱动 currentTime）+ ended（自动推进）
  // ⭐ 关键：不监听 'play'/'pause' 事件，避免 src 变化时被误判
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);

    const onEnded = () => {
      // 自动推进到下一帧
      advanceToNext();
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
    };
  }, [advanceToNext]);

  // ⭐ 核心：自动播放新帧
  // 依赖 currentIndex + isPlaying
  useEffect(() => {
    if (!isPlaying) return;

    const frameSource = project.videoSource?.frames[currentIndex];
    const hasAudio = Boolean(frameSource?.audioPath) && Boolean(audioRef.current);

    // 无音频：用定时器推进 currentTime，让字幕正常轮转；到时长后推进下一帧
    if (!hasAudio) {
      const narration = project.outline?.frames[currentIndex]?.narration;
      const duration = frameSource?.audioDuration ?? estimateFrameDuration(narration);
      setCurrentTime(0);
      let elapsed = 0;
      const interval = setInterval(() => {
        elapsed += TICK_INTERVAL;
        if (elapsed >= duration) {
          clearInterval(interval);
          advanceToNext();
          return;
        }
        setCurrentTime(elapsed);
      }, TICK_INTERVAL * 1000);
      return () => clearInterval(interval);
    }

    const audio = audioRef.current;
    if (!audio) return;

    let cancelled = false;
    let onCanPlay: (() => void) | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    const playNow = () => {
      if (cancelled) return;
      try {
        audio.currentTime = 0;
      } catch {
        // readyState 不够时设置 currentTime 会抛错，忽略
      }
      const p = audio.play();
      if (p && typeof p.catch === 'function') {
        p.catch(err => {
          if (cancelled) return;
          console.warn('[player] play() rejected:', err?.message || err);
          // 800ms 后重试一次
          fallbackTimer = setTimeout(() => {
            if (cancelled || !isPlaying) return;
            audio.play().catch(() => {
              if (!cancelled) setIsPlaying(false);
            });
          }, 800);
        });
      }
    };

    if (audio.readyState >= 3 /* HAVE_FUTURE_DATA */) {
      playNow();
    } else {
      onCanPlay = () => {
        if (cancelled) return;
        if (onCanPlay) audio.removeEventListener('canplay', onCanPlay);
        onCanPlay = null;
        playNow();
      };
      audio.addEventListener('canplay', onCanPlay);
    }

    return () => {
      cancelled = true;
      if (onCanPlay) {
        audio.removeEventListener('canplay', onCanPlay);
      }
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
      }
    };
  }, [currentIndex, isPlaying, project.videoSource, project.outline, advanceToNext]);

  function play() {
    if (!project.outline || project.outline.frames.length === 0) return;
    if (isPlaying) return;
    const outline = project.outline;
    if (currentIndex >= outline.frames.length) {
      setCurrentIndex(0);
    }
    setIsPlaying(true);
    setSelectedFrameId(outline.frames[Math.max(0, currentIndex)].id);
  }

  function pause() {
    setIsPlaying(false);
    audioRef.current?.pause();
  }

  function stop() {
    setIsPlaying(false);
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
    }
    const next = Math.max(0, initialIndex);
    setCurrentIndex(next);
    setCurrentTime(0);
    setSelectedFrameId(project.outline?.frames[next]?.id ?? null);
  }

  const seekToFrame = useCallback(
    (frameId: string) => {
      const idx = project.outline?.frames.findIndex(f => f.id === frameId);
      if (idx === undefined || idx < 0) return;
      const a = audioRef.current;
      if (a) {
        a.pause();
        a.currentTime = 0;
      }
      setCurrentIndex(idx);
      setCurrentTime(0);
      setSelectedFrameId(frameId);
    },
    [project.outline, setSelectedFrameId],
  );

  const playFromIndex = useCallback(
    (index: number) => {
      const outline = project.outline;
      if (!outline || outline.frames.length === 0) return;
      const nextIndex = Math.max(0, Math.min(index, outline.frames.length - 1));
      const a = audioRef.current;
      if (a) {
        a.pause();
        a.currentTime = 0;
      }
      setCurrentIndex(nextIndex);
      setCurrentTime(0);
      setSelectedFrameId(outline.frames[nextIndex].id);
      setIsPlaying(true);
    },
    [project.outline, setSelectedFrameId],
  );

  return {
    isPlaying,
    currentTime,
    currentIndex,
    audioRef,
    togglePlay: () => (isPlaying ? pause() : play()),
    play,
    stop,
    pause,
    seekToFrame,
    playFromIndex,
  };
}
