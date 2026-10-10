import type { Page, Song } from '@/types/music';

function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().trim();
}

export function searchSongs(library: Page<Song>, term: string): Page<Song> {
  const query = normalize(term);
  if (!query) return { items: [], total: 0, stale: library.stale };
  const words = query.split(/\s+/u);
  const items = library.items.filter((song) => {
    const fields = [song.title, song.artist, song.album].map(normalize);
    return words.every((word) => fields.some((field) => field.includes(word)));
  });
  return { items, total: items.length, stale: library.stale };
}
