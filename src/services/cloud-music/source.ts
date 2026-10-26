import type { Song } from '@/types/music';

type CloudSong = Extract<Song, { source: 'drive' | 's3' | 'mybox' }>;

/** Obtain current credentials without persisting media URLs or owning playback state. */
export async function cloudStreamSource(song: CloudSong, refreshCredentials = false, options?: { signal?: AbortSignal; download?: boolean }): Promise<{ uri: string; headers?: Record<string, string> }> {
  if (song.source === 'mybox') {
    const { useMyboxStore } = await import('@/stores/mybox');
    return options?.download ? useMyboxStore.getState().source(song, options.signal) : useMyboxStore.getState().playbackSource(song, options?.signal);
  }
  if (song.source === 'drive') {
    const { driveSource } = await import('@/stores/google-drive');
    return driveSource(song, refreshCredentials);
  }
  const { s3Source } = await import('@/stores/s3');
  return s3Source(song);
}
