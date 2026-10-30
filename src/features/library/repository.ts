import { mockRepository } from './mock-repository';
import { cachedPage, cachePage } from '@/services/synology/cache';
import {
  AUDIO_STATION_LIBRARY,
  SessionExpiredError,
  SynologyClient,
  SynologyError,
  SynologyRequestError,
  throwIfRequestCancelled,
  type Session,
} from '@/services/synology/api';
import { useAuthStore } from '@/stores/auth';
import { useStreamingPreferences } from '@/stores/streaming-preferences';
import type { Album, Artist, MusicRepository, Page, PageRequest, Song } from '@/types/music';

// Versioned by scope so older shared-only query data cannot be reused.
export function libraryIdentity(
  mode: string,
  session?: Pick<Session, 'baseUrl' | 'sid'> | null,
): string {
  return [
    mode,
    session?.baseUrl ?? '',
    session?.sid ?? '',
    AUDIO_STATION_LIBRARY,
    'song-path-v3',
  ].join(':');
}

async function cached<T>(
  key: string,
  fetcher: () => Promise<Page<T>>,
  allowCachedFallback: boolean,
  session: Session,
  generation: number,
  signal?: AbortSignal,
): Promise<Page<T>> {
  throwIfRequestCancelled(signal);
  try {
    const result = await fetcher();
    throwIfRequestCancelled(signal);
    await cachePage(key, result).catch(() => {});
    throwIfRequestCancelled(signal);
    return result;
  } catch (error) {
    if (
      error instanceof SynologyRequestError &&
      (error.kind === 'cancelled' || (error.kind === 'timeout' && signal?.aborted))
    ) {
      throw error;
    }
    throwIfRequestCancelled(signal);
    if (
      error instanceof SessionExpiredError ||
      (error instanceof SynologyError && error.code === 105)
    ) {
      await useAuthStore.getState().expire(session, generation);
      throw error;
    }
    if (!allowCachedFallback) {
      throw error;
    }
    const previous = await cachedPage<T>(key).catch(() => null);
    throwIfRequestCancelled(signal);
    if (previous) {
      return previous;
    }
    throw error;
  }
}

export function musicRepository({
  allowCachedFallback = true,
}: { allowCachedFallback?: boolean } = {}): MusicRepository {
  const { mode, session, generation } = useAuthStore.getState();
  if (mode === 'mock') {
    return mockRepository;
  }
  if (!session) {
    throw new Error('NAS 연결이 필요합니다.');
  }
  const client = new SynologyClient(session);
  let sidHash = 0;
  for (const char of session.sid) {
    sidHash = (Math.imul(31, sidHash) + char.charCodeAt(0)) | 0;
  }
  const prefix = `${session.baseUrl}:${sidHash}:${AUDIO_STATION_LIBRARY}:song-path-v3`;
  const key = (kind: string, page: PageRequest, suffix = '') =>
    `${prefix}:${kind}:${suffix}:${page.offset}:${page.limit}`;
  return {
    songs: (page) =>
      cached<Song>(
        key('songs', page),
        () => client.songs(page),
        allowCachedFallback,
        session,
        generation,
        page.signal,
      ),
    albums: (page) =>
      cached<Album>(
        key('albums', page),
        () => client.albums(page),
        allowCachedFallback,
        session,
        generation,
        page.signal,
      ),
    artists: (page) =>
      cached<Artist>(
        key('artists', page),
        () => client.artists(page),
        allowCachedFallback,
        session,
        generation,
        page.signal,
      ),
    streamSource: async (song) => {
      await useStreamingPreferences.getState().load();
      const current = useAuthStore.getState();
      if (current.generation !== generation || current.session !== session) {
        throw new Error('재생 요청이 취소되었습니다.');
      }
      return client.streamSource(song, useStreamingPreferences.getState().quality);
    },
  };
}
