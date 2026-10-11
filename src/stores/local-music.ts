import { create } from 'zustand';
import { importLocalSongs, readLocalSongs, saveLocalDuration, type ImportKind } from '@/services/local-music/storage';
import type { MusicSourceFilter, Song } from '@/types/music';

type LocalState = {
  songs: Song[]; ready: boolean; busy: boolean; error: string | null; message: string | null;
  source: MusicSourceFilter;
  setSource: (source: MusicSourceFilter) => void;
  load: () => Promise<void>;
  importFiles: (kind?: ImportKind) => Promise<void>; processed: number;
  recordDuration: (id: string, duration: number) => Promise<void>;
};
let loading: Promise<void> | null = null;
export const useLocalMusicStore = create<LocalState>((set, get) => ({
  songs: [], ready: false, busy: false, error: null, message: null, source: 'all', processed: 0,
  setSource: (source) => set({ source }),
  load: () => {
    if (loading) return loading;
    if (get().busy) return Promise.resolve();
    loading = readLocalSongs().then((songs) => { set({ songs, ready: true, error: null }); }).catch((error: unknown) => {
      set({ ready: true, error: error instanceof Error ? error.message : '로컬 음악 목록을 읽지 못했습니다.' });
    }).finally(() => { loading = null; });
    return loading;
  },
  importFiles: async (kind = 'files') => {
    if (get().busy) return;
    set({ busy: true, error: null, message: null, processed: 0 });
    try {
      if (loading) await loading;
      const result = await importLocalSongs(kind, (processed) => set({ processed }));
      if (!result.cancelled) {
        const songs = await readLocalSongs();
        set({ songs, ready: true, source: 'local', message: result.added + '곡 가져옴 · 중복 ' + result.duplicates + '곡 건너뜀', error: result.failures.length ? result.failures.join('\n') : null });
      }
    } catch (error) { set({ error: error instanceof Error ? error.message : '음악을 가져오지 못했습니다.' }); }
    finally { set({ busy: false }); }
  },
  recordDuration: async (id, duration) => {
    const song = get().songs.find((item) => item.id === id);
    if (!song || !Number.isFinite(duration) || duration <= 0 || Math.abs(song.duration - duration) <= 0.5) return;
    try {
      await saveLocalDuration(id, duration);
      set((state) => ({ songs: state.songs.map((item) => item.id === id ? { ...item, duration } : item) }));
    } catch { set({ error: '곡 길이를 저장하지 못했습니다. 로컬 목록을 다시 불러와 주세요.' }); }
  },
}));
