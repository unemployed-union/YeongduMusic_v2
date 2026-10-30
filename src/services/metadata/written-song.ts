import type { Song, SongMetadata } from '@/types/music';

export function writtenSongChanges(fields: SongMetadata | undefined, artworkUrl?: string) {
  return {
    ...(fields
      ? {
          ...fields,
          artist: fields.artist || '알 수 없는 아티스트',
          album: fields.album || '알 수 없는 앨범',
          albumId: undefined,
          albumSource: fields.album ? ('tag' as const) : ('fallback' as const),
          metadataOriginal: undefined,
        }
      : {}),
    ...(artworkUrl ? { artworkUrl, palette: undefined, artworkOriginal: undefined } : {}),
  };
}

export function mergeWrittenSong(queue: Song[], updated: Song, artworkUrl?: string): Song[] {
  return queue.map((item) => {
    if (item.id !== updated.id || (item.source ?? 'nas') !== (updated.source ?? 'nas')) return item;
    if (!artworkUrl)
      return {
        ...updated,
        duration: item.duration || updated.duration,
        artworkUrl: item.artworkUrl ?? updated.artworkUrl,
        palette: item.palette,
        artworkOriginal: item.artworkOriginal,
      };
    let current = item;
    if (item.source === 'local' && updated.source === 'local')
      current = { ...item, local: updated.local };
    else if (item.source === 's3' && updated.source === 's3') current = { ...item, s3: updated.s3 };
    return {
      ...current,
      artworkUrl,
      palette: undefined,
      artworkOriginal: item.artworkOriginal ? { artworkUrl } : undefined,
    };
  });
}
