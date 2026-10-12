import { ScrollEdgeFade } from '@/components/scroll-edge-fade';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Artwork } from '@/components/artwork';
import { AsyncState } from '@/components/async-state';
import { useSongs } from '@/features/library/queries';
import { PlaylistNameDialog } from '@/features/playlists/dialogs';
import { PlaylistSongPicker } from '@/features/playlists/song-picker';
import { playlistSongs, visiblePlaylists } from '@/features/playlists/rules';
import { playAndOpenPlayer } from '@/features/playback/play-and-open-player';
import { usePlaylistStore } from '@/stores/playlists';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import { useColors } from '@/theme/tokens';

export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors(), store = usePlaylistStore(), query = useSongs();
  const privacy = useHiddenMusicStore();
  const scope = privacy.scope;
  const preset = visiblePlaylists(store.profile.presets, privacy.profile.hiddenPlaylistIds).find((item) => item.id === id);
  const songs = useMemo(() => preset ? playlistSongs(preset, query.data?.items ?? []) : [], [preset, query.data]);
  const [rename, setRename] = useState(false), [adding, setAdding] = useState(false), [editing, setEditing] = useState(false), [error, setError] = useState<string | null>(null);
  async function run(operation: () => Promise<unknown>) { setError(null); try { await operation(); } catch (cause) { setError(cause instanceof Error ? cause.message : '변경하지 못했습니다.'); } }
  if (!privacy.ready || !store.ready || store.scope !== scope) return <View style={styles.center}>{store.error ? <Pressable onPress={() => void store.load(scope)}><Text style={{ color: colors.tint }}>{store.error} · 다시 불러오기</Text></Pressable> : <ActivityIndicator color={colors.tint} />}</View>;
  if (!preset) return <View style={styles.center}><Text style={{ color: colors.muted }}>플레이리스트를 찾을 수 없습니다.</Text><Pressable style={styles.action} onPress={() => router.replace('/playlists')}><Text style={{ color: colors.tint }}>목록으로 돌아가기</Text></Pressable></View>;
  return <View style={styles.fill}>
    <AsyncState loading={query.isPending} error={query.isError && !query.data ? query.error.message : null} retry={() => void query.refetch()}>
      <ScrollEdgeFade><FlatList data={songs} keyExtractor={(song) => song.id} contentContainerStyle={styles.list} ListHeaderComponent={<View>
        <View style={[styles.cover, { backgroundColor: colors.surface }]}><Ionicons name="musical-notes" size={48} color={colors.tint} /></View>
        <Text style={[styles.title, { color: colors.text }]}>{preset.name}</Text><Text style={[styles.note, { color: colors.muted }]}>재생 가능한 {songs.length}곡</Text>
        {songs.length < preset.songIds.length && <Text style={[styles.note, { color: colors.muted }]}>숨긴 곡이나 보관함에 없는 곡은 표시하지 않습니다.</Text>}
        {query.data?.stale && <Text style={[styles.note, { color: colors.muted }]}>오프라인 저장 목록입니다.</Text>}
        {query.isRefetchError && <Pressable onPress={() => void query.refetch()}><Text style={[styles.note, { color: colors.tint }]}>{query.error.message} · 다시 시도</Text></Pressable>}
        <View style={styles.actions}><Pressable accessibilityRole="button" disabled={!songs.length} onPress={() => void run(() => playAndOpenPlayer(songs))} style={[styles.primary, { backgroundColor: colors.tint, opacity: songs.length ? 1 : 0.5 }]}><Ionicons name="play" size={20} color="white" /><Text style={styles.primaryText}>전체 재생</Text></Pressable><Pressable accessibilityRole="button" disabled={store.busy} onPress={() => setAdding(true)} style={[styles.primary, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.separator }]}><Ionicons name="add" size={22} color={colors.tint} /><Text style={{ color: colors.tint, fontWeight: '700' }}>곡 추가</Text></Pressable></View>
        <View style={styles.actions}><Pressable disabled={store.busy} style={styles.action} onPress={() => setRename(true)}><Text style={{ color: colors.tint }}>이름 변경</Text></Pressable><Pressable disabled={store.busy} style={styles.action} onPress={() => setEditing(!editing)}><Text style={{ color: colors.tint }}>{editing ? '편집 완료' : '곡 편집'}</Text></Pressable><Pressable disabled={store.busy} style={styles.action} onPress={() => Alert.alert('플레이리스트 삭제', `${preset.name} 목록을 삭제할까요?`, [{ text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: () => void run(async () => { await store.removePreset(preset.id); router.replace('/playlists'); }) }])}><Text style={{ color: colors.muted }}>삭제</Text></Pressable></View>
        {error && <Text accessibilityRole="alert" style={[styles.note, { color: colors.tint }]}>{error}</Text>}
      </View>}
      ListEmptyComponent={<Text style={[styles.empty, { color: colors.muted }]}>재생할 곡이 없습니다.{'\n'}곡 추가 버튼으로 목록을 채워 보세요.</Text>}
      renderItem={({ item, index }) => <View style={[styles.row, { borderBottomColor: colors.separator }]}><Pressable accessibilityRole="button" onPress={() => void run(() => playAndOpenPlayer(songs, index))} style={styles.song}><Artwork item={item} size={44} radius={7} /><View style={styles.fill}><Text numberOfLines={1} style={{ color: colors.text, fontWeight: '600', fontSize: 16 }}>{item.title}</Text><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12, marginTop: 3 }}>{item.artist}</Text></View></Pressable>{editing && <View style={styles.editActions}>{([-1, 1] as const).map((direction) => <Pressable key={direction} accessibilityLabel={item.title + (direction === -1 ? ' 위로 이동' : ' 아래로 이동')} disabled={store.busy || (direction === -1 ? index === 0 : index === songs.length - 1)} style={styles.icon} onPress={() => void run(() => store.moveSong(preset.id, item.id, direction, songs.map((song) => song.id)))}><Ionicons name={direction === -1 ? 'chevron-up' : 'chevron-down'} size={21} color={colors.muted} /></Pressable>)}<Pressable accessibilityLabel={item.title + ' 목록에서 제거'} disabled={store.busy} style={styles.icon} onPress={() => void run(() => store.removeSong(preset.id, item.id))}><Ionicons name="remove-circle-outline" size={23} color={colors.tint} /></Pressable></View>}</View>} /></ScrollEdgeFade>
    </AsyncState>
    {rename && <PlaylistNameDialog title="이름 변경" initialName={preset.name} onClose={() => setRename(false)} onSave={(name) => store.renamePreset(preset.id, name)} />}
    {adding && <PlaylistSongPicker preset={preset} onClose={() => setAdding(false)} />}
  </View>;
}
const styles = StyleSheet.create({ fill: { flex: 1 }, center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 22 }, list: { flexGrow: 1, padding: 22, paddingTop: 28, paddingBottom: 180 }, cover: { width: 96, height: 96, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 18 }, title: { fontSize: 27, fontWeight: '800' }, note: { fontSize: 13, lineHeight: 20, marginTop: 8 }, actions: { flexDirection: 'row', gap: 12, marginTop: 16, flexWrap: 'wrap' }, primary: { minHeight: 46, paddingHorizontal: 18, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 7 }, primaryText: { color: 'white', fontWeight: '700' }, action: { paddingVertical: 10, paddingHorizontal: 2 }, row: { minHeight: 66, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth }, song: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }, editActions: { flexDirection: 'row' }, icon: { paddingHorizontal: 5, paddingVertical: 12 }, empty: { textAlign: 'center', lineHeight: 24, paddingVertical: 40 } });
