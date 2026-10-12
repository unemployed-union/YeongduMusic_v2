import { useCallback, useMemo } from 'react';
import { useGoogleDriveStore } from '@/stores/google-drive';
import { useLocalMusicStore } from '@/stores/local-music';
import { useQuery } from '@tanstack/react-query';
import { albumId, albumsFromSongs, songsForAlbum } from './album-library';
import { artistName, loadSongLibrary, songsForArtist } from './load-song-library';
import { searchSongs } from './search-songs';
import { libraryIdentity, musicRepository } from './repository';
import { visibleSongs } from '../hidden-music/rules';
import { useAuthStore } from '@/stores/auth';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import { useLibraryPreferences } from '@/stores/library-preferences';
import type { Album, Artist, Page, Song } from '@/types/music';

function useSongLibrary<T>(select: (library: Page<Song>) => T, enabled = true, nasOnly = false) {
  const mode = useAuthStore((state) => state.mode);
  const session = useAuthStore((state) => state.session);
  const ready = useHiddenMusicStore((state) => state.ready);
  const source = useLocalMusicStore((state) => state.source);
  const localSongs = useLocalMusicStore((state) => state.songs);
  const localReady = useLocalMusicStore((state) => state.ready);
  const driveSongs = useGoogleDriveStore((state) => state.songs);
  const driveLoading = useGoogleDriveStore((state) => state.loading);
  const driveError = useGoogleDriveStore((state) => state.error);
  const includeDrive = !nasOnly && (source === 'all' || source === 'drive');
  const identity = libraryIdentity(mode, session);
  const includeNas = nasOnly || ((source === 'nas' || source === 'all') && mode !== 'setup');
  const combined = useCallback((library: Page<Song>) => {
    if (nasOnly || source === 'nas') return select(library);
    const items = [...(includeNas ? library.items : []), ...(source === 'all' || source === 'local' ? localSongs : []), ...(includeDrive ? driveSongs : [])];
    return select({ ...library, items, total: items.length });
  }, [select, nasOnly, source, includeNas, localSongs, includeDrive, driveSongs]);
  const query = useQuery({
    queryKey: includeNas ? ['song-library', identity] : ['local-library'], enabled: ready && (nasOnly || localReady) && enabled,
    queryFn: ({ signal }) => includeNas && mode !== 'setup' ? loadSongLibrary(musicRepository(), signal) : Promise.resolve({ items: [] as Song[], total: 0 }),
    select: combined, retry: 2,
  });
  // Keep local files usable when NAS is unreachable, without publishing a
  // partial library as a successful NAS query or suppressing its retry notice.
  const fallback = useMemo(() => !nasOnly && source === 'all' && query.isError && !query.data && (localSongs.length || driveSongs.length)
    ? select({ items: [...localSongs, ...driveSongs], total: localSongs.length + driveSongs.length }) : undefined,
  [nasOnly, source, query.isError, query.data, localSongs, driveSongs, select]);
  if (includeDrive && driveError && !query.isError) return { ...query, isError: true, isPending: false, isRefetchError: !!query.data, error: new Error(driveError) };
  if (source === 'drive' && !nasOnly && driveLoading && !driveSongs.length) return { ...query, isPending: true };
  if (fallback === undefined || !query.isError) return query;
  return { ...query, data: fallback, isLoadingError: false, isRefetchError: true };
}

// Only the protected settings screen uses the unfiltered metadata selection.
export function useRawSongLibrary(enabled = true) {
  return useSongLibrary((library) => library, enabled, true);
}
export function useSongs(enabled = true) {
  const presets = useHiddenMusicStore((state) => state.profile.presets);
  const select = useCallback((library: Page<Song>) => visibleSongs(library, presets), [presets]);
  return useSongLibrary(select, enabled);
}
export function useAlbums(enabled = true) {
  const presets = useHiddenMusicStore((state) => state.profile.presets);
  const includeFolderAlbums = useLibraryPreferences((state) => state.includeFolderAlbums);
  const ready = useLibraryPreferences((state) => state.ready);
  const select = useCallback((library: Page<Song>) => albumsFromSongs(visibleSongs(library, presets), includeFolderAlbums), [presets, includeFolderAlbums]);
  return useSongLibrary(select, enabled && ready);
}
export function useArtists(enabled = true) {
  const presets = useHiddenMusicStore((state) => state.profile.presets);
  const select = useCallback((library: Page<Song>): Page<Artist> => {
    const visible = visibleSongs(library, presets);
    const artists = new Map<string, Set<string>>();
    for (const song of visible.items) {
      const name = artistName(song.artist);
      const albums = artists.get(name) ?? new Set<string>();
      albums.add(albumId(song));
      artists.set(name, albums);
    }
    const items = [...artists].map(([name, albums]) => ({ id: name, name, albumCount: albums.size })).sort((a, b) => a.name.localeCompare(b.name));
    return { items, total: items.length, stale: visible.stale };
  }, [presets]);
  return useSongLibrary(select, enabled);
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
