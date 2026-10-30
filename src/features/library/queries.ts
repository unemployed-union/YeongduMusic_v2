import { useSourceLibraries } from './use-source-libraries';
import { applyLibraryEdits, combineSongLibraries } from './song-library';
import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { albumId, albumsFromSongs, songsForAlbum } from './album-library';
import { artistName, loadSongLibrary, songsForArtist } from './load-song-library';
import { searchSongs } from './search-songs';
import { libraryIdentity, musicRepository } from './repository';
import { libraryResult } from './library-result';
import { privacyScope, visibleSongs } from '../hidden-music/rules';
import { useSongMetadataStore } from '@/stores/song-metadata';
import { useSongArtworkStore } from '@/stores/song-artwork';
import { useAuthStore } from '@/stores/auth';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import { useLibraryPreferences } from '@/stores/library-preferences';
import type { Album, Artist, MusicSourceFilter, Page, Song } from '@/types/music';

function useSongLibrary<T>(
  select: (library: Page<Song>) => T,
  enabled = true,
  nasOnly = false,
  sourceOverride?: MusicSourceFilter,
) {
  const mode = useAuthStore((state) => state.mode);
  const session = useAuthStore((state) => state.session);
  const ready = useHiddenMusicStore((state) => state.ready);
  const patches = useSongMetadataStore((state) => state.patches);
  const metadataReady = useSongMetadataStore((state) => state.ready);
  const metadataScope = privacyScope(mode, session);
  const artworkPatches = useSongArtworkStore((state) => state.patches);
  const artworkReady = useSongArtworkStore((state) => state.ready);
  const artworkBaseUri = useSongArtworkStore((state) => state.baseUri);
  const sources = useSourceLibraries();
  const {
    libraries,
    driveLoading,
    driveError,
    documentError,
    s3Loading,
    s3Error,
    myboxLoading,
    myboxError,
  } = sources;
  const { local: localSongs, drive: driveSongs, s3: s3Songs, mybox: myboxSongs } = libraries;
  const source = sourceOverride ?? sources.preferredSource;
  const includeS3 = !nasOnly && (source === 'all' || source === 's3');
  const includeMybox = !nasOnly && (source === 'all' || source === 'mybox');
  const includeDrive = !nasOnly && (source === 'all' || source === 'drive');
  const identity = libraryIdentity(mode, session);
  const includeNas = nasOnly || ((source === 'nas' || source === 'all') && mode !== 'setup');
  const edits = useMemo(
    () => ({ metadata: patches, artwork: artworkPatches, scope: metadataScope, artworkBaseUri }),
    [patches, artworkPatches, metadataScope, artworkBaseUri],
  );
  const combined = useCallback(
    (library: Page<Song>) => {
      const combined = nasOnly
        ? library
        : combineSongLibraries(library, libraries, source, includeNas);
      return select(applyLibraryEdits(combined, edits));
    },
    [select, nasOnly, source, includeNas, libraries, edits],
  );
  const query = useQuery({
    queryKey: includeNas ? ['song-library', identity] : ['local-library'],
    enabled: ready && metadataReady && artworkReady && (nasOnly || sources.ready) && enabled,
    queryFn: ({ signal }) =>
      includeNas && mode !== 'setup'
        ? loadSongLibrary(musicRepository(), signal)
        : Promise.resolve({ items: [] as Song[], total: 0 }),
    select: combined,
    retry: 2,
  });
  // Keep local files usable when NAS is unreachable, without publishing a
  // partial library as a successful NAS query or suppressing its retry notice.
  const fallback = useMemo(() => {
    const needsFallback = !nasOnly && source === 'all' && query.isError && !query.data;
    if (!needsFallback) {
      return undefined;
    }

    const hasFallbackSongs =
      localSongs.length || driveSongs.length || s3Songs.length || myboxSongs.length;
    if (!hasFallbackSongs) {
      return undefined;
    }

    const fallbackLibrary = combineSongLibraries({ items: [], total: 0 }, libraries, 'all', false);
    const editedLibrary = applyLibraryEdits(fallbackLibrary, edits);
    return select(editedLibrary);
  }, [
    nasOnly,
    source,
    query.isError,
    query.data,
    localSongs,
    driveSongs,
    s3Songs,
    myboxSongs,
    select,
    libraries,
    edits,
  ]);
  const cloudError = [
    includeDrive && driveError,
    includeDrive && documentError,
    includeS3 && s3Error,
    includeMybox && myboxError,
  ]
    .filter(Boolean)
    .join('\n');
  return libraryResult(query, {
    fallback,
    cloudError,
    cloudLoading:
      (includeDrive && driveLoading) || (includeS3 && s3Loading) || (includeMybox && myboxLoading),
    cloudPending:
      !nasOnly &&
      ((source === 's3' && s3Loading && !s3Songs.length) ||
        (source === 'drive' && driveLoading && !driveSongs.length) ||
        (source === 'mybox' && myboxLoading && !myboxSongs.length)),
  });
}

