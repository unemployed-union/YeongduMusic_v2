import { create } from 'zustand';
import type { Song } from '@/types/music';

export type RepeatMode = 'off' | 'all' | 'one';
export type SleepTimerStopMode = 'immediate' | 'track-end';
export type SleepTimer =
  | { mode: 'time'; endsAt: number; minutes: number; stopMode?: SleepTimerStopMode }
  | { mode: 'track'; songId: string; afterDeadline?: boolean };
export type SectionRepeat = { songId: string; start: number; end: number | null; enabled: boolean };
type PlaybackState = {
  queue: Song[];
  index: number;
  playing: boolean;
  buffering: boolean;
  position: number;
  duration: number;
  lossless: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  playbackRate: number;
  setPlaybackRate: (playbackRate: number) => void;
  preservePitch: boolean;
  setPreservePitch: (preservePitch: boolean) => void;
  error: string | null;
  sleepTimer: SleepTimer | null;
  sectionRepeat: SectionRepeat | null;
  setSectionRepeat: (sectionRepeat: SectionRepeat | null) => void;
  setSleepTimer: (timer: SleepTimer | null) => void;
  setQueue: (queue: Song[], index: number) => void;
  enqueue: (song: Song) => void;
  setStatus: (
    status: Partial<
      Pick<PlaybackState, 'playing' | 'buffering' | 'position' | 'duration' | 'error' | 'lossless'>
    >,
  ) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  clear: () => void;
};

export const usePlaybackStore = create<PlaybackState>((set) => ({
  queue: [],
  index: -1,
  playing: false,
  buffering: false,
  position: 0,
  duration: 0,
  lossless: false,
  shuffle: false,
  repeat: 'off',
  error: null,
  sleepTimer: null,
  sectionRepeat: null,
  playbackRate: 1,
  setPlaybackRate: (playbackRate) => set({ playbackRate }),
  preservePitch: true,
  setPreservePitch: (preservePitch) => set({ preservePitch }),
  setSectionRepeat: (sectionRepeat) => set({ sectionRepeat }),
  setSleepTimer: (sleepTimer) => set({ sleepTimer }),
  setQueue: (queue, index) =>
    set({
      queue,
      index,
      position: 0,
      duration: 0,
      lossless: false,
      buffering: true,
      error: null,
      sectionRepeat: null,
    }),
  enqueue: (song) => set((state) => ({ queue: [...state.queue, song] })),
  setStatus: (status) => set(status),
  toggleShuffle: () => set((state) => ({ shuffle: !state.shuffle })),
  cycleRepeat: () =>
    set((state) => {
      let repeat: 'off' | 'all' | 'one';
      if (state.repeat === 'off') {
        repeat = 'all';
      } else if (state.repeat === 'all') {
        repeat = 'one';
      } else {
        repeat = 'off';
      }
      return {
        repeat: repeat,
      };
    }),
  clear: () =>
    set({
      queue: [],
      index: -1,
      playing: false,
      buffering: false,
      position: 0,
      duration: 0,
      lossless: false,
      error: null,
      sleepTimer: null,
      sectionRepeat: null,
    }),
}));
