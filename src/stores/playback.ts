import { create } from 'zustand';
import type { Song } from '@/types/music';

export type RepeatMode = 'off' | 'all' | 'one';
type PlaybackState = {
  queue: Song[];
  index: number;
  playing: boolean;
  buffering: boolean;
  position: number;
  duration: number;
  shuffle: boolean;
  repeat: RepeatMode;
  error: string | null;
  setQueue: (queue: Song[], index: number) => void;
  enqueue: (song: Song) => void;
  setStatus: (status: Partial<Pick<PlaybackState, 'playing' | 'buffering' | 'position' | 'duration' | 'error'>>) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  clear: () => void;
};

export const usePlaybackStore = create<PlaybackState>((set) => ({
  queue: [], index: -1, playing: false, buffering: false, position: 0, duration: 0,
  shuffle: false, repeat: 'off', error: null,
  setQueue: (queue, index) => set({ queue, index, position: 0, duration: 0, buffering: true, error: null }),
  enqueue: (song) => set((state) => ({ queue: [...state.queue, song] })),
  setStatus: (status) => set(status),
  toggleShuffle: () => set((state) => ({ shuffle: !state.shuffle })),
  cycleRepeat: () => set((state) => ({ repeat: state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off' })),
  clear: () => set({ queue: [], index: -1, playing: false, buffering: false, position: 0, duration: 0, error: null }),
}));
