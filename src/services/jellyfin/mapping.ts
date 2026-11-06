import type { Song } from '@/types/music';
import { jellyfinEntityId, jellyfinScope, type JellyfinItem, type JellyfinSession } from './api';

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function jellyfinSong(item: JellyfinItem, session: JellyfinSession): Song {
  const scope = jellyfinScope(session);
  const codec = Array.isArray(item.MediaStreams) ? text(item.MediaStreams.find((stream) => stream?.Type === 'Audio')?.Codec) : '';
  const album = text(item.Album);
  const albumId = text(item.AlbumId);
  const artist = Array.isArray(item.Artists) ? item.Artists.map(text).filter(Boolean).join(', ') : '';
  return {
    id: jellyfinEntityId(scope, 'track', item.Id!),
    source: 'jellyfin',
    ref: { providerId: 'jellyfin', accountScope: scope, remoteId: item.Id! },
    title: text(item.Name) || '제목 없음',
    artist: artist || '알 수 없는 아티스트',
    album: album || '알 수 없는 앨범',
    albumSource: album ? 'tag' : 'fallback',
    albumId: albumId ? jellyfinEntityId(scope, 'album', albumId) : undefined,
    albumArtist: text(item.AlbumArtist) || undefined,
    duration:
      typeof item.RunTimeTicks === 'number' && Number.isFinite(item.RunTimeTicks)
        ? Math.max(0, item.RunTimeTicks / 10_000_000)
        : 0,
    year: positiveNumber(item.ProductionYear),
    trackNumber: positiveNumber(item.IndexNumber),
    discNumber: positiveNumber(item.ParentIndexNumber),
    audioCodec: codec || undefined,
  };
}
