import { useCallback, useMemo } from 'react';
import { useS3Store } from '@/stores/s3';
import { useGoogleDriveStore } from '@/stores/google-drive';
import { useLocalMusicStore } from '@/stores/local-music';
import { useQuery } from '@tanstack/react-query';
import { albumId, albumsFromSongs, songsForAlbum } from './album-library';
import { artistName, loadSongLibrary, songsForArtist } from './load-song-library';
import { searchSongs } from './search-songs';
import { libraryIdentity, musicRepository } from './repository';
import { libraryResult } from './library-result';
import { privacyScope, visibleSongs } from '../hidden-music/rules';
import { applyMetadataLibrary } from '../metadata/rules';
import { useSongMetadataStore } from '@/stores/song-metadata';
import { useSongArtworkStore } from '@/stores/song-artwork';
import { applyArtworkLibrary } from '../artwork/rules';
import { useAuthStore } from '@/stores/auth';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import { useLibraryPreferences } from '@/stores/library-preferences';
import type { Album, Artist, Page, Song } from '@/types/music';

function useSongLibrary<T>(select: (library: Page<Song>) => T, enabled = true, nasOnly = false) {
  const mode = useAuthStore((state) => state.mode);
  const session = useAuthStore((state) => state.session);
  const ready = useHiddenMusicStore((state) => state.ready);
  const patches = useSongMetadataStore(state => state.patches);
  const metadataReady = useSongMetadataStore(state => state.ready);
  const metadataScope = privacyScope(mode, session);
  const artworkPatches = useSongArtworkStore(state => state.patches), artworkReady = useSongArtworkStore(state => state.ready);
  const artworkBaseUri = useSongArtworkStore(state => state.baseUri);
  const source = useLocalMusicStore((state) => state.source);
  const localSongs = useLocalMusicStore((state) => state.songs);
  const localReady = useLocalMusicStore((state) => state.ready);
  const driveSongs = useGoogleDriveStore((state) => state.songs);
  const driveLoading = useGoogleDriveStore((state) => state.loading);
  const driveError = useGoogleDriveStore((state) => state.error);
  const s3Songs = useS3Store(state => state.songs);
  const s3Loading = useS3Store(state => state.loading);
  const s3Error = useS3Store(state => state.error);
  const includeS3 = !nasOnly && (source === 'all' || source === 's3');
  const includeDrive = !nasOnly && (source === 'all' || source === 'drive');
  const identity = libraryIdentity(mode, session);
  const includeNas = nasOnly || ((source === 'nas' || source === 'all') && mode !== 'setup');
  const combined = useCallback((library: Page<Song>) => {
    if (nasOnly || source === 'nas') return select(applyArtworkLibrary(applyMetadataLibrary(library, patches, metadataScope), artworkPatches, metadataScope, artworkBaseUri));
    const items = [...(includeNas ? library.items : []), ...(source === 'all' || source === 'local' ? localSongs : []), ...(includeDrive ? driveSongs : []), ...(includeS3 ? s3Songs : [])];
    return select(applyArtworkLibrary(applyMetadataLibrary({ ...library, items, total: items.length }, patches, metadataScope), artworkPatches, metadataScope, artworkBaseUri));
  }, [select, nasOnly, source, includeNas, localSongs, includeDrive, driveSongs, includeS3, s3Songs, patches, metadataScope, artworkPatches, artworkBaseUri]);
  const query = useQuery({
    queryKey: includeNas ? ['song-library', identity] : ['local-library'], enabled: ready && metadataReady && artworkReady && (nasOnly || localReady) && enabled,
    queryFn: ({ signal }) => includeNas && mode !== 'setup' ? loadSongLibrary(musicRepository(), signal) : Promise.resolve({ items: [] as Song[], total: 0 }),
    select: combined, retry: 2,
  });
  // Keep local files usable when NAS is unreachable, without publishing a
  // partial library as a successful NAS query or suppressing its retry notice.
  const fallback = useMemo(() => !nasOnly && source === 'all' && query.isError && !query.data && (localSongs.length || driveSongs.length || s3Songs.length)
    ? select(applyArtworkLibrary(applyMetadataLibrary({ items: [...localSongs, ...driveSongs, ...s3Songs], total: localSongs.length + driveSongs.length + s3Songs.length }, patches, metadataScope), artworkPatches, metadataScope, artworkBaseUri)) : undefined,
  [nasOnly, source, query.isError, query.data, localSongs, driveSongs, s3Songs, select, patches, metadataScope, artworkPatches, artworkBaseUri]);
  const cloudError = [includeDrive && driveError, includeS3 && s3Error].filter(Boolean).join('\n');
  return libraryResult(query, {
    fallback, cloudError,
    cloudLoading: (includeDrive && driveLoading) || (includeS3 && s3Loading),
    cloudPending: !nasOnly && ((source === 's3' && s3Loading && !s3Songs.length) || (source === 'drive' && driveLoading && !driveSongs.length)),
  });
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
