import { TabScrollEdgeFade } from '@/components/tab-scroll-edge-fade';
import { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Text } from '@/components/text';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Artwork } from '@/components/artwork';
import { AsyncState } from '@/components/async-state';
import { ListLoading } from '@/components/list-loading';
import { SongRow } from '@/components/song-row';
import { playAndOpenPlayer } from '@/features/playback/play-and-open-player';
import { useColors } from '@/theme/tokens';
import type { Album, Artist, Song } from '@/types/music';
import type { useAlbums, useArtists, useSongs } from './queries';
import { sortLibraryItems, type LibrarySortOrder } from './sort-library';
import { AlbumProperties } from './album-properties';
import { playHaptic } from '@/services/haptics';
import type { ActionMenuAnchor } from '@/components/action-menu-position';
import { prepareAlbumColors } from './prepare-album-colors';

export const LIBRARY_TABS = ['albums', 'songs', 'artists', 'favorites'] as const;
export type LibraryTab = typeof LIBRARY_TABS[number];
type LibraryQuery = ReturnType<typeof useAlbums> | ReturnType<typeof useSongs> | ReturnType<typeof useArtists>;
const EMPTY_ITEMS: (Album | Song | Artist)[] = [];

interface Props extends Pick<LibraryQuery, 'data' | 'isPending' | 'isError' | 'error' | 'isRefetchError'> {
  tab: LibraryTab;
  sortOrder: LibrarySortOrder;
  width?: number;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
  onListScroll?: (tab: LibraryTab, event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  active?: boolean;
  keyExtractor?: (item: Album | Song | Artist) => string;
}

export const LibraryPage = memo(function LibraryPage({ tab, sortOrder, data, isPending, isError, error, isRefetchError, width, refreshing, onRefresh, onListScroll, active = true, keyExtractor }: Props) {
  const colors = useColors();
  const [selectedAlbum, setSelectedAlbum] = useState<{ album: Album; anchor: ActionMenuAnchor } | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);
  const sourceItems = data?.items ?? EMPTY_ITEMS;
  const items = useMemo(() => sortLibraryItems(sourceItems, sortOrder), [sourceItems, sortOrder]);
  const cardWidth = width === undefined ? 0 : (width - 52) / 2;
  const play = useCallback(async (index: number) => {
    setPlayError(null);
    try { await playAndOpenPlayer(items as Song[], index); }
    catch { setPlayError('곡을 재생하지 못했습니다. 다시 시도해 주세요.'); }
  }, [items]);
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => onListScroll?.(tab, event), [onListScroll, tab]);
  const renderItem = useCallback(({ item, index }: { item: Album | Song | Artist; index: number }) => {
    if (tab === 'albums') {
      const album = item as Album;
      return <Pressable onPressIn={() => { void prepareAlbumColors(album.artworkUrl); }} accessibilityRole="button" accessibilityLabel={album.title + ' 앨범 보기'} accessibilityHint="길게 누르면 앨범 속성이 열립니다" delayLongPress={400} onLongPress={event => { playHaptic('longPress'); setSelectedAlbum({ album, anchor: { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY } }); }} onPress={() => router.push({ pathname: '/album/[id]', params: { id: album.id, title: album.title, artist: album.artist, artworkUrl: album.artworkUrl ?? '' } })} style={[styles.album, { width: cardWidth }]}><Artwork item={album} size={cardWidth} radius={11} /><Text numberOfLines={1} style={[styles.albumTitle, { color: colors.text }]}>{album.title}</Text><Text numberOfLines={1} style={[styles.albumArtist, { color: colors.muted }]}>{album.artist}</Text></Pressable>;
    }
    if (tab === 'songs' || tab === 'favorites') return <SongRow song={item as Song} onPress={() => void play(index)} />;
    const artist = item as Artist;
    return <Pressable accessibilityRole="button" accessibilityLabel={artist.name + ' 노래 보기'} onPress={() => router.push({ pathname: '/artist/[id]', params: { id: artist.id, name: artist.name } })} style={[styles.artist, { borderBottomColor: colors.separator }]}><View style={[styles.artistIcon, { backgroundColor: colors.surface }]}><Ionicons name="person" size={22} color={colors.tint} /></View><Text style={[styles.artistName, { color: colors.text }]}>{artist.name}</Text><Text style={{ color: colors.muted }}>{artist.albumCount ? `${artist.albumCount}개 앨범` : ''}</Text><Ionicons name="chevron-forward" size={18} color={colors.muted} /></Pressable>;
  }, [tab, cardWidth, colors, play]);
  const frame = [width === undefined && styles.fill, { width }];
  if (isPending) return <View style={frame} accessibilityElementsHidden={!active} importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}><ListLoading /></View>;
  return <View style={frame} accessibilityElementsHidden={!active} importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}>
    <AsyncState error={isError && !data ? (error as Error).message : null} retry={() => void onRefresh()}>
      <TabScrollEdgeFade><FlatList onScroll={onScroll} scrollEventThrottle={16} windowSize={7} maxToRenderPerBatch={6} style={styles.fill} nestedScrollEnabled
        data={items} keyExtractor={keyExtractor ?? ((item) => item.id)} numColumns={tab === 'albums' ? 2 : 1} columnWrapperStyle={tab === 'albums' ? styles.columns : undefined}
        contentContainerStyle={styles.list} alwaysBounceVertical
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} colors={[colors.tint]} tintColor={colors.tint} progressBackgroundColor={colors.surface} />}
        ListHeaderComponent={<View>
          {data && <Text style={[styles.stale, { color: colors.muted }]}>{data.total ?? 0}{tab === 'songs' || tab === 'favorites' ? '곡' : tab === 'albums' ? '개 앨범' : '명 아티스트'}</Text>}
          {data?.stale ? <Text style={[styles.stale, { color: colors.muted }]}>오프라인 보관함 · 마지막으로 저장된 목록</Text> : null}
          {isRefetchError ? <Pressable accessibilityRole="button" onPress={() => void onRefresh()} style={styles.refreshError}><Text style={{ color: colors.text }}>{error?.message}</Text><Text style={[styles.retry, { color: colors.tint }]}>다시 시도</Text></Pressable> : null}
          {playError && <Text accessibilityRole="alert" style={[styles.stale, { color: colors.tint }]}>{playError}</Text>}
        </View>}
        ListEmptyComponent={<View style={styles.empty}><Text style={{ color: colors.muted, textAlign: 'center' }}>{tab === 'favorites'
          ? '좋아요한 곡이 없습니다.\n곡 목록이나 재생 화면에서 하트를 눌러 주세요.'
          : '표시할 음악이 없습니다.\n아래로 당겨 다시 확인하세요.'}</Text></View>}
        renderItem={renderItem} /></TabScrollEdgeFade>
    </AsyncState>
    {selectedAlbum && active && <AlbumProperties album={selectedAlbum.album} anchor={selectedAlbum.anchor} onClose={() => setSelectedAlbum(null)} />}
  </View>;
});
const styles = StyleSheet.create({ fill: { flex: 1 }, list: { flexGrow: 1, paddingTop: 12, paddingHorizontal: 22, paddingBottom: 180 }, columns: { justifyContent: 'space-between' }, album: { marginBottom: 24 }, albumTitle: { fontSize: 15, fontWeight: '700', marginTop: 9 }, albumArtist: { fontSize: 13, marginTop: 2 }, artist: { height: 70, flexDirection: 'row', alignItems: 'center', gap: 13, borderBottomWidth: StyleSheet.hairlineWidth }, artistIcon: { width: 45, height: 45, borderRadius: 23, alignItems: 'center', justifyContent: 'center' }, artistName: { flex: 1, fontSize: 16, fontWeight: '700' }, stale: { fontSize: 12, marginBottom: 10 }, empty: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 24 }, refreshError: { marginBottom: 16, gap: 6 }, retry: { fontWeight: '700' } });
