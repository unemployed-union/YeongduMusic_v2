import type { Song, SourceRequest, UriSource } from '@/types/music';

type CloudSong = Extract<Song, { source: 'drive' | 's3' | 'mybox' }>;

export function resolveCloudPlaybackSource(
  song: CloudSong,
  options: SourceRequest = {},
): Promise<UriSource> {
  return resolveCloudSource(song, 'playback', options);
}

export function resolveCloudDownloadSource(
  song: CloudSong,
  options: SourceRequest = {},
): Promise<UriSource> {
  return resolveCloudSource(song, 'download', options);
}

/** Obtain current credentials without persisting media URLs or owning playback state. */
export async function cloudStreamSource(
  song: CloudSong,
  refreshCredentials = false,
  options?: { signal?: AbortSignal; download?: boolean },
): Promise<{ uri: string; headers?: Record<string, string> }> {
  return resolveCloudSource(song, options?.download ? 'download' : 'playback', {
    refreshCredentials,
    signal: options?.signal,
  });
}

async function resolveCloudSource(
  song: CloudSong,
  purpose: 'playback' | 'download',
  options: SourceRequest,
): Promise<UriSource> {
  if (song.source === 'mybox') {
    const { useMyboxStore } = await import('@/stores/mybox');
    return purpose === 'download'
      ? useMyboxStore.getState().source(song, options.signal)
      : useMyboxStore.getState().playbackSource(song, options.signal);
  }
  if (song.source === 'drive') {
    const { driveSource } = await import('@/stores/google-drive');
    return driveSource(song, options.refreshCredentials);
  }
  const { s3Source } = await import('@/stores/s3');
  return s3Source(song);
}
