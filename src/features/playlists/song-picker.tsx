import { ScrollEdgeFade } from '@/components/scroll-edge-fade';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Artwork } from '@/components/artwork';
import { useSongs } from '@/features/library/queries';
import { searchSongs } from '@/features/library/search-songs';
import { usePlaylistStore } from '@/stores/playlists';
import { useColors } from '@/theme/tokens';
import { PlaylistSheet } from './dialogs';
import type { PlaylistPreset } from '@/types/playlists';

export function PlaylistSongPicker({ preset, onClose }: { preset: PlaylistPreset; onClose: () => void }) {
  const colors = useColors(), query = useSongs(), store = usePlaylistStore(), { height } = useWindowDimensions();
  const [term, setTerm] = useState(''), [selected, setSelected] = useState<Set<string>>(() => new Set()), [error, setError] = useState<string | null>(null);
  const existing = useMemo(() => new Set(preset.songIds), [preset.songIds]);
  const results = useMemo(() => query.data ? (term.trim() ? searchSongs(query.data, term).items : query.data.items) : [], [query.data, term]);
  const eligible = query.data?.items.filter((song) => selected.has(song.id) && !existing.has(song.id)).map((song) => song.id) ?? [];
  async function save() {
    if (!eligible.length || store.busy) return;
    try { await store.addSongs(preset.id, eligible); onClose(); } catch (cause) { setError(cause instanceof Error ? cause.message : '추가하지 못했습니다.'); }
  }
  return <PlaylistSheet title="곡 선택 추가" onClose={onClose}><View style={[styles.body, { height: height * 0.65 }]}>
    <TextInput accessibilityLabel="추가할 곡 검색" placeholder="곡, 아티스트, 앨범 검색" placeholderTextColor={colors.muted} value={term} onChangeText={setTerm} style={[styles.input, { color: colors.text, borderColor: colors.separator }]} />
    {query.isPending ? <ActivityIndicator color={colors.tint} /> : query.isError && !query.data ? <Pressable onPress={() => void query.refetch()}><Text style={{ color: colors.tint }}>{query.error.message} · 다시 시도</Text></Pressable> : <ScrollEdgeFade><FlatList contentContainerStyle={styles.list} style={styles.fill} keyboardShouldPersistTaps="handled" data={results} keyExtractor={(song) => song.id} ListEmptyComponent={<Text style={[styles.empty, { color: colors.muted }]}>추가할 곡이 없습니다.</Text>} renderItem={({ item }) => {
      const saved = existing.has(item.id), checked = saved || selected.has(item.id);
      return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked, disabled: saved || store.busy }} disabled={saved || store.busy} onPress={() => setSelected((current) => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })} style={[styles.row, { borderBottomColor: colors.separator }]}><Artwork item={item} size={42} radius={6} /><View style={styles.fill}><Text numberOfLines={1} style={{ color: colors.text, fontWeight: '600' }}>{item.title}</Text><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12 }}>{saved ? '이미 저장됨' : item.artist}</Text></View><Ionicons name={checked ? 'checkbox' : 'square-outline'} size={25} color={saved ? colors.muted : colors.tint} /></Pressable>;
    }} /></ScrollEdgeFade>}
    {query.data?.stale && <Text style={{ color: colors.muted }}>오프라인 저장 목록입니다.</Text>}
    {query.isRefetchError && <Text style={{ color: colors.tint }}>{query.error.message}</Text>}
    {error && <Text accessibilityRole="alert" style={{ color: colors.tint }}>{error}</Text>}
    <Pressable accessibilityRole="button" disabled={store.busy || !eligible.length} onPress={() => void save()} style={[styles.save, { backgroundColor: colors.tint, opacity: store.busy || !eligible.length ? 0.5 : 1 }]}><Text style={{ color: 'white', fontWeight: '700' }}>{store.busy ? '저장 중…' : `${eligible.length}곡 추가`}</Text></Pressable>
  </View></PlaylistSheet>;
}
const styles = StyleSheet.create({ body: { padding: 22, gap: 14 }, fill: { flex: 1 }, list: { paddingTop: 28, paddingBottom: 28 }, input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 15 }, row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 8 }, empty: { paddingVertical: 30, textAlign: 'center' }, save: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' } });
