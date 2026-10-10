import { create } from 'zustand';
import { requireOptionalNativeModule } from 'expo';
import type { ImageColorsResult } from 'react-native-image-colors';
import type { Song } from '@/types/music';
import { createArtworkGradient, DEFAULT_PLAYER_COLORS, EXTRACTION_FALLBACK, gradientFromImageColors, type GradientColors } from '@/features/playback/artwork-colors';

type ImageColorsModule = {
  getColors: (uri: string, config: { fallback: string; quality: 'low'; pixelSpacing: number }) => Promise<ImageColorsResult>;
};
type BackgroundState = {
  colors: GradientColors;
  artworkKey: string | null;
  selectArtwork: (song: Song) => void;
  reset: () => void;
};

// Memory only, shared across player mounts. URLs may contain a NAS session token.
const cache = new Map<string, GradientColors>();
const pending = new Map<string, Promise<GradientColors>>();
let selection = 0;
let epoch = 0;
let delay: ReturnType<typeof setTimeout> | undefined;

function extractColors(uri: string, fallback: GradientColors): Promise<GradientColors> {
  const existing = pending.get(uri);
  if (existing) return existing;
  const requestEpoch = epoch;
  const request = new Promise<GradientColors>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Artwork color extraction timed out')), 8000);
    void Promise.resolve().then(async () => {
      const module = requireOptionalNativeModule<ImageColorsModule>('ImageColors');
      if (!module) return fallback;
      const result = await module.getColors(uri, { fallback: EXTRACTION_FALLBACK, quality: 'low', pixelSpacing: 10 });
      return gradientFromImageColors(result);
    }).then(resolve, reject).finally(() => clearTimeout(timeout));
  });
  pending.set(uri, request);
  // Download completion belongs to the playback session, even if the screen is closed.
  void request.then((colors) => {
    if (epoch !== requestEpoch) return;
    if (cache.size >= 24) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
    cache.set(uri, colors);
  }, () => {}).finally(() => {
    if (pending.get(uri) === request) pending.delete(uri);
  });
  return request;
}

export const usePlayerBackgroundStore = create<BackgroundState>((set, get) => ({
  colors: DEFAULT_PLAYER_COLORS,
  artworkKey: null,
  selectArtwork: (song) => {
    const uri = song.artworkUrl;
    const fallback = song.palette ? createArtworkGradient(song.palette[0], song.palette[1]) : DEFAULT_PLAYER_COLORS;
    const key = uri ?? JSON.stringify([song.id, song.palette ?? null]);
    if (get().artworkKey === key) return;
    const selected = ++selection;
    clearTimeout(delay);
    const cached = uri ? cache.get(uri) : fallback;
    // Do not flash a default color while waiting for the next album's palette.
    set(cached ? { artworkKey: key, colors: cached } : { artworkKey: key });
    if (cached || !uri) return;
    delay = setTimeout(() => {
      void extractColors(uri, fallback).then((colors) => {
        if (selection === selected && get().artworkKey === key) set({ colors });
      }, () => {
        if (selection === selected && get().artworkKey === key) set({ colors: fallback });
      });
    }, 120);
  },
  reset: () => {
    selection++;
    epoch++;
    clearTimeout(delay);
    delay = undefined;
    cache.clear();
    pending.clear();
    set({ artworkKey: null, colors: DEFAULT_PLAYER_COLORS });
  },
}));
