import { create } from 'zustand';
import { downloadSong, type DownloadProgress } from '@/services/offline-music/download';
import { deleteLocalSong } from '@/services/local-music/storage';
import { useLocalMusicStore } from './local-music';
import { useAuthStore } from './auth';
import { useS3Store } from './s3';
import { useMyboxStore } from './mybox';
import { useGoogleDriveStore } from './google-drive';
import { reconcilePlaybackVisibility } from '@/services/playback/controller';
import type { Song } from '@/types/music';

type State = {
  busy: boolean; saving: boolean; cancelling: boolean; removing: boolean; title: string; progress: DownloadProgress; error: string | null; message: string | null;
  retrySong: Song | null;
  download: (song: Song) => Promise<void>; remove: (song: Song) => Promise<boolean>;
  cancel: () => void; clearNotice: () => void;
};
let request: AbortController | null = null;
let activeSource: 'nas' | 'drive' | 's3' | 'mybox' | null = null;
export const useOfflineMusicStore = create<State>((set, get) => ({
  busy: false, saving: false, cancelling: false, removing: false, title: '', progress: { written: 0, total: 0 }, error: null, message: null, retrySong: null,
  clearNotice: () => set({ error: null, message: null, retrySong: null }),
  cancel: () => {
    if (!request || !get().busy || get().saving || request.signal.aborted) return;
    set({ cancelling: true, error: null });
    request.abort();
  },
  download: async (song) => {
    if (get().busy || useLocalMusicStore.getState().busy) { set({ error: '다른 음악 저장 작업이 끝난 뒤 다시 시도해 주세요.' }); return; }
    const controller = new AbortController(); request = controller; activeSource = song.source === 'mybox' ? 'mybox' : song.source === 's3' ? 's3' : song.source === 'drive' ? 'drive' : 'nas';
    set({ busy: true, saving: false, cancelling: false, title: song.title, progress: { written: 0, total: 0 }, error: null, message: null, retrySong: song });
    // Keep import/load from publishing an earlier local-library snapshot during the write.
    await useLocalMusicStore.getState().load();
    if (controller.signal.aborted) { request = null; activeSource = null; set({ busy: false, cancelling: false, message: '음악 보관을 취소했습니다.', retrySong: null }); return; }
    if (useLocalMusicStore.getState().busy) { request = null; activeSource = null; set({ busy: false, error: '기기 음악 가져오기가 끝난 뒤 다시 보관해 주세요.' }); return; }
    useLocalMusicStore.setState({ busy: true });
    try {
      const result = await downloadSong(song, controller.signal, progress => set({ progress }), () => set({ saving: true }));
      set({ error: null, message: result.duplicate ? '이미 이 기기에 보관된 음악입니다.' : '음악을 보관했습니다. 보관함의 ‘이 기기 음악’에서 재생하세요.', retrySong: null });
    } catch (error) {
      set(controller.signal.aborted ? { error: null, message: '음악 보관을 취소했습니다.', retrySong: null } : { error: error instanceof Error ? error.message : '음악을 보관하지 못했습니다.' });
    } finally {
      request = null; activeSource = null;
      useLocalMusicStore.setState({ busy: false });
      await useLocalMusicStore.getState().load();
      set({ busy: false, saving: false, cancelling: false });
    }
  },
  remove: async (song) => {
    if (song.source !== 'local') return false;
    if (get().busy || useLocalMusicStore.getState().busy) { set({ error: '다른 음악 저장 작업이 끝난 뒤 다시 시도해 주세요.' }); return false; }
    set({ busy: true, saving: true, removing: true, title: song.title, error: null, message: null, retrySong: null });
    // Finish any in-flight library read before deleting, so it cannot restore a stale row.
    await useLocalMusicStore.getState().load();
    if (useLocalMusicStore.getState().busy) { set({ busy: false, saving: false, removing: false, error: '기기 음악 가져오기가 끝난 뒤 다시 삭제해 주세요.' }); return false; }
    useLocalMusicStore.setState({ busy: true });
    try {
      reconcilePlaybackVisibility(track => track.source === 'local' && track.id === song.id);
      await deleteLocalSong(song.id);
      set({ error: null, message: '기기의 음악 복사본을 삭제했습니다. 원본 음악은 유지됩니다.' });
      return true;
    } catch { set({ error: '음악 복사본을 삭제하지 못했습니다. 목록을 다시 불러온 뒤 재시도해 주세요.' }); return false; }
    finally {
      useLocalMusicStore.setState({ busy: false });
      await useLocalMusicStore.getState().load();
      set({ busy: false, saving: false, removing: false });
    }
  },
}));
useAuthStore.subscribe((state, previous) => { if (activeSource === 'nas' && state.generation !== previous.generation) request?.abort(); });
useGoogleDriveStore.subscribe((state, previous) => { if (activeSource === 'drive' && state.generation !== previous.generation) request?.abort(); });
useS3Store.subscribe((state, previous) => { if (activeSource === 's3' && state.generation !== previous.generation) request?.abort(); });
useMyboxStore.subscribe((state, previous) => { if (activeSource === 'mybox' && state.generation !== previous.generation) request?.abort(); });
