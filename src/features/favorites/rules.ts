import { metadataKey, validateMetadataKey } from '@/features/metadata/rules';
import type { Song } from '@/types/music';

// Share the source/account identity used for artwork and metadata edits.
export const favoriteKey = metadataKey;
export type FavoriteSongs = Record<string, number>;

export function parseFavorites(raw: string | null): FavoriteSongs {
  if (raw === null) return {};
  const value = JSON.parse(raw) as { version?: unknown; songs?: unknown };
  if (value?.version !== 1 || !value.songs || typeof value.songs !== 'object' || Array.isArray(value.songs)) throw new Error('좋아요한 곡 목록을 읽을 수 없습니다.');
  const entries = Object.entries(value.songs);
  if (entries.length > 10000) throw new Error('좋아요한 곡 목록이 저장 한도를 초과했습니다.');
  return Object.fromEntries(entries.map(([key, addedAt]) => {
    validateMetadataKey(key);
    if (typeof addedAt !== 'number' || !Number.isSafeInteger(addedAt) || addedAt <= 0) throw new Error('좋아요한 곡 목록을 읽을 수 없습니다.');
    return [key, addedAt];
  }));
}

/** Resolve current, visible library records rather than persisting song snapshots. */
export function favoriteSongs(library: readonly Song[], favorites: FavoriteSongs, nasScope: string | null): Song[] {
  return library.flatMap(song => {
    const key = favoriteKey(song, nasScope);
    return key && favorites[key] !== undefined ? [{ song, addedAt: favorites[key] }] : [];
  }).sort((a, b) => b.addedAt - a.addedAt).map(item => item.song);
}
