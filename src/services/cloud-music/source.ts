import type { Song } from '@/types/music';

type CloudSong = Extract<Song, { source: 'drive' | 's3' }>;

/** Obtain current credentials without persisting media URLs or owning playback state. */
export async function cloudStreamSource(song: CloudSong, refreshCredentials = false): Promise<{ uri: string; headers?: Record<string, string> }> {
  if (song.source === 'drive') {
    const { driveSource } = await import('@/stores/google-drive');
    return driveSource(song, refreshCredentials);
  }
  const { s3Source } = await import('@/stores/s3');
  return s3Source(song);
}
