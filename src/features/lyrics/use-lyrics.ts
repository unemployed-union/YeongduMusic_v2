import { useQuery } from '@tanstack/react-query';
import { providerForSong } from '@/services/music-providers/registry';
import { useProviderStates } from '@/features/library/use-source-libraries';
import { loadLyrics } from './load-lyrics';
import { usePlaybackVisibility } from '@/features/playback/use-playback-visibility';
import type { LyricsSource } from '@/types/lyrics';
import type { Song } from '@/types/music';

export function useLyrics(
  song: Song,
  source: LyricsSource,
  duration: number,
  searchOnline = false,
) {
  const visible = usePlaybackVisibility();
  useProviderStates();
  const provider = providerForSong(song);
  const state = provider.getState();
  const trackDuration = Math.round(duration || song.duration || 0);
  const selectedSource = source === 'nas' && !provider.lyrics ? 'auto' : source;
  return useQuery({
    queryKey: [
      'lyrics',
      provider.id,
      state.scope,
      state.generation,
      selectedSource,
      song.id,
      song.title,
      song.artist,
      song.album,
      trackDuration,
      searchOnline,
    ],
    queryFn: ({ signal }) => {
      const current = provider.getState();
      if (
        signal.aborted ||
        current.scope !== state.scope ||
        current.generation !== state.generation
      ) {
        throw new Error('가사 요청이 취소되었습니다.');
      }
      return loadLyrics({
        song,
        source: selectedSource,
        signal,
        duration: trackDuration,
        searchOnline,
      });
    },
    enabled: visible && (state.connected || !provider.lyrics),
    staleTime: searchOnline ? 0 : 60 * 60 * 1000,
    refetchOnWindowFocus: !searchOnline,
    refetchOnReconnect: !searchOnline,
    gcTime: 60 * 60 * 1000,
    retry: (count, error) => {
      if (count >= 1 || !('kind' in error)) {
        return false;
      }
      const transient = error as Error & { kind?: string; status?: number; httpStatus?: number };
      return (
        transient.kind === 'network' ||
        transient.kind === 'timeout' ||
        (transient.kind === 'http' && (transient.status ?? transient.httpStatus ?? 0) >= 500)
      );
    },
  });
}
