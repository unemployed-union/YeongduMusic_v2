import { useQuery } from '@tanstack/react-query';
import { loadLyrics } from './load-lyrics';
import { libraryIdentity } from '@/features/library/repository';
import { LyricsRequestError } from '@/services/lyrics/lrclib';
import { SynologyRequestError } from '@/services/synology/api';
import { useAuthStore } from '@/stores/auth';
import type { LyricsSource } from '@/types/lyrics';
import type { Song } from '@/types/music';

export function useLyrics(song: Song, source: LyricsSource, duration: number) {
  const mode = useAuthStore((state) => state.mode);
  const session = useAuthStore((state) => state.session);
  const generation = useAuthStore((state) => state.generation);
  const trackDuration = Math.round(duration || song.duration || 0);
  return useQuery({
    queryKey: ['lyrics', libraryIdentity(mode, session), generation, source, song.id, song.title, song.artist, song.album, trackDuration],
    queryFn: ({ signal }) => loadLyrics({ song, source, mode, session, generation, signal, duration: trackDuration }),
    enabled: mode === 'mock' || (mode === 'nas' && !!session),
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: (count, error) => count < 1 && ((error instanceof LyricsRequestError || error instanceof SynologyRequestError) && (error.kind === 'network' || error.kind === 'timeout' || (error.kind === 'http' && (error instanceof LyricsRequestError ? error.status ?? 0 : error.httpStatus ?? 0) >= 500))),
  });
}
