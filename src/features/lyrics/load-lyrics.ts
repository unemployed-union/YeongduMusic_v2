import { providerForSong } from '@/services/music-providers/registry';
import { onlineLyrics, checkLyricsCancelled } from '@/services/lyrics/lrclib';
import type { LyricsDocument, LyricsSource } from '@/types/lyrics';
import type { Song } from '@/types/music';

type LyricsRequest = {
  song: Song;
  source: LyricsSource;
  duration: number;
  signal?: AbortSignal;
  searchOnline?: boolean;
  // Accepted while callers migrate; authentication is owned by the Provider.
  mode?: string;
  session?: unknown;
  generation?: number;
};

export async function loadLyrics({
  song,
  source,
  duration,
  signal,
  searchOnline = false,
}: LyricsRequest): Promise<LyricsDocument> {
  checkLyricsCancelled(signal);
  const provider = providerForSong(song);
  if (source === 'nas' && !provider.lyrics) {
    throw new Error('이 음악 서비스에는 서버 가사가 없습니다. 자동 또는 온라인을 선택해 주세요.');
  }
  if (source === 'online' || !provider.lyrics) {
    return onlineLyrics(song, duration, signal, searchOnline);
  }
  const initial = provider.getState();
  let server: LyricsDocument | null = null;
  let serverError: unknown;
  try {
    server = await provider.lyrics.read(song, signal);
    checkLyricsCancelled(signal);
  } catch (error) {
    checkLyricsCancelled(signal);
    if (
      error instanceof Error &&
      (('kind' in error && error.kind === 'cancelled') ||
        ('authenticationExpired' in error && error.authenticationExpired))
    ) {
      throw error;
    }
    const current = provider.getState();
    if (current.scope !== initial.scope || current.generation !== initial.generation) {
      throw error;
    }
    serverError = error;
  }
  if (source === 'nas') {
    if (serverError) {
      throw serverError;
    }
    return server!;
  }
  if (server?.kind === 'synced' || server?.provider === 'demo') {
    return server;
  }
  try {
    const online = await onlineLyrics(song, duration, signal, searchOnline);
    checkLyricsCancelled(signal);
    if (online.kind === 'synced') {
      return online;
    }
    if (server?.kind === 'plain') {
      return server;
    }
    if (online.kind === 'missing' && serverError) {
      throw serverError;
    }
    return online;
  } catch (error) {
    checkLyricsCancelled(signal);
    if (server?.kind === 'plain') {
      return server;
    }
    throw error;
  }
}
