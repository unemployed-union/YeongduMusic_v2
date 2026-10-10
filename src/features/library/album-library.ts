import type { Album, Page, Song } from '@/types/music';

// Song.list/song_tag and getsongcover have been checked against the NAS.
// Do not depend on an Album.list cover field or a server-side album filter.
export function albumId(song: Song): string {
  return song.albumId ?? JSON.stringify([song.album, song.albumArtist || song.artist]);
}

export function albumsFromSongs(library: Page<Song>): Page<Album> {
  const albums = new Map<string, Album>();
  for (const song of library.items) {
    const id = albumId(song);
    const previous = albums.get(id);
    if (previous) {
      previous.songCount = (previous.songCount ?? 0) + 1;
      previous.artworkUrl ??= song.artworkUrl;
    } else {
      albums.set(id, {
        id, title: song.album, artist: song.albumArtist || song.artist,
        year: song.year, artworkUrl: song.artworkUrl, palette: song.palette, songCount: 1,
      });
    }
  }
  const items = [...albums.values()].sort((a, b) => a.title.localeCompare(b.title) || a.artist.localeCompare(b.artist));
  return { items, total: items.length, stale: library.stale };
}

export function songsForAlbum(library: Page<Song>, album: Album): Page<Song> {
  const items = library.items.filter((song) => albumId(song) === album.id)
    .sort((a, b) => (a.discNumber ?? 1) - (b.discNumber ?? 1) || (a.trackNumber ?? 0) - (b.trackNumber ?? 0));
  return { items, total: items.length, stale: library.stale };
}
