import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Artwork } from '@/components/artwork';
import { AsyncState } from '@/components/async-state';
import { SongRow } from '@/components/song-row';
import { mockAlbums } from '@/features/library/mock-repository';
import { playAndOpenPlayer } from '@/features/playback/play-and-open-player';
import { useAlbumSongs } from '@/features/library/queries';
import { useColors } from '@/theme/tokens';
import type { Album } from '@/types/music';

export default function AlbumScreen() {
  const params = useLocalSearchParams<{ id: string; title?: string; artist?: string; artworkUrl?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const width = useWindowDimensions().width;
  const album: Album = useMemo(() => mockAlbums.find((item) => item.id === params.id) ?? { id: params.id, title: params.title ?? '앨범', artist: params.artist ?? '', artworkUrl: params.artworkUrl || undefined }, [params.id, params.title, params.artist, params.artworkUrl]);
  const query = useAlbumSongs(album);
  const songs = query.data?.items ?? [];
  const artworkAlbum = { ...album, artworkUrl: songs.find((song) => song.artworkUrl)?.artworkUrl };
  const [starting, setStarting] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);
  const play = async (selected = 0) => {
    setStarting(true); setPlayError(null);
    try {
      await playAndOpenPlayer(songs, selected);
    } catch (error) {
      setPlayError(error instanceof Error ? error.message : '앨범을 재생할 수 없습니다.');
    } finally { setStarting(false); }
  };
  return <View style={[styles.screen, { backgroundColor: colors.background }]}>
    <AsyncState loading={query.isPending} error={query.isError && !query.data ? query.error.message : null} retry={() => void query.refetch()}>
      <FlatList data={songs} keyExtractor={(song) => song.id} contentContainerStyle={[styles.list, { paddingBottom: 180 + insets.bottom }]} alwaysBounceVertical refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} colors={[colors.tint]} tintColor={colors.tint} progressBackgroundColor={colors.surface} />} ListHeaderComponent={songs.length ? <View style={styles.header}><Artwork item={artworkAlbum} size={Math.min(width - 100, 292)} radius={14} /><Text style={[styles.title, { color: colors.text }]}>{album.title}</Text><Text style={[styles.artist, { color: colors.tint }]}>{album.artist}</Text><Text style={[styles.count, { color: colors.muted }]}>{query.data?.total ?? 0}곡</Text><Pressable disabled={starting || !songs.length} onPress={() => void play()} style={[styles.play, { backgroundColor: colors.tint, opacity: starting || !songs.length ? 0.65 : 1 }]}>{starting ? <ActivityIndicator color="white" /> : <Ionicons name="play" size={21} color="white" />}<Text style={styles.playText}>전체 재생</Text></Pressable>{query.data?.stale && <Text style={[styles.count, { color: colors.muted }]}>오프라인 보관함 · 마지막으로 저장된 목록</Text>}{query.isRefetchError && <Pressable onPress={() => void query.refetch()}><Text style={[styles.count, { color: colors.tint }]}>{query.error.message} · 다시 시도</Text></Pressable>}{playError && <Text style={[styles.count, { color: colors.tint }]}>{playError}</Text>}</View> : null} ListEmptyComponent={<Text style={[styles.empty, { color: colors.muted }]}>이 앨범의 곡이 없습니다. 아래로 당겨 다시 확인하세요.</Text>} renderItem={({ item, index }) => <SongRow song={item} index={index} onPress={() => void play(index)} />} />
    </AsyncState>
  </View>;
}
const styles = StyleSheet.create({ screen: { flex: 1 }, empty: { paddingVertical: 30, textAlign: 'center' }, list: { flexGrow: 1, paddingHorizontal: 22, paddingBottom: 110 }, header: { alignItems: 'center', paddingTop: 27, paddingBottom: 19 }, title: { fontSize: 26, fontWeight: '800', marginTop: 20, textAlign: 'center' }, artist: { fontSize: 16, fontWeight: '600', marginTop: 5 }, count: { fontSize: 13, marginTop: 6 }, play: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, height: 44, borderRadius: 11, alignSelf: 'stretch', marginTop: 23 }, playText: { color: 'white', fontSize: 15, fontWeight: '800' } });