// Only the protected settings screen uses the unfiltered metadata selection.
export function useRawSongLibrary(enabled = true) {
  return useSongLibrary((library) => library, enabled, true);
}
export function useSongs(enabled = true, sourceOverride?: MusicSourceFilter) {
  const presets = useHiddenMusicStore((state) => state.profile.presets);
  const select = useCallback((library: Page<Song>) => visibleSongs(library, presets), [presets]);
  return useSongLibrary(select, enabled, false, sourceOverride);
}
export function useAlbums(enabled = true) {
  const presets = useHiddenMusicStore((state) => state.profile.presets);
  const includeFolderAlbums = useLibraryPreferences((state) => state.includeFolderAlbums);
  const groupByTitle = useLibraryPreferences((state) => state.groupAlbumsByTitle);
  const ready = useLibraryPreferences((state) => state.ready);
  const select = useCallback(
    (library: Page<Song>) =>
      albumsFromSongs(visibleSongs(library, presets), includeFolderAlbums, groupByTitle),
    [presets, includeFolderAlbums, groupByTitle],
  );
  return useSongLibrary(select, enabled && ready);
}
export function useArtists(enabled = true) {
  const presets = useHiddenMusicStore((state) => state.profile.presets);
  const groupByTitle = useLibraryPreferences((state) => state.groupAlbumsByTitle);
  const ready = useLibraryPreferences((state) => state.ready);
  const select = useCallback(
    (library: Page<Song>): Page<Artist> => {
      const visible = visibleSongs(library, presets);
      const artists = new Map<string, Set<string>>();
      for (const song of visible.items) {
        const name = artistName(song.artist);
        const albums = artists.get(name) ?? new Set<string>();
        albums.add(albumId(song, groupByTitle));
        artists.set(name, albums);
      }
      const items = [...artists]
        .map(([name, albums]) => ({ id: name, name, albumCount: albums.size }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return { items, total: items.length, stale: visible.stale };
    },
    [presets, groupByTitle],
  );
  return useSongLibrary(select, enabled && ready);
}
export function useAlbumSongs(album: Album) {
  const presets = useHiddenMusicStore((state) => state.profile.presets);
  const includeFolderAlbums = useLibraryPreferences((state) => state.includeFolderAlbums);
  const ready = useLibraryPreferences((state) => state.ready);
  const id = album.id;
  const select = useCallback(
    (library: Page<Song>) =>
      songsForAlbum(visibleSongs(library, presets), { id }, includeFolderAlbums),
    [presets, id, includeFolderAlbums],
  );
  return useSongLibrary(select, ready);
}
export function useArtistSongs(artist: Artist) {
  const presets = useHiddenMusicStore((state) => state.profile.presets);
  const name = artist.name;
  const select = useCallback(
    (library: Page<Song>) => songsForArtist(visibleSongs(library, presets), name),
    [presets, name],
  );
  return useSongLibrary(select);
}
export function useSearch(term: string) {
  const presets = useHiddenMusicStore((state) => state.profile.presets);
  return useSongLibrary(
    (library) => searchSongs(visibleSongs(library, presets), term),
    term.trim().length > 0,
  );
}
