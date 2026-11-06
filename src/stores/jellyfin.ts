import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { createSerialQueue } from '@/services/async/serial-queue';
import { readPreference, writePreference } from '@/services/preferences/storage';
import {
  JellyfinClient,
  JellyfinError,
  jellyfinScope,
  loginJellyfin,
  normalizeJellyfinAddress,
  type JellyfinSession,
} from '@/services/jellyfin/api';
import { collectJellyfinItems, mapJellyfinSongs } from '@/services/jellyfin/library';
import type { MusicLibrary, Song } from '@/types/music';
import { cachePage, cachedPage } from '@/services/music-providers/cache';

const KEY = 'yeongdu-jellyfin-session-v1';
type Connection = Omit<JellyfinSession, 'token' | 'deviceId'>;
type State = {
  ready: boolean;
  busy: boolean;
  loading: boolean;
  loaded: boolean;
  generation: number;
  connection: Connection | null;
  libraries: MusicLibrary[];
  selectedLibraries: string[] | null;
  songs: Song[];
  stale: boolean;
  error: string | null;
  bootstrap: () => Promise<void>;
  connect: (
    address: string,
    username: string,
    password: string,
    allowHttp: boolean,
  ) => Promise<void>;
  disconnect: () => Promise<void>;
  expire: (client: JellyfinClient) => Promise<void>;
  refresh: (signal?: AbortSignal) => Promise<void>;
  cancel: () => void;
  cancelLibrary: () => void;
  selectLibraries: (ids: string[] | null) => Promise<void>;
  client: (scope?: string) => JellyfinClient;
};

function message(error: unknown): string {
  return error instanceof JellyfinError
    ? error.message
    : 'Jellyfin 연결 정보를 저장하거나 읽지 못했습니다. 다시 시도해 주세요.';
}

function selectionKey(connection: Connection): string {
  return 'jellyfin-libraries-v1:' + jellyfinScope(connection);
}

