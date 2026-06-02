'use client';

import { useEffect, useState } from 'react';
import type { SubtitleCue } from '@/lib/subtitle';

interface SubtitleLayerProps {
  cues: SubtitleCue[];
  currentTime: number;
}

export function SubtitleLayer({ cues, currentTime }: SubtitleLayerProps) {
  const [activeText, setActiveText] = useState<string>('');

  useEffect(() => {
    const cue = cues.find(c => currentTime >= c.startTime && currentTime < c.endTime);
    setActiveText(cue?.text ?? '');
  }, [cues, currentTime]);

  if (!activeText) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-12 flex justify-center px-8">
      <p
        className="subtitle-shadow max-w-3xl text-center text-2xl font-semibold leading-snug text-white"
        style={{ letterSpacing: '0.02em' }}
      >
        {activeText}
      </p>
    </div>
  );
}
