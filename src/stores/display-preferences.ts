import { createSerialQueue } from '@/services/async/serial-queue';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const KEY = 'yeongdumusic-hide-artwork-v1';
type DisplayPreferences = {
  hideArtwork: boolean;
  ready: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
  load: (force?: boolean) => Promise<void>;
  setHideArtwork: (hidden: boolean) => Promise<void>;
};
export const useDisplayPreferences = create<DisplayPreferences>((set, get) => {
  const persistenceQueue = createSerialQueue();
  let loading: Promise<void> | null = null;
  let writes = 0;
  return {
    hideArtwork: false,
    ready: false,
    loading: false,
    saving: false,
    error: null,
    load: (force = false) => {
      if (loading) return loading;
      if (get().ready && !force) return Promise.resolve();
      set({ loading: true, error: null });
      loading = persistenceQueue
        .settled()
        .then(async () => {
          const value =
            Platform.OS === 'web'
              ? typeof localStorage === 'undefined'
                ? null
                : localStorage.getItem(KEY)
              : await SecureStore.getItemAsync(KEY);
          set({ hideArtwork: value === 'true', ready: true });
        })
        .catch(() => {
          set({ ready: true, error: '앨범아트 설정을 불러오지 못했습니다. 다시 불러와 주세요.' });
        })
        .finally(() => {
          loading = null;
          set({ loading: false });
        });
      return loading;
    },
    setHideArtwork: async (hidden) => {
      await get().load();
      writes++;
      set({ saving: true });
      const write = persistenceQueue.run(async () => {
        if (Platform.OS === 'web') localStorage.setItem(KEY, String(hidden));
        else await SecureStore.setItemAsync(KEY, String(hidden));
        set({ hideArtwork: hidden, ready: true, error: null });
      });

      try {
        await write;
      } catch {
        set({ error: '앨범아트 설정을 저장하지 못했습니다. 다시 시도해 주세요.' });
      } finally {
        writes--;
        set({ saving: writes > 0 });
      }
    },
  };
});
