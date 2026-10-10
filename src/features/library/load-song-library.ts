import type { MusicRepository, Page, Song } from '@/types/music';

// Use the NAS-verified Song.list and song_tag fields. No unverified artist
// filter is sent to the server. Query caches this metadata across artists.
export async function loadSongLibrary(repository: Pick<MusicRepository, 'songs'>, signal: AbortSignal): Promise<Page<Song>> {
  const items: Song[] = [];
  let stale = false;
  while (true) {
    if (signal.aborted) throw new Error('곡 조회가 취소되었습니다.');
    const page = await repository.songs({ offset: items.length, limit: 100, signal });
    if (signal.aborted) throw new Error('곡 조회가 취소되었습니다.');
    if (!page.items.length && items.length < page.total) throw new Error('음악 목록이 변경되었습니다. 다시 불러와 주세요.');
    items.push(...page.items);
    stale ||= page.stale === true;
    if (items.length >= page.total || !page.items.length) break;
  }
  return { items, total: items.length, stale };
}

export function songsForArtist(library: Page<Song>, name: string): Page<Song> {
  const items = library.items.filter((song) => song.artist === name);
  return { items, total: items.length, stale: library.stale };
}
