import type { MusicRepository, Page, Song } from '@/types/music';
import type { LibraryLoadProgress } from './load-progress';

// Use the NAS-verified Song.list and song_tag fields. No unverified artist
// filter is sent to the server. Query caches this metadata across artists.
export async function loadSongLibrary(
  repository: Pick<MusicRepository, 'songs'>,
  signal: AbortSignal,
  onProgress?: (progress: LibraryLoadProgress) => void,
): Promise<Page<Song>> {
  const items: Song[] = [];
  let stale = false;
  let expectedTotal: number | undefined;
  const ids = new Set<string>();
  while (true) {
    if (signal.aborted) {
      throw new Error('곡 조회가 취소되었습니다.');
    }
    const page = await repository.songs({ offset: items.length, limit: 100, signal });
    if (signal.aborted) {
      throw new Error('곡 조회가 취소되었습니다.');
    }
    if (!Number.isSafeInteger(page.total) || page.total < 0 ||
        (expectedTotal !== undefined && expectedTotal !== page.total) ||
        items.length + page.items.length > page.total ||
        (!page.items.length && items.length < page.total)) {
      throw new Error('음악 목록이 변경되었습니다. 다시 불러와 주세요.');
    }
    expectedTotal = page.total;
    for (const song of page.items) {
      if (!song.id || ids.has(song.id)) {
        throw new Error('음악 목록이 변경되었습니다. 다시 불러와 주세요.');
      }
      ids.add(song.id);
    }
    items.push(...page.items);
    stale ||= page.stale === true;
    onProgress?.({ loaded: items.length, total: Math.max(items.length, page.total) });
    if (items.length >= page.total || !page.items.length) {
      break;
    }
  }
  return { items, total: items.length, stale };
}

// Keep existing nonblank names unchanged; old cached empty tags still need a usable route/group.
export function artistName(name: string): string {
  return name.trim() ? name : '알 수 없는 아티스트';
}

export function songsForArtist(library: Page<Song>, name: string): Page<Song> {
  const items = library.items.filter((song) => artistName(song.artist) === artistName(name));
  return { items, total: items.length, stale: library.stale };
}
