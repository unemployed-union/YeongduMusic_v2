import { isCloudSong } from '@/services/music-source';
import { resolveCloudPlaybackSource } from '@/services/cloud-music/source';
import { musicRepository } from '@/features/library/repository';
import type { Song, PlaybackSource, SourceRequest } from '@/types/music';

export async function resolvePlaybackSource(
  song: Song,
  { signal, refreshCredentials = false }: SourceRequest = {},
): Promise<PlaybackSource> {
  if (song.source === 'local') {
    const { localSource } = await import('@/services/local-music/storage');
    return localSource(song);
  }
  if (isCloudSong(song)) return resolveCloudPlaybackSource(song, { signal, refreshCredentials });
  return musicRepository().streamSource(song);
}
