import { useCallback, useMemo, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { LibraryPage, type LibraryTab } from '@/features/library/library-page';
import { useSongs } from '@/features/library/queries';
import { privacyScope } from '@/features/hidden-music/rules';
import { useAuthStore } from '@/stores/auth';
import { useFavoritesStore } from '@/stores/favorites';
import { favoriteKey, favoriteSongs } from './rules';
import type { LibrarySortOrder } from '@/features/library/sort-library';
import type { Album, Artist, Song } from '@/types/music';

type Props = {
  width?: number; active?: boolean; sortOrder?: LibrarySortOrder;
  onListScroll?: (tab: LibraryTab, event: NativeSyntheticEvent<NativeScrollEvent>) => void;
};

export function LikedSongsScreen({ width, active = true, sortOrder = 'default', onListScroll }: Props = {}) {
  const favorites = useFavoritesStore();
  const mode = useAuthStore(state => state.mode), session = useAuthStore(state => state.session);
  const scope = privacyScope(mode, session);
  // A library source filter must not hide likes from other connected sources.
  const library = useSongs(active && favorites.ready && !favorites.loadError, 'all');
  const data = useMemo(() => {
    if (!favorites.ready || favorites.loadError || !library.data) return undefined;
    const items = favoriteSongs(library.data.items, favorites.songs, scope);
    return { ...library.data, items, total: items.length };
  }, [library.data, favorites.ready, favorites.loadError, favorites.songs, scope]);
  const keyExtractor = useCallback((item: Album | Artist | Song) => favoriteKey(item as Song, scope) ?? item.id, [scope]);
  const [refreshing, setRefreshing] = useState(false);
  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    try { await Promise.all([favorites.load(true), library.refetch()]); }
    finally { setRefreshing(false); }
  }
  const error = favorites.loadError ? new Error(favorites.error ?? '좋아요한 곡을 불러오지 못했습니다.') : library.error;
  return <LibraryPage tab="favorites" width={width} active={active} sortOrder={sortOrder}
    data={data} isPending={!favorites.ready || !favorites.loadError && library.isPending && !library.data}
    isError={favorites.loadError || library.isError} error={error} isRefetchError={!favorites.loadError && library.isRefetchError}
    refreshing={refreshing} onRefresh={refresh} onListScroll={onListScroll} keyExtractor={keyExtractor} />;
}
