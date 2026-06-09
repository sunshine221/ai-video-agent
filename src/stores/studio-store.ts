import { create } from 'zustand';

interface StudioState {
  selectedFrameId: string | null;
  showSubtitle: boolean;
  isPlaying: boolean;
  generatingFrameId: string | null;
  generationPhase: 'image' | 'html' | 'tts' | 'done' | null;
  setSelectedFrameId: (id: string | null) => void;
  setShowSubtitle: (v: boolean) => void;
  setIsPlaying: (v: boolean) => void;
  setGeneratingFrame: (frameId: string | null, phase?: 'image' | 'html' | 'tts' | 'done' | null) => void;
}

export const useStudioStore = create<StudioState>(set => ({
  selectedFrameId: null,
  showSubtitle: true,
  isPlaying: false,
  generatingFrameId: null,
  generationPhase: null,
  setSelectedFrameId: id => set({ selectedFrameId: id }),
  setShowSubtitle: v => set({ showSubtitle: v }),
  setIsPlaying: v => set({ isPlaying: v }),
  setGeneratingFrame: (frameId, phase = null) => set({ generatingFrameId: frameId, generationPhase: phase }),
}));
