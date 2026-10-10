import { useMemo } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Artwork } from '@/components/artwork';
import { AsyncState } from '@/components/async-state';
import { SongRow } from '@/components/song-row';
import { playAndOpenPlayer } from '@/features/playback/play-and-open-player';
import { useColors } from '@/theme/tokens';
import type { Album, Artist, Song } from '@/types/music';
import type { useAlbums, useArtists, useSongs } from './queries';

export const LIBRARY_TABS = ['albums', 'songs', 'artists'] as const;
export type LibraryTab = typeof LIBRARY_TABS[number];
type LibraryQuery = ReturnType<typeof useAlbums> | ReturnType<typeof useSongs> | ReturnType<typeof useArtists>;
interface Props {
  tab: LibraryTab;
  query: LibraryQuery;
  width: number;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
}

export function LibraryPage({ tab, query, width, refreshing, onRefresh }: Props) {
  const colors = useColors();
  const items = useMemo<(Album | Song | Artist)[]>(() => query.data?.items ?? [], [query.data]);
  const cardWidth = (width - 52) / 2;
  return <View style={{ width }}>
    <AsyncState loading={query.isPending} error={query.isError && !query.data ? (query.error as Error).message : null} retry={() => void onRefresh()}>
      <FlatList style={styles.fill} nestedScrollEnabled data={items} keyExtractor={(item) => item.id} numColumns={tab === 'albums' ? 2 : 1} columnWrapperStyle={tab === 'albums' ? styles.columns : undefined} contentContainerStyle={styles.list} alwaysBounceVertical refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} colors={[colors.tint]} tintColor={colors.tint} progressBackgroundColor={colors.surface} />} ListHeaderComponent={<View>{query.data && <Text style={[styles.stale, { color: colors.muted }]}>{query.data.total ?? 0}{tab === 'songs' ? '곡' : tab === 'albums' ? '개 앨범' : '명 아티스트'}</Text>}{query.data?.stale ? <Text style={[styles.stale, { color: colors.muted }]}>오프라인 보관함 · 마지막으로 저장된 목록</Text> : null}{query.isRefetchError ? <Pressable accessibilityRole="button" onPress={() => void onRefresh()} style={styles.refreshError}><Text style={{ color: colors.text }}>{query.error.message}</Text><Text style={[styles.retry, { color: colors.tint }]}>다시 시도</Text></Pressable> : null}</View>} ListEmptyComponent={<View style={styles.empty}><Text style={{ color: colors.muted, textAlign: 'center' }}>표시할 음악이 없습니다.{'\n'}아래로 당겨 다시 확인하세요.</Text></View>} renderItem={({ item, index }) => {
        if (tab === 'albums') {
          const album = item as Album;
          return <Pressable onPress={() => router.push({ pathname: '/album/[id]', params: { id: album.id, title: album.title, artist: album.artist, artworkUrl: album.artworkUrl ?? '' } })} style={[styles.album, { width: cardWidth }]}><Artwork item={album} size={cardWidth} radius={11} /><Text numberOfLines={1} style={[styles.albumTitle, { color: colors.text }]}>{album.title}</Text><Text numberOfLines={1} style={[styles.albumArtist, { color: colors.muted }]}>{album.artist}</Text></Pressable>;
        }
        if (tab === 'songs') return <SongRow song={item as Song} onPress={() => void playAndOpenPlayer(items as Song[], index)} />;
        const artist = item as Artist;
        return <Pressable accessibilityRole="button" accessibilityLabel={artist.name + ' 노래 보기'} onPress={() => router.push({ pathname: '/artist/[id]', params: { id: artist.id, name: artist.name } })} style={[styles.artist, { borderBottomColor: colors.separator }]}><View style={[styles.artistIcon, { backgroundColor: colors.surface }]}><Ionicons name="person" size={22} color={colors.tint} /></View><Text style={[styles.artistName, { color: colors.text }]}>{artist.name}</Text><Text style={{ color: colors.muted }}>{artist.albumCount ? `${artist.albumCount}개 앨범` : ''}</Text><Ionicons name="chevron-forward" size={18} color={colors.muted} /></Pressable>;
      }} />
    </AsyncState>
  </View>;
}
const styles = StyleSheet.create({ fill: { flex: 1 }, list: { flexGrow: 1, paddingHorizontal: 22, paddingBottom: 180 }, columns: { justifyContent: 'space-between' }, album: { marginBottom: 24 }, albumTitle: { fontSize: 15, fontWeight: '700', marginTop: 9 }, albumArtist: { fontSize: 13, marginTop: 2 }, artist: { height: 70, flexDirection: 'row', alignItems: 'center', gap: 13, borderBottomWidth: StyleSheet.hairlineWidth }, artistIcon: { width: 45, height: 45, borderRadius: 23, alignItems: 'center', justifyContent: 'center' }, artistName: { flex: 1, fontSize: 16, fontWeight: '700' }, stale: { fontSize: 12, marginBottom: 10 }, empty: { minHeight: 220, alignItems: 'center', justifyContent: 'center' }, refreshError: { marginBottom: 16, gap: 6 }, retry: { fontWeight: '700' } });
