'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
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
  /** 按全局时间（秒）定位到任意帧内任意位置；opts.play 为 true 则从该点继续播放 */
  seekToGlobalTime: (globalT: number, opts?: { play?: boolean }) => void;
  /** 每个分镜的时长（秒），按大纲顺序 */
  frameDurations: number[];
  /** 全部分镜总时长（秒） */
  totalDuration: number;
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
  // ⭐ seek 到帧内偏移（秒）：切帧后音频/定时器从这个偏移起播，而非固定从 0
  const seekOffsetRef = useRef(0);

  // 无音频时 currentTime 定时器的推进步长（秒）
  const TICK_INTERVAL = 0.1;

  // ⭐ 每个分镜时长（秒）：有音频用真实 audioDuration，否则按旁白字数估算
  const frameDurations = useMemo(() => {
    const frames = project.outline?.frames ?? [];
    return frames.map((f, i) => {
      const fs = project.videoSource?.frames[i];
      return fs?.audioDuration ?? estimateFrameDuration(f.narration);
    });
  }, [project.outline, project.videoSource]);

  const totalDuration = useMemo(
    () => frameDurations.reduce((sum, d) => sum + d, 0),
    [frameDurations],
  );

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

  // ⭐ 播放时用 rAF（60fps）读 audio.currentTime 驱动 currentTime，
  // 让 WAAPI 动画随 timeMs 丝滑推进（timeupdate 仅 ~4/s 会卡顿）。
  useEffect(() => {
    if (!isPlaying) return;
    const audio = audioRef.current;
    if (!audio) return; // 无音频帧由定时器分支自行推进 currentTime
    let raf = 0;
    const tick = () => {
      if (!audio.paused) setCurrentTime(audio.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, currentIndex]);

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
      // ⭐ 从 seek 偏移起播（拖动时间轴后继续播放），用完即清零
      let elapsed = Math.max(0, Math.min(seekOffsetRef.current, duration));
      seekOffsetRef.current = 0;
      setCurrentTime(elapsed);
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
      // ⭐ 从 seek 偏移起播（拖动时间轴后继续播放），用完即清零
      const offset = Math.max(0, seekOffsetRef.current);
      seekOffsetRef.current = 0;
      try {
        audio.currentTime = offset;
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

  // ⭐ 按全局时间定位到"任意帧内任意位置"（时间轴红线拖动的核心）
  const seekToGlobalTime = useCallback(
    (globalT: number, opts?: { play?: boolean }) => {
      const outline = project.outline;
      if (!outline || outline.frames.length === 0) return;
      const clamped = Math.max(0, Math.min(globalT, totalDuration));
      // 累加各帧时长，定位落在哪一帧、帧内偏移多少
      let acc = 0;
      let idx = 0;
      let offset = 0;
      for (let i = 0; i < frameDurations.length; i++) {
        const d = frameDurations[i];
        if (clamped < acc + d || i === frameDurations.length - 1) {
          idx = i;
          offset = Math.max(0, Math.min(clamped - acc, d));
          break;
        }
        acc += d;
      }

      // 记录帧内偏移，供切帧后的播放分支从此处起播
      seekOffsetRef.current = offset;
      setCurrentIndex(idx);
      setSelectedFrameId(outline.frames[idx].id);
      setCurrentTime(offset);

      const a = audioRef.current;
      if (opts?.play) {
        setIsPlaying(true);
        // 播放态下由自动播放 effect 依据 seekOffsetRef 起播，这里无需手动 seek 音频
      } else {
        // 暂停态：定位画面（currentTime 已更新→驱动 iframe 定格），并把音频对齐到偏移
        setIsPlaying(false);
        if (a) {
          const applyAudioOffset = () => {
            try { a.currentTime = offset; } catch {}
          };
          if (a.readyState >= 1 /* HAVE_METADATA */) applyAudioOffset();
          else {
            const once = () => { a.removeEventListener('loadedmetadata', once); applyAudioOffset(); };
            a.addEventListener('loadedmetadata', once);
          }
          a.pause();
        }
      }
    },
    [project.outline, frameDurations, totalDuration, setSelectedFrameId],
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
    seekToGlobalTime,
    frameDurations,
    totalDuration,
  };
}
