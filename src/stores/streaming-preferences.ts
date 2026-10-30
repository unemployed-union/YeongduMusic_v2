import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import type { StreamingQuality } from '@/types/music';

// Separate from authentication storage; persist only the quality name.
const STORAGE_KEY = 'yeongdumusic-streaming-quality-v1';
type StreamingPreferences = {
  quality: StreamingQuality;
  ready: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
  load: (force?: boolean) => Promise<void>;
  setQuality: (quality: StreamingQuality) => Promise<void>;
};
async function readQuality(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
  }
  return SecureStore.getItemAsync(STORAGE_KEY);
}
async function writeQuality(quality: StreamingQuality): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(STORAGE_KEY, quality);
    return;
  }
  await SecureStore.setItemAsync(STORAGE_KEY, quality);
}
export const useStreamingPreferences = create<StreamingPreferences>((set, get) => {
  let loading: Promise<void> | null = null;
  let writeTail: Promise<void> = Promise.resolve();
  let pendingWrites = 0;
  return {
    quality: 'original',
    ready: false,
    loading: false,
    saving: false,
    error: null,
    load: (force = false) => {
      if (loading) {
        return loading;
      }
      if (get().ready && !get().error && !force) {
        return Promise.resolve();
      }
      set({ loading: true, error: null });
      loading = writeTail
        .then(readQuality)
        .then((value) => {
          set({ quality: value === 'mp3' ? 'mp3' : 'original', ready: true });
        })
        .catch(() => {
          // Preference storage failure must not prevent original-quality playback.
          set({
            quality: 'original',
            ready: true,
            error: '음질 설정을 불러오지 못했습니다. 원본 음질로 재생합니다.',
          });
        })
        .finally(() => {
          loading = null;
          set({ loading: false });
        });
      return loading;
    },
    setQuality: async (quality) => {
      if (quality !== 'original' && quality !== 'mp3') {
        throw new Error('지원하지 않는 음질 옵션입니다.');
      }
      await get().load();
      pendingWrites++;
      set({ saving: true });
      const write = writeTail.then(async () => {
        await writeQuality(quality);
        set({ quality, ready: true, error: null });
      });
      writeTail = write.catch(() => {});
      try {
        await write;
      } catch {
        set({ error: '음질 설정을 저장하지 못했습니다. 다시 시도해 주세요.' });
        throw new Error('음질 설정을 저장하지 못했습니다.');
      } finally {
        pendingWrites--;
        set({ saving: pendingWrites > 0 });
      }
    },
  };
});
