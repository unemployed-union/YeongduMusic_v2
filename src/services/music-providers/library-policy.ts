export const LIBRARY_REVALIDATE_MS = 15 * 60_000;
export const LIBRARY_CHANGES_MS = 5 * 60_000;
export const LIBRARY_GC_MS = 60 * 60_000;

export function retryLibraryDelay(failures: number): number {
  return Math.min(15, 2 ** Math.max(0, failures - 1)) * 60_000;
}

export function reuseLibraryItems<T extends { id: string }>(previous: readonly T[], next: T[]): T[] {
  const old = new Map(previous.map((item) => [item.id, item]));
  let unchanged = previous.length === next.length;
  const result = next.map((item, index) => {
    const before = old.get(item.id);
    const same = before && JSON.stringify(before) === JSON.stringify(item);
    const value = same ? before : item;
    unchanged &&= value === previous[index];
    return value;
  });
  return unchanged ? previous as T[] : result;
}
