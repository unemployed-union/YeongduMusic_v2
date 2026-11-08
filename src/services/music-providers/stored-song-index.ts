import type { Song } from '@/types/music';

const indexes = new WeakMap<readonly Song[], ReadonlyMap<string, Song>>();

/** Store catalogs replace their arrays on edits, refresh and account changes. */
export function findStoredSong(songs: readonly Song[], id: string): Song | undefined {
  let index = indexes.get(songs);
  if (!index) {
    const next = new Map<string, Song>();
    for (const song of songs) {
      // Match Array.find: the first occurrence wins if a legacy catalog has duplicates.
      if (!next.has(song.id)) {
        next.set(song.id, song);
      }
    }
    index = next;
    indexes.set(songs, index);
  }

  return index.get(id);
}
