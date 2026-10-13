import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { loadS3Songs, prepareS3Connection, publicS3Connection, signedS3Url, S3RequestError, type S3Input, type S3Connection, type S3PublicConnection } from '@/services/s3/api';
import type { Song } from '@/types/music';

const KEY = 'yeongdu-s3-connection-v1';
type State = {
  ready: boolean; busy: boolean; loading: boolean; connection: S3PublicConnection | null; songs: Song[]; error: string | null; scanned: number; generation: number;
  bootstrap: () => Promise<void>; connect: (input: S3Input) => Promise<void>; disconnect: () => Promise<void>;
  refresh: () => Promise<void>; cancel: () => void;
  source: (song: Song) => Promise<{ uri: string }>;
};
export const useS3Store = create<State>((set, get) => {
  let credentials: S3Connection | null = null, request: AbortController | null = null;
  let storageTail: Promise<unknown> = Promise.resolve();
  const exclusive = <T,>(job: () => Promise<T>): Promise<T> => { const result = storageTail.then(job); storageTail = result.catch(() => {}); return result; };
  const current = (generation: number) => get().generation === generation;
  const supported = () => { if (Platform.OS === 'web') throw new S3RequestError('S3 연결은 Android·iOS 앱에서 사용할 수 있습니다.'); };
  function begin() {
    request?.abort(); request = new AbortController(); credentials = null;
    const generation = get().generation + 1;
    set({ generation, ready: true, busy: true, loading: false, scanned: 0, connection: null, songs: [], error: null });
    return { generation, signal: request.signal };
  }
  const message = (error: unknown) => error instanceof S3RequestError ? error.message : 'S3 연결 정보를 저장하거나 읽지 못했습니다. 다시 시도해 주세요.';
  return {
    ready: false, busy: false, loading: false, connection: null, songs: [], error: null, scanned: 0, generation: 0,
    bootstrap: async () => {
      if (get().ready || get().busy) return;
      const generation = get().generation; set({ busy: true });
      try {
        if (Platform.OS === 'web') return;
        const saved = await exclusive(() => SecureStore.getItemAsync(KEY));
        if (!current(generation) || !saved) return;
        const input = JSON.parse(saved) as S3Input;
        const connection = await prepareS3Connection(input);
        if (!current(generation)) return;
        credentials = connection; set({ connection: publicS3Connection(connection) });
      } catch (error) { if (current(generation)) set({ error: message(error) }); }
      finally { if (current(generation)) set({ ready: true, busy: false }); }
      if (current(generation) && get().connection) await get().refresh().catch(() => {});
    },
    connect: async input => {
      const { generation, signal } = begin();
      try {
        supported();
        const connection = await prepareS3Connection(input);
        if (!current(generation)) return;
        const songs = await loadS3Songs(connection, signal, scanned => { if (current(generation)) set({ scanned }); });
        await exclusive(async () => {
          if (!current(generation)) return;
          await SecureStore.setItemAsync(KEY, JSON.stringify(connection));
          // Cleanup remains inside the write barrier; it cannot delete a newer connection.
          if (!current(generation)) await SecureStore.deleteItemAsync(KEY);
        });
        if (!current(generation)) return;
        credentials = connection; set({ connection: publicS3Connection(connection), songs });
      } catch (error) { if (current(generation)) set({ error: message(error) }); }
      finally { if (current(generation)) set({ busy: false }); }
    },
    disconnect: async () => {
      const { generation } = begin();
      try { supported(); await exclusive(async () => { if (current(generation)) await SecureStore.deleteItemAsync(KEY); }); }
      catch { if (current(generation)) set({ error: 'S3 인증 정보를 기기에서 삭제하지 못했습니다. 연결 해제를 다시 시도해 주세요.' }); }
      finally { if (current(generation)) set({ busy: false }); }
    },
    cancel: () => {
      request?.abort(); request = null;
      set({ generation: get().generation + 1, ready: true, busy: false, loading: false, error: 'S3 요청을 취소했습니다.' });
    },
    refresh: async () => {
      if (!credentials || get().busy) return;
      const connection = credentials, generation = get().generation;
      request?.abort(); const task = new AbortController(); request = task;
      set({ loading: true, scanned: 0, error: null });
      try {
        const songs = await loadS3Songs(connection, task.signal, scanned => { if (current(generation) && request === task) set({ scanned }); });
        if (current(generation) && request === task && !task.signal.aborted) set({ songs });
      } catch (error) {
        if (current(generation) && request === task && !task.signal.aborted) { set({ error: message(error) }); throw error; }
      } finally { if (current(generation) && request === task) { request = null; set({ loading: false }); } }
    },
    source: async song => {
      const connection = credentials, generation = get().generation;
      if (song.source !== 's3' || !connection || connection.id !== song.s3.connectionId) throw new S3RequestError('이 음악의 S3 연결을 설정에서 다시 연결해 주세요.');
      const uri = await signedS3Url(connection, song.s3.key);
      if (!current(generation) || credentials !== connection) throw new S3RequestError('S3 연결이 변경되었습니다. 곡을 다시 선택해 주세요.');
      return { uri };
    },
  };
});
export const s3Source = (song: Song) => useS3Store.getState().source(song);
