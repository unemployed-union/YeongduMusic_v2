import { useQuery } from '@tanstack/react-query';
import { albumId, albumsFromSongs, songsForAlbum } from './album-library';
import { loadSongLibrary, songsForArtist } from './load-song-library';
import { searchSongs } from './search-songs';
import { libraryIdentity, musicRepository } from './repository';
import { visibleSongs } from '../hidden-music/rules';
import { useAuthStore } from '@/stores/auth';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import type { Album, Artist, Page, Song } from '@/types/music';

function useSongLibrary<T>(select: (library: Page<Song>) => T, enabled = true) {
  const mode = useAuthStore((state) => state.mode);
  const session = useAuthStore((state) => state.session);
  const ready = useHiddenMusicStore((state) => state.ready);
  const identity = libraryIdentity(mode, session);
  return useQuery({
    queryKey: ['song-library', identity], enabled: ready && enabled,
    queryFn: ({ signal }) => loadSongLibrary(musicRepository(), signal),
    select, retry: 2,
  });
}

// Only the protected settings screen uses the unfiltered metadata selection.
export function useRawSongLibrary(enabled = true) {
  return useSongLibrary((library) => library, enabled);
}
export function useSongs(enabled = true) {
  const presets = useHiddenMusicStore((state) => state.profile.presets);
  return useSongLibrary((library) => visibleSongs(library, presets), enabled);
}
export function useAlbums(enabled = true) {
  const presets = useHiddenMusicStore((state) => state.profile.presets);
  return useSongLibrary((library) => albumsFromSongs(visibleSongs(library, presets)), enabled);
}
export function useArtists(enabled = true) {
  const presets = useHiddenMusicStore((state) => state.profile.presets);
  return useSongLibrary((library): Page<Artist> => {
    const visible = visibleSongs(library, presets);
    const artists = new Map<string, Set<string>>();
    for (const song of visible.items) {
      const albums = artists.get(song.artist) ?? new Set<string>();
      albums.add(albumId(song));
      artists.set(song.artist, albums);
    }
    const items = [...artists].map(([name, albums]) => ({ id: name, name, albumCount: albums.size })).sort((a, b) => a.name.localeCompare(b.name));
    return { items, total: items.length, stale: visible.stale };
  }, enabled);
}
export function useAlbumSongs(album: Album) {
  const presets = useHiddenMusicStore((state) => state.profile.presets);
  return useSongLibrary((library) => songsForAlbum(visibleSongs(library, presets), album));
}
export function useArtistSongs(artist: Artist) {
  const presets = useHiddenMusicStore((state) => state.profile.presets);
  return useSongLibrary((library) => songsForArtist(visibleSongs(library, presets), artist.name));
}
export function useSearch(term: string) {
  const presets = useHiddenMusicStore((state) => state.profile.presets);
  return useSongLibrary((library) => searchSongs(visibleSongs(library, presets), term), term.trim().length > 0);
}
