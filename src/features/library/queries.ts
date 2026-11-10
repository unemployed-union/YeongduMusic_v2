import { useSourceLibraries } from './use-source-libraries';
import { prepareSongLibrary } from './song-library';
import { useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { albumId, albumsFromSongs, songsForAlbum } from './album-library';
import { artistName, songsForArtist } from './load-song-library';
import { searchSongs } from './search-songs';
import { libraryIdentity } from './repository';
import { libraryResult } from './library-result';
import { readNasLibrary } from './nas-library-cache';
import { acquireNasLibrary } from '@/services/music-providers/nas-library-task';
import { LIBRARY_GC_MS } from '@/services/music-providers/library-policy';
import { useLibraryActivity } from './use-library-activity';
import { captureRefreshContext, refreshMusicLibrary } from './refresh-music-library';
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
  cachedOnly = false,
) {
  const queryClient = useQueryClient();
  const active = useLibraryActivity(enabled && !cachedOnly);
  const mode = useAuthStore((state) => state.mode);
  const session = useAuthStore((state) => state.session);
  const ready = useHiddenMusicStore((state) => state.ready);
  const patches = useSongMetadataStore((state) => state.patches);
  const metadataReady = useSongMetadataStore((state) => state.ready);
  const metadataScope = privacyScope(mode, session);
  const artworkPatches = useSongArtworkStore((state) => state.patches);
  const artworkReady = useSongArtworkStore((state) => state.ready);
  const artworkBaseUri = useSongArtworkStore((state) => state.baseUri);
  const sources = useSourceLibraries(active && !nasOnly, sourceOverride);
  const { libraries } = sources;
  const source = sourceOverride ?? sources.preferredSource;
  const identity = libraryIdentity(mode, session);
  const includeNas = nasOnly || ((source === 'nas' || source === 'all') && mode !== 'setup');
  const canLoad = ready && metadataReady && artworkReady && (nasOnly || sources.ready) && active;
  useEffect(() => {
    if (canLoad && includeNas && mode !== 'setup') {
      return acquireNasLibrary(queryClient, identity);
    }
  }, [canLoad, includeNas, mode, queryClient, identity]);
  const edits = useMemo(
    () => ({ metadata: patches, artwork: artworkPatches, scope: metadataScope, artworkBaseUri }),
    [patches, artworkPatches, metadataScope, artworkBaseUri],
  );
  const preparation = useMemo(
    () => ({
      libraries,
      source,
      includeNas,
      nasOnly,
      edits,
      stale: sources.stale,
      accountKey: JSON.stringify([identity, sources.accountKey]),
    }),
    [libraries, source, includeNas, nasOnly, edits, sources.stale, sources.accountKey, identity],
  );
  const combined = useCallback(
    (library: Page<Song>) => select(prepareSongLibrary(library, preparation)),
    [select, preparation],
  );
  const query = useQuery({
    queryKey: includeNas ? ['song-library', identity] : ['local-library'],
    enabled: canLoad,
    queryFn: ({ signal }) =>
      includeNas && mode !== 'setup'
        ? readNasLibrary(signal)
        : Promise.resolve({ items: [] as Song[], total: 0 }),
    select: combined,
    staleTime: Infinity,
    gcTime: LIBRARY_GC_MS,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
  // Keep local files usable when NAS is unreachable, without publishing a
  // partial library as a successful NAS query or suppressing its retry notice.
  const fallback = useMemo(() => {
    const needsFallback = !nasOnly && source === 'all' && query.isError && !query.data;
    if (!needsFallback) {
      return undefined;
    }

    const hasFallbackSongs = Object.values(libraries).some((songs) => songs?.length);
    if (!hasFallbackSongs) {
      return undefined;
    }

    return select(
      prepareSongLibrary({ items: [], total: 0 }, { ...preparation, includeNas: false }),
    );
  }, [nasOnly, source, query.isError, query.data, select, libraries, preparation]);
  return libraryResult({ ...query, refetch: () =>
    refreshMusicLibrary(queryClient, captureRefreshContext(source)) }, {
    fallback,
    cloudError: nasOnly ? undefined : sources.error,
    cloudLoading: !nasOnly && sources.loading,
    cloudPending: !nasOnly && sources.pending,
  });
}

// Only the protected settings screen uses the unfiltered metadata selection.
export function useRawSongLibrary(enabled = true) {
  return useSongLibrary((library) => library, enabled, true);
}
export function useSongs(enabled = true, sourceOverride?: MusicSourceFilter, cachedOnly = false) {
  const presets = useHiddenMusicStore((state) => state.profile.presets);
  const select = useCallback((library: Page<Song>) => visibleSongs(library, presets), [presets]);
  return useSongLibrary(select, enabled, false, sourceOverride, cachedOnly);
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
  const select = useCallback(
    (library: Page<Song>) => searchSongs(visibleSongs(library, presets), term),
    [presets, term],
  );
  return useSongLibrary(select, term.trim().length > 0);
}
