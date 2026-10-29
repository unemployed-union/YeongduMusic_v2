import { createSerialQueue } from '@/services/async/serial-queue';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const KEY = 'yeongdumusic-folder-albums-v1';
const GROUPING_KEY = 'yeongdumusic-album-title-grouping-v1';
type LibraryPreferences = {
  includeFolderAlbums: boolean;
  groupAlbumsByTitle: boolean;
  ready: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
  load: (force?: boolean) => Promise<void>;
  setIncludeFolderAlbums: (include: boolean) => Promise<void>;
  setGroupAlbumsByTitle: (enabled: boolean) => Promise<void>;
};

export const useLibraryPreferences = create<LibraryPreferences>((set, get) => {
  const persistenceQueue = createSerialQueue();
  let loading: Promise<void> | null = null;
  let writes = 0;
  async function save(key: string, value: boolean, next: Partial<Pick<LibraryPreferences, 'includeFolderAlbums' | 'groupAlbumsByTitle'>>) {
    await get().load();
    writes++;
    set({ saving: true });
    const write = persistenceQueue.run(async () => {
      if (Platform.OS === 'web') localStorage.setItem(key, String(value));
      else await SecureStore.setItemAsync(key, String(value));
      set({ ...next, ready: true, error: null });
    });
    try { await write; }
    catch { set({ error: '앨범 표시 설정을 저장하지 못했습니다. 다시 시도해 주세요.' }); }
    finally { writes--; set({ saving: writes > 0 }); }
  }
  return {
    includeFolderAlbums: true,
    groupAlbumsByTitle: false,
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
          const read = (key: string) => Platform.OS === 'web'
            ? typeof localStorage === 'undefined' ? null : localStorage.getItem(key)
            : SecureStore.getItemAsync(key);
          const [value, grouping] = await Promise.all([read(KEY), read(GROUPING_KEY)]);
          set({ includeFolderAlbums: value !== 'false', groupAlbumsByTitle: grouping === 'true', ready: true });
        })
        .catch(() => {
          set({ ready: true, error: '앨범 표시 설정을 불러오지 못했습니다. 다시 불러와 주세요.' });
        })
        .finally(() => {
          loading = null;
          set({ loading: false });
        });
      return loading;
    },
    setIncludeFolderAlbums: include => save(KEY, include, { includeFolderAlbums: include }),
    setGroupAlbumsByTitle: enabled => save(GROUPING_KEY, enabled, { groupAlbumsByTitle: enabled }),
  };
});
