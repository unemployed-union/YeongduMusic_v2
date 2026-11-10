import { useJellyfinStore } from '@/stores/jellyfin';
import { useStreamingPreferences } from '@/stores/streaming-preferences';
import { jellyfinScope, JellyfinError, type JellyfinClient } from '@/services/jellyfin/api';
import { jellyfinPlaybackSource } from '@/services/jellyfin/playback';
import {
  collectJellyfinItems,
  loadJellyfinPlaylists,
  mapJellyfinSongs,
} from '@/services/jellyfin/library';
import { memoSnapshot, storedPage, type MusicProvider } from './contracts';
import { reuseLibraryItems } from './library-policy';

async function readSession<T>(
  scope: string | undefined,
  signal: AbortSignal | undefined,
  read: (client: JellyfinClient) => Promise<T>,
): Promise<T> {
  const state = useJellyfinStore.getState();
  const client = state.client(scope);
  try {
    const result = await read(client);
    if (signal?.aborted || useJellyfinStore.getState().generation !== state.generation) {
      throw new JellyfinError('Jellyfin 요청이 취소되었습니다.');
    }
    return result;
  } catch (error) {
    if (error instanceof JellyfinError && error.status === 401) {
      await useJellyfinStore.getState().expire(client);
    }
    throw error;
  }
}

export const jellyfinProvider: MusicProvider = {
  id: 'jellyfin',
  name: 'Jellyfin',
  catalog: 'stored',
  playbackRecovery: 'reload',
  getState: memoSnapshot(() => {
    const state = useJellyfinStore.getState();
    return {
      ready: state.ready && !state.busy,
      connected: !!state.connection,
      scope: state.connection ? jellyfinScope(state.connection) : '',
      generation: state.generation,
      selection: state.selectedLibraries,
      songs: state.songs,
      loading: state.loading || state.busy,
      error: state.error,
      stale: state.stale,
      validatedAt: state.validatedAt,
    };
  }),
  subscribe: (listener) => useJellyfinStore.subscribe(listener),
  bootstrap: () => useJellyfinStore.getState().bootstrap(),
  songs: async (page) => {
    const state = useJellyfinStore.getState();
    if (!state.loaded) {
      await state.refresh(page.signal);
    }
    return {
      ...storedPage(useJellyfinStore.getState().songs, page),
      stale: useJellyfinStore.getState().stale,
    };
  },
  refresh: (signal) => useJellyfinStore.getState().refresh(signal),
  cancelLibrary: () => useJellyfinStore.getState().cancelLibrary(),
  cache: { restore: (songs, stale) => {
    const scope = jellyfinProvider.getState().scope;
    const valid = songs.filter((song) => song.source === 'jellyfin' && song.ref.accountScope === scope);
    useJellyfinStore.setState({ songs: reuseLibraryItems(useJellyfinStore.getState().songs, valid), loaded: true, stale });
  }, fail: (error) => useJellyfinStore.setState({ error, stale: true }) },
  streamSource: async (song, options = {}) => {
    const state = useJellyfinStore.getState();
    const client = state.client(song.ref?.accountScope);
    const generation = state.generation;
    const controller = new AbortController();
    const cancel = () => controller.abort();
    const unsubscribe = useJellyfinStore.subscribe((next) => {
      if (next.generation !== generation) {
        cancel();
      }
    });
    options.signal?.addEventListener('abort', cancel, { once: true });
    try {
      if (options.signal?.aborted) {
        cancel();
      }
      if (options.refreshCredentials) {
        await client.check(controller.signal);
      }
      await useStreamingPreferences.getState().load();
      const source = await jellyfinPlaybackSource(
        client,
        song,
        useStreamingPreferences.getState().quality,
        { ...options, signal: controller.signal },
      );
      if (controller.signal.aborted || useJellyfinStore.getState().generation !== generation) {
        await source.release?.().catch(() => {});
        throw new JellyfinError('Jellyfin 재생 요청이 취소되었습니다.');
      }
      return source;
    } catch (error) {
      if (error instanceof JellyfinError && error.status === 401) {
        await useJellyfinStore.getState().expire(client);
      }
      throw error;
    } finally {
      unsubscribe();
      options.signal?.removeEventListener('abort', cancel);
    }
  },
  entityRef: (song) => {
    if (!song.ref || song.ref.providerId !== 'jellyfin') {
      throw new JellyfinError('Jellyfin 곡 참조가 올바르지 않습니다.');
    }
    return song.ref;
  },
  restore: (song) =>
    song.ref?.accountScope === jellyfinProvider.getState().scope
      ? {
          ...song,
          artworkUrl: song.artworkUrl?.startsWith('jellyfin-artwork:')
            ? song.artworkUrl
            : undefined,
        }
      : null,
  libraries: {
    list: (signal) => readSession(undefined, signal, (client) => client.libraries(signal)),
  },
  playlists: {
    list: (signal) =>
      readSession(undefined, signal, (client) => loadJellyfinPlaylists(client, signal)),
    songs: (playlist, signal) =>
      readSession(playlist.ref.accountScope, signal, async (client) => {
        const items = await collectJellyfinItems(
          (page) => client.items(page, {}, playlist.ref.remoteId),
          signal,
        );
        return mapJellyfinSongs(items, client);
      }),
  },
};
