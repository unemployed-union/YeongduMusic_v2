import type { Album, Artist, Song } from '@/types/music';

export type LibrarySortOrder = 'default' | 'ascending' | 'descending';
const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });

/** Sort only the displayed copy; default preserves repository order and cache identity. */
export function sortLibraryItems<T extends Album | Artist | Song>(
  items: T[],
  order: LibrarySortOrder,
): T[] {
  if (order === 'default') {
    return items;
  }
  const direction = order === 'ascending' ? 1 : -1;
  return [...items].sort(
    (a, b) =>
      direction * collator.compare('name' in a ? a.name : a.title, 'name' in b ? b.name : b.title),
  );
}
