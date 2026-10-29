import type { Album, Page, Song } from '@/types/music';

// Song.list/song_tag and getsongcover have been checked against the NAS.
// Do not depend on an Album.list cover field or a server-side album filter.
export function albumId(song: Song, groupByTitle = false): string {
  if (groupByTitle) return JSON.stringify(['album-title', 1, song.album]);
  const id = song.albumId ?? JSON.stringify([song.album, song.albumArtist || song.artist]);
  const fallback = song.albumSource === 'fallback' || (song.source === 'local' && !hasAlbumTag(song));
  return fallback ? JSON.stringify(['fallback', id]) : id;
}

/** The route retains its grouping mode even if preferences change while open. */
export function albumTitleFromId(id: string): string | null {
  try {
    const value: unknown = JSON.parse(id);
    return Array.isArray(value) && value.length === 3 && value[0] === 'album-title' && value[1] === 1 && typeof value[2] === 'string' ? value[2] : null;
  } catch { return null; }
}

export function albumArtistLabel(songs: readonly Song[]): string {
  const first = songs[0]?.albumArtist || songs[0]?.artist || '';
  return songs.some(song => (song.albumArtist || song.artist) !== first) ? '여러 아티스트' : first;
}

export function hasAlbumTag(song: Song): boolean {
  if (song.albumSource) return song.albumSource === 'tag';
  // Legacy local imports/downloads may carry a folder name as their album.
  // Without provenance, a nonempty name alone does not confirm an album tag.
  if (song.source === 'local') return false;
  // Older saved songs do not carry provenance. Only exclude known default labels;
  // a real album can have exactly the same name as its containing folder.
  return !!song.album.trim() && !['알 수 없는 앨범', '이 기기 음악', 'Google Drive'].includes(song.album.trim());
}

export function albumsFromSongs(library: Page<Song>, includeFolderAlbums = true, groupByTitle = false): Page<Album> {
  const albums = new Map<string, Album>();
  const customArtwork = new Set<string>();
  for (const song of library.items) {
    if (!includeFolderAlbums && !hasAlbumTag(song)) continue;
    const id = albumId(song, groupByTitle);
    const previous = albums.get(id);
    if (previous) {
      previous.songCount = (previous.songCount ?? 0) + 1;
      if (groupByTitle && previous.artist !== (song.albumArtist || song.artist)) previous.artist = '여러 아티스트';
      previous.artworkUrl ??= song.artworkUrl;
      if (song.artworkOriginal && !customArtwork.has(id)) { previous.artworkUrl = song.artworkUrl; previous.palette = song.palette; }
    } else {
      albums.set(id, {
        id, title: song.album, artist: song.albumArtist || song.artist,
        year: song.year, artworkUrl: song.artworkUrl, palette: song.palette, songCount: 1,
      });
    }
    if (song.artworkOriginal) customArtwork.add(id);
  }
  const items = [...albums.values()].sort((a, b) => a.title.localeCompare(b.title) || a.artist.localeCompare(b.artist));
  return { items, total: items.length, stale: library.stale };
}

export function songsForAlbum(library: Page<Song>, album: Pick<Album, 'id'>, includeFolderAlbums = true): Page<Song> {
  const title = albumTitleFromId(album.id);
  const items = library.items.filter(song => title !== null
    ? (includeFolderAlbums || hasAlbumTag(song)) && song.album === title
    : albumId(song) === album.id)
    .sort((a, b) => (a.discNumber ?? 1) - (b.discNumber ?? 1) || (a.trackNumber ?? 0) - (b.trackNumber ?? 0));
  return { items, total: items.length, stale: library.stale };
}
