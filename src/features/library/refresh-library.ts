import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { Album, Artist, MusicRepository, Page, Song } from '@/types/music';

export const LIBRARY_PAGE_SIZE = 30;
const libraryKinds = ['songs', 'albums', 'artists', 'album-songs', 'song-library', 'search'];

// Keep visible data until all three server responses succeed. Reset pagination
// together so a changed server list cannot mix old offsets with new records.
export async function refreshLibrary(
  queryClient: QueryClient,
  repository: MusicRepository,
  identity: string,
  isCurrentConnection: () => boolean,
): Promise<{ songCount: number } | null> {
  await queryClient.cancelQueries({ predicate: (query) => query.queryKey[1] === identity && libraryKinds.includes(String(query.queryKey[0])) });
  const request = { offset: 0, limit: LIBRARY_PAGE_SIZE };
  const [songs, albums, artists] = await Promise.all([
    repository.songs(request), repository.albums(request), repository.artists(request),
  ]);
  if (!isCurrentConnection()) return null;
  queryClient.setQueryData<InfiniteData<Page<Song>, number>>(['songs', identity], { pages: [songs], pageParams: [0] });
  queryClient.setQueryData<InfiniteData<Page<Album>, number>>(['albums', identity], { pages: [albums], pageParams: [0] });
  queryClient.setQueryData<InfiniteData<Page<Artist>, number>>(['artists', identity], { pages: [artists], pageParams: [0] });
  await queryClient.invalidateQueries({ predicate: (query) => query.queryKey[1] === identity && ['album-songs', 'search'].includes(String(query.queryKey[0])), refetchType: 'none' });
  // Refresh shared album/artist/search metadata if any screen is mounted.
  await queryClient.invalidateQueries({ queryKey: ['song-library', identity], exact: true });
  return { songCount: songs.total };
}