export const useJellyfinStore = create<State>((set, get) => {
  const { run: exclusive } = createSerialQueue();
  let credentials: JellyfinSession | null = null;
  let request: AbortController | null = null;
  let refreshing: Promise<void> | null = null;

  function begin() {
    request?.abort();
    request = new AbortController();
    refreshing = null;
    const generation = get().generation + 1;
    set({ generation, busy: true, loading: false, error: null });
    return { generation, signal: request.signal };
  }

  function current(generation: number) {
    return get().generation === generation;
  }

  async function save(generation: number, session: JellyfinSession | null) {
    await exclusive(async () => {
      if (!current(generation)) {
        return;
      }
      const previous = await SecureStore.getItemAsync(KEY);
      if (session) {
        await SecureStore.setItemAsync(KEY, JSON.stringify(session));
      } else {
        await SecureStore.deleteItemAsync(KEY);
      }
      if (!current(generation)) {
        if (previous === null) {
          await SecureStore.deleteItemAsync(KEY);
        } else {
          await SecureStore.setItemAsync(KEY, previous);
        }
      }
    });
  }

  async function publish(session: JellyfinSession, generation: number) {
    const raw = await readPreference(selectionKey(session));
    let selectedLibraries: string[] | null = null;
    if (raw) {
      const saved: unknown = JSON.parse(raw);
      if (saved === null || (Array.isArray(saved) && saved.every((id) => typeof id === 'string'))) {
        selectedLibraries = saved;
      }
    }
    if (!current(generation)) {
      return;
    }
    credentials = session;
    const { token: _token, deviceId: _device, ...connection } = session;
    set({ connection, selectedLibraries, songs: [], libraries: [], loaded: false, stale: false });
    const cached = await cachedPage<Song>(
      'jellyfin:' + JSON.stringify([jellyfinScope(session), selectedLibraries]),
    ).catch(() => null);
    if (
      current(generation) &&
      cached &&
      cached.items.every(
        (song) => song.source === 'jellyfin' && song.ref?.accountScope === jellyfinScope(session),
      )
    ) {
      set({ songs: cached.items, loaded: true, stale: true });
    }
  }

  return {
    ready: false,
    busy: false,
    loading: false,
    loaded: false,
    generation: 0,
    connection: null,
    libraries: [],
    selectedLibraries: null,
    songs: [],
    stale: false,
    error: null,
    client: (scope) => {
      if (!credentials || (scope && jellyfinScope(credentials) !== scope)) {
        throw new JellyfinError('이 음악의 Jellyfin 계정을 설정에서 다시 연결해 주세요.');
      }
      return new JellyfinClient(credentials);
    },
    bootstrap: async () => {
      if (get().ready || get().busy) {
        return;
      }
      const { generation, signal } = begin();
      try {
        if (Platform.OS === 'web') {
          return;
        }
        const raw = await exclusive(() => SecureStore.getItemAsync(KEY));
        if (!raw || !current(generation)) {
          return;
        }
        const saved = JSON.parse(raw) as JellyfinSession;
        if (
          !['baseUrl', 'userId', 'username', 'serverId', 'version', 'deviceId', 'token'].every(
            (key) =>
              typeof saved[key as keyof JellyfinSession] === 'string' &&
              saved[key as keyof JellyfinSession],
          )
        ) {
          throw new JellyfinError(
            '저장된 Jellyfin 연결 정보를 확인할 수 없습니다. 다시 연결해 주세요.',
          );
        }
        saved.baseUrl = normalizeJellyfinAddress(saved.baseUrl, true);
        await publish(saved, generation);
        try {
          await new JellyfinClient(saved).check(signal);
        } catch (error) {
          if (error instanceof JellyfinError && error.status === 401) {
            await get().expire(new JellyfinClient(saved));
          }
          throw error;
        }
      } catch (error) {
        if (current(generation)) {
          set({ error: message(error) });
        }
      } finally {
        if (current(generation)) {
          set({ ready: true, busy: false });
        }
      }
    },
    connect: async (address, username, password, allowHttp) => {
      const { generation, signal } = begin();
      try {
        if (Platform.OS === 'web') {
          throw new JellyfinError('Jellyfin 연결은 Android·iOS 앱에서 사용할 수 있습니다.');
        }
        const deviceId = 'yeongdu-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        const session = await loginJellyfin(
          address,
          username,
          password,
          deviceId,
          allowHttp,
          signal,
        );
        await new JellyfinClient(session).check(signal);
        if (!current(generation)) {
          return;
        }
        await save(generation, session);
        await publish(session, generation);
      } catch (error) {
        if (current(generation)) {
          set({ error: message(error) });
        }
      } finally {
        if (current(generation)) {
          set({ ready: true, busy: false });
        }
      }
    },
    disconnect: async () => {
      const previous = credentials;
      const { generation } = begin();
      credentials = null;
      set({ connection: null, songs: [], libraries: [], loaded: false, selectedLibraries: null });
      try {
        await save(generation, null);
        if (previous) {
          await new JellyfinClient(previous)
            .request('Sessions/Logout', { method: 'POST' })
            .catch(() => {});
        }
      } catch (error) {
        if (current(generation)) {
          set({ error: message(error) });
        }
      } finally {
        if (current(generation)) {
          set({ ready: true, busy: false });
        }
      }
    },
    expire: async (client) => {
      if (credentials !== client.session) {
        return;
      }
      const { generation } = begin();
      credentials = null;
      set({ connection: null, songs: [], libraries: [], loaded: false });
      await save(generation, null).catch(() => {});
      if (current(generation)) {
        set({
          ready: true,
          busy: false,
          error: 'Jellyfin 인증이 만료되었습니다. 다시 로그인해 주세요.',
        });
      }
    },
    cancelLibrary: () => {
      if (get().loading) {
        request?.abort();
        request = null;
        refreshing = null;
        set({ loading: false });
      }
    },
    cancel: () => {
      begin();
      set({ busy: false, loading: false, ready: true });
    },
    selectLibraries: async (ids) => {
      const connection = get().connection;
      if (!connection) {
        return;
      }
      const { generation } = begin();
      try {
        await exclusive(async () => {
          if (current(generation)) {
            await writePreference(selectionKey(connection), JSON.stringify(ids));
          }
        });
        if (current(generation)) {
          set({ selectedLibraries: ids, songs: [], loaded: false, stale: false });
        }
      } catch (error) {
        if (current(generation)) {
          set({ error: message(error) });
        }
      } finally {
        if (current(generation)) {
          set({ busy: false });
        }
      }
    },
    refresh: (signal) => {
      if (get().busy) {
        return Promise.reject(
          new JellyfinError('Jellyfin 연결과 라이브러리 설정을 확인 중입니다.'),
        );
      }
      if (refreshing) {
        return refreshing;
      }
      const client = get().client();
      const generation = get().generation;
      const controller = new AbortController();
      request?.abort();
      request = controller;
      const cancel = () => controller.abort();
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) {
        cancel();
      }
      set({ loading: true, error: null });
      const work = (async () => {
        try {
          const libraries = await client.libraries(controller.signal);
          const selected = get().selectedLibraries;
          const songs = new Map<string, Song>();
          for (const library of libraries) {
            if (selected !== null && !selected.includes(library.id)) {
              continue;
            }
            const items = await collectJellyfinItems(
              (page) => client.items(page, { ParentId: library.id }),
              controller.signal,
            );
            for (const song of mapJellyfinSongs(items, client)) {
              songs.set(song.id, song);
            }
          }
          if (current(generation) && !controller.signal.aborted && credentials === client.session) {
            const items = [...songs.values()];
            set({ libraries, songs: items, loaded: true, stale: false });
            await cachePage(
              'jellyfin:' + JSON.stringify([jellyfinScope(client.session), selected]),
              { items, total: items.length },
            ).catch(() => {});
          }
        } catch (error) {
          if (current(generation) && !controller.signal.aborted) {
            if (error instanceof JellyfinError && error.status === 401) {
              await get().expire(client);
            } else {
              set({ error: message(error), stale: get().loaded });
            }
          }
          throw error;
        } finally {
          signal?.removeEventListener('abort', cancel);
          if (request === controller) {
            set({ loading: false });
          }
          if (request === controller) {
            refreshing = null;
          }
        }
      })();
      refreshing = work;
      return work;
    },
  };
});
