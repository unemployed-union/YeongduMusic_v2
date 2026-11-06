import { providerForSong } from '@/services/music-providers/registry';
import type { Song, PlaybackSource, SourceRequest } from '@/types/music';

export async function resolvePlaybackSource(
  song: Song,
  options: SourceRequest = {},
): Promise<PlaybackSource> {
  const provider = providerForSong(song);
  const state = provider.getState();
  if (options.signal?.aborted) {
    throw new Error('재생 요청이 취소되었습니다.');
  }
  const source = await provider.streamSource(song, options);
  const current = provider.getState();
  if (
    options.signal?.aborted ||
    state.scope !== current.scope ||
    state.generation !== current.generation
  ) {
    await source.release?.().catch(() => {});
    throw new Error('재생 요청이 취소되었습니다.');
  }
  return source;
}
