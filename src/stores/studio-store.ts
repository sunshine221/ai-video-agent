import { create } from 'zustand';

interface StudioState {
  selectedFrameId: string | null;
  showSubtitle: boolean;
  isPlaying: boolean;
  setSelectedFrameId: (id: string | null) => void;
  setShowSubtitle: (v: boolean) => void;
  setIsPlaying: (v: boolean) => void;
}

export const useStudioStore = create<StudioState>(set => ({
  selectedFrameId: null,
  showSubtitle: true,
  isPlaying: false,
  setSelectedFrameId: id => set({ selectedFrameId: id }),
  setShowSubtitle: v => set({ showSubtitle: v }),
  setIsPlaying: v => set({ isPlaying: v }),
}));
