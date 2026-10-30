import { readPreference, writePreference } from '@/services/preferences/storage';
import { createSerialQueue } from '@/services/async/serial-queue';
import { create } from 'zustand';
import { parseFavorites, type FavoriteSongs } from '@/features/favorites/rules';
import { validateMetadataKey } from '@/features/metadata/rules';

const KEY = 'yeongdumusic-favorite-songs-v1';
type State = {
  songs: FavoriteSongs;
  ready: boolean;
  loading: boolean;
  loadError: boolean;
  error: string | null;
  load: (force?: boolean) => Promise<void>;
  setLiked: (key: string, liked: boolean) => Promise<void>;
};

async function write(songs: FavoriteSongs): Promise<void> {
  // Persist identities only; artwork and stream URLs may contain temporary credentials.
  const value = JSON.stringify({ version: 1, songs });
  await writePreference(KEY, value);
}

export const useFavoritesStore = create<State>((set, get) => {
  const persistenceQueue = createSerialQueue();
  let loading: Promise<void> | null = null;
  return {
    songs: {},
    ready: false,
    loading: false,
    loadError: false,
    error: null,
    load: (force = false) => {
      if (loading) {
        return loading;
      }
      if (get().ready && !force) {
        return Promise.resolve();
      }
      set({ loading: true, error: null });
      const operation = persistenceQueue.run(async () => {
        const songs = parseFavorites(await readPreference(KEY));
        set({ songs, ready: true, loadError: false });
      });

      loading = operation
        .catch(() =>
          set({
            ready: true,
            loadError: true,
            error: '좋아요한 곡을 불러오지 못했습니다. 다시 시도해 주세요.',
          }),
        )
        .finally(() => {
          loading = null;
          set({ loading: false });
        });
      return loading;
    },
    setLiked: async (key, liked) => {
      validateMetadataKey(key);
      await get().load();
      if (get().loadError) {
        throw new Error(get().error ?? '좋아요한 곡을 먼저 다시 불러와 주세요.');
      }
      const operation = persistenceQueue.run(async () => {
        if (get().loadError) {
          throw new Error('좋아요한 곡을 먼저 다시 불러와 주세요.');
        }
        const songs = { ...get().songs };
        if (liked === (songs[key] !== undefined)) {
          return;
        }
        if (liked) {
          songs[key] = Date.now();
        } else {
          delete songs[key];
        }
        if (Object.keys(songs).length > 10000) {
          throw new Error('좋아요는 최대 10,000곡까지 저장할 수 있습니다.');
        }
        await write(songs);
        set({ songs, error: null });
      });

      try {
        await operation;
      } catch (cause) {
        const error =
          cause instanceof Error
            ? cause.message
            : '좋아요를 저장하지 못했습니다. 다시 시도해 주세요.';
        set({ error });
        throw new Error(error);
      }
    },
  };
});
