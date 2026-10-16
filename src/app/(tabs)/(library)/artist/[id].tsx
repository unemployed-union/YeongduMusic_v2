import { TabScrollEdgeFade } from '@/components/tab-scroll-edge-fade';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AsyncState } from '@/components/async-state';
import { SongRow } from '@/components/song-row';
import { useArtistSongs } from '@/features/library/queries';
import { playAndOpenPlayer } from '@/features/playback/play-and-open-player';
import { useColors } from '@/theme/tokens';
import { useCallback, useEffect } from 'react';
import type { Song } from '@/types/music';
import { ArtistPhoto } from '@/features/library/artist-photo';
import { useLibraryDetailPreferences } from '@/stores/library-detail-preferences';

const EMPTY_SONGS: Song[] = [];

export default function ArtistScreen() {
  const params = useLocalSearchParams<{ id: string; name?: string }>();
  const artist = { id: params.id, name: params.name ?? params.id };
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const detail = useLibraryDetailPreferences(), loadDetail = detail.load;
  useEffect(() => { void loadDetail(); }, [loadDetail]);
  const query = useArtistSongs(artist);
  const songs = query.data?.items ?? EMPTY_SONGS;
  const renderSong = useCallback(({ item, index }: { item: Song; index: number }) => <SongRow song={item} onPress={() => void playAndOpenPlayer(songs, index)} />, [songs]);
  const refresh = () => { void query.refetch(); };
  return <View style={[styles.screen, { backgroundColor: colors.background }]}>
    <AsyncState loading={query.isPending} error={query.isError && !query.data ? query.error.message : null} retry={refresh}>
      <TabScrollEdgeFade><FlatList data={songs} keyExtractor={(song) => song.id} contentContainerStyle={[styles.list, { paddingBottom: 180 + insets.bottom }]} alwaysBounceVertical
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={refresh} colors={[colors.tint]} tintColor={colors.tint} progressBackgroundColor={colors.surface} />}
        ListHeaderComponent={songs.length ? <View style={styles.header}>
          <ArtistPhoto name={artist.name} enabled={detail.ready && !detail.loadError && detail.preferences.artistPhotos} />
          <Text style={[styles.title, { color: colors.text }]}>{artist.name}</Text>
          <Text style={[styles.count, { color: colors.muted }]}>{query.data?.total ?? 0}곡</Text>
          {query.data?.stale && <Text style={[styles.message, { color: colors.muted }]}>오프라인 보관함 · 마지막으로 저장된 목록</Text>}
          <Pressable accessibilityRole="button" accessibilityLabel={artist.name + ' 노래 전체 재생'} disabled={!songs.length} onPress={() => void playAndOpenPlayer(songs)} style={[styles.play, { backgroundColor: colors.tint, opacity: songs.length ? 1 : 0.5 }]}>
            <Ionicons name="play" size={21} color="white" /><Text style={styles.playText}>전체 재생</Text>
          </Pressable>
          {query.isRefetchError && <Pressable accessibilityRole="button" onPress={refresh} style={styles.error}><Text style={{ color: colors.text }}>{query.error.message}</Text><Text style={{ color: colors.tint }}>다시 시도</Text></Pressable>}
        </View> : null}
        ListEmptyComponent={<Text style={[styles.empty, { color: colors.muted }]}>이 아티스트의 노래가 없습니다. 아래로 당겨 다시 확인하세요.</Text>}
        initialNumToRender={6} maxToRenderPerBatch={6} windowSize={7} renderItem={renderSong} /></TabScrollEdgeFade>
    </AsyncState>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, list: { flexGrow: 1, paddingHorizontal: 22, paddingBottom: 110 },
  header: { alignItems: 'center', paddingTop: 27, paddingBottom: 19 },
  title: { fontSize: 30, fontWeight: '800', marginTop: 20, textAlign: 'center' },
  count: { fontSize: 13, marginTop: 6 }, message: { fontSize: 12, marginTop: 10, textAlign: 'center' },
  play: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, height: 44, borderRadius: 11, alignSelf: 'stretch', marginTop: 23 },
  playText: { color: 'white', fontSize: 15, fontWeight: '800' },
  error: { alignSelf: 'stretch', marginTop: 16, gap: 6 }, empty: { paddingVertical: 30, textAlign: 'center' },
});
