import { createSerialQueue } from '@/services/async/serial-queue';
import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import {
  identifyMyboxConnection,
  loadMyboxSongs,
  myboxDownloadSource,
  MyboxError,
  prepareMyboxConnection,
  publicMyboxConnection,
  type MyboxInput,
  type MyboxConnection,
  type MyboxPublicConnection,
} from '@/services/mybox/api';
import { clearMyboxPlaybackCache, prepareMyboxPlayback } from '@/services/mybox/playback-cache';
import type { Song } from '@/types/music';

const KEY = 'yeongdu-mybox-connection-v1';
type State = {
  ready: boolean;
  busy: boolean;
  loading: boolean;
  connection: MyboxPublicConnection | null;
  songs: Song[];
  error: string | null;
  scanned: number;
  generation: number;
  bootstrap: () => Promise<void>;
  connect: (input: MyboxInput) => Promise<void>;
  disconnect: () => Promise<void>;
  refresh: () => Promise<void>;
  cancel: () => void;
  source: (song: Song, signal?: AbortSignal) => Promise<{ uri: string }>;
  playbackSource: (song: Song, signal?: AbortSignal) => Promise<{ uri: string }>;
};
export const useMyboxStore = create<State>((set, get) => {
  let credentials: MyboxConnection | null = null,
    request: AbortController | null = null;
  const media = new Set<AbortController>();
  const { run: exclusive } = createSerialQueue();
  const current = (generation: number) => get().generation === generation;
  const supported = () => {
    if (Platform.OS === 'web')
      throw new MyboxError('MYBOX 연결은 Android·iOS 앱에서 사용할 수 있습니다.');
  };
  const message = (error: unknown) =>
    error instanceof MyboxError
      ? error.message
      : 'MYBOX 연결 정보를 저장하거나 읽지 못했습니다. 다시 시도해 주세요.';
  function begin() {
    request?.abort();
    request = new AbortController();
    credentials = null;
    media.forEach((task) => task.abort());
    void clearMyboxPlaybackCache();
    const generation = get().generation + 1;
    set({
      generation,
      ready: true,
      busy: true,
      loading: false,
      scanned: 0,
      connection: null,
      songs: [],
      error: null,
    });
    return { generation, signal: request.signal };
  }
  async function source(song: Song, signal?: AbortSignal) {
    const connection = credentials,
      generation = get().generation;
    if (
      song.source !== 'mybox' ||
      !connection ||
      connection.id !== song.mybox.connectionId ||
      !song.path?.startsWith(connection.folder)
    )
      throw new MyboxError('이 음악의 MYBOX 연결을 설정에서 다시 연결해 주세요.');
    const result = await myboxDownloadSource(connection, song.mybox.fileId, signal);
    if (!current(generation) || credentials !== connection)
      throw new MyboxError('MYBOX 연결이 변경되었습니다. 곡을 다시 선택해 주세요.');
    return result;
  }
  return {
    ready: false,
    busy: false,
    loading: false,
    connection: null,
    songs: [],
    error: null,
    scanned: 0,
    generation: 0,
    bootstrap: async () => {
      if (get().ready || get().busy) return;
      const generation = get().generation;
      set({ busy: true });
      try {
        if (Platform.OS === 'web') return;
        const saved = await exclusive(() => SecureStore.getItemAsync(KEY));
        if (!current(generation) || !saved) return;
        const input = JSON.parse(saved) as MyboxConnection,
          connection = prepareMyboxConnection(input, input.id);
        if (!current(generation)) return;
        credentials = connection;
        set({ connection: publicMyboxConnection(connection) });
      } catch (error) {
        if (current(generation)) set({ error: message(error) });
      } finally {
        if (current(generation)) set({ ready: true, busy: false });
      }
      if (current(generation) && get().connection)
        await get()
          .refresh()
          .catch(() => {});
    },
    connect: async (input) => {
      const { generation, signal } = begin();
      try {
        supported();
        const connection = await identifyMyboxConnection(prepareMyboxConnection(input), signal);
        const songs = await loadMyboxSongs(connection, signal, (scanned) => {
          if (current(generation)) set({ scanned });
        });
        if (!current(generation) || signal.aborted) return;
        await exclusive(async () => {
          if (!current(generation) || signal.aborted) return;
          await SecureStore.setItemAsync(KEY, JSON.stringify(connection), {
            keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
          });
          if (!current(generation)) await SecureStore.deleteItemAsync(KEY);
        });
        if (!current(generation) || signal.aborted) return;
        credentials = connection;
        set({ connection: publicMyboxConnection(connection), songs });
      } catch (error) {
        if (current(generation)) set({ error: message(error) });
      } finally {
        if (current(generation)) set({ busy: false });
      }
    },
    disconnect: async () => {
      const { generation } = begin();
      try {
        supported();
        await exclusive(async () => {
          if (current(generation)) await SecureStore.deleteItemAsync(KEY);
        });
      } catch {
        if (current(generation))
          set({
            error:
              'MYBOX 인증 정보를 기기에서 삭제하지 못했습니다. 연결 해제를 다시 시도해 주세요.',
          });
      } finally {
        if (current(generation)) set({ busy: false });
      }
    },
    cancel: () => {
      request?.abort();
      request = null;
      set({
        generation: get().generation + 1,
        ready: true,
        busy: false,
        loading: false,
        error: 'MYBOX 요청을 취소했습니다.',
      });
    },
    refresh: async () => {
      if (!credentials || get().busy) return;
      const connection = credentials,
        generation = get().generation;
      request?.abort();
      const task = new AbortController();
      request = task;
      set({ loading: true, scanned: 0, error: null });
      try {
        const songs = await loadMyboxSongs(connection, task.signal, (scanned) => {
          if (current(generation) && request === task) set({ scanned });
        });
        if (current(generation) && request === task && !task.signal.aborted) set({ songs });
      } catch (error) {
        if (current(generation) && request === task && !task.signal.aborted) {
          set({ error: message(error) });
          throw error;
        }
      } finally {
        if (current(generation) && request === task) {
          request = null;
          set({ loading: false });
        }
      }
    },
    source,
    playbackSource: async (song, signal) => {
      supported();
      if (
        song.source !== 'mybox' ||
        !credentials ||
        credentials.id !== song.mybox.connectionId ||
        !song.path?.startsWith(credentials.folder)
      )
        throw new MyboxError('이 음악의 MYBOX 연결을 설정에서 다시 연결해 주세요.');
      const generation = get().generation,
        task = new AbortController();
      media.add(task);
      const abort = () => task.abort();
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      const timer = setTimeout(abort, 5 * 60_000);
      try {
        const result = await prepareMyboxPlayback(
          song,
          () => source(song, task.signal),
          task.signal,
        );
        if (!current(generation) || task.signal.aborted)
          throw new MyboxError('MYBOX 음악 불러오기가 취소되었습니다.');
        return result;
      } finally {
        clearTimeout(timer);
        media.delete(task);
        signal?.removeEventListener('abort', abort);
      }
    },
  };
});
