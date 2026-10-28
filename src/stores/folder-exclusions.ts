import { createSerialQueue } from '@/services/async/serial-queue';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { localFolderKey } from '@/services/local-music/folders';

const KEY = 'yeongdumusic-local-excluded-folders-v1';
type FolderExclusions = {
  folders: string[];
  ready: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
  load: (force?: boolean) => Promise<void>;
  setFolders: (folders: string[]) => Promise<void>;
};
function validate(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 200 ||
    value.some((folder) => typeof folder !== 'string' || !folder.trim() || folder.length > 4096)
  )
    throw new Error('제외 폴더 설정 형식이 올바르지 않습니다.');
  return [...new Set((value as string[]).map(localFolderKey))];
}
export const useFolderExclusionStore = create<FolderExclusions>((set, get) => {
  const persistenceQueue = createSerialQueue();
  let loading: Promise<void> | null = null;
  let writes = 0;
  return {
    folders: [],
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
          const raw =
            Platform.OS === 'web'
              ? typeof localStorage === 'undefined'
                ? null
                : localStorage.getItem(KEY)
              : await SecureStore.getItemAsync(KEY);
          set({ folders: raw === null ? [] : validate(JSON.parse(raw)), ready: true });
        })
        .catch(() => {
          set({ error: '제외 폴더 설정을 불러오지 못했습니다. 설정에서 다시 불러와 주세요.' });
        })
        .finally(() => {
          loading = null;
          set({ loading: false });
        });
      return loading;
    },
    setFolders: async (folders) => {
      const next = validate(folders);
      await get().load();
      if (!get().ready) throw new Error(get().error ?? '제외 폴더 설정을 먼저 불러와 주세요.');
      writes++;
      set({ saving: true });
      const write = persistenceQueue.run(async () => {
        const value = JSON.stringify(next);
        if (Platform.OS === 'web') localStorage.setItem(KEY, value);
        else await SecureStore.setItemAsync(KEY, value);
        set({ folders: next, error: null });
      });

      try {
        await write;
      } catch {
        set({ error: '제외 폴더 설정을 저장하지 못했습니다. 다시 시도해 주세요.' });
        throw new Error('제외 폴더 설정을 저장하지 못했습니다.');
      } finally {
        writes--;
        set({ saving: writes > 0 });
      }
    },
  };
});
