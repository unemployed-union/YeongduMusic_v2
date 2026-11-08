import type { Page, Song } from '@/types/music';

function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().trim();
}

type SearchFields = {
  title: string;
  artist: string;
  album: string;
  normalized: readonly string[];
};

// Object keys isolate equal IDs from different accounts and release removed songs with GC.
const fieldsBySong = new WeakMap<Song, SearchFields>();

function searchableFields(song: Song): readonly string[] {
  const cached = fieldsBySong.get(song);
  if (
    cached &&
    cached.title === song.title &&
    cached.artist === song.artist &&
    cached.album === song.album
  ) {
    return cached.normalized;
  }

  const normalized = [song.title, song.artist, song.album].map(normalize);
  fieldsBySong.set(song, {
    title: song.title,
    artist: song.artist,
    album: song.album,
    normalized,
  });
  return normalized;
}

export function searchSongs(library: Page<Song>, term: string): Page<Song> {
  const query = normalize(term);
  if (!query) {
    return { items: [], total: 0, stale: library.stale };
  }
  const words = query.split(/\s+/u);
  const items = library.items.filter((song) => {
    const fields = searchableFields(song);
    return words.every((word) => fields.some((field) => field.includes(word)));
  });
  return { items, total: items.length, stale: library.stale };
}
