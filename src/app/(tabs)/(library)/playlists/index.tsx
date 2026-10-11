import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PlaylistNameDialog } from '@/features/playlists/dialogs';
import { usePlaylistStore } from '@/stores/playlists';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import { useColors } from '@/theme/tokens';

export default function PlaylistsScreen() {
  const colors = useColors(), store = usePlaylistStore();
  const scope = useHiddenMusicStore((state) => state.scope);
  const [creating, setCreating] = useState(false);
  if (!store.ready || store.scope !== scope) return <View style={styles.center}>{store.error ? <><Text style={{ color: colors.text }}>{store.error}</Text><Pressable style={styles.button} onPress={() => void store.load(scope)}><Text style={{ color: colors.tint }}>다시 불러오기</Text></Pressable></> : <ActivityIndicator color={colors.tint} />}</View>;
  return <View style={styles.fill}>
    <FlatList data={store.profile.presets} keyExtractor={(item) => item.id} contentContainerStyle={styles.list}
      ListHeaderComponent={<View><Text style={[styles.title, { color: colors.text }]}>나만의 플레이리스트</Text><Text style={[styles.note, { color: colors.muted }]}>기분과 상황에 맞는 목록을 여러 개 저장해 보세요.</Text><Pressable accessibilityRole="button" disabled={store.busy || !scope} onPress={() => setCreating(true)} style={[styles.create, { backgroundColor: colors.tint }]}><Ionicons name="add" size={22} color="white" /><Text style={styles.createText}>플레이리스트 만들기</Text></Pressable></View>}
      ListEmptyComponent={<Text style={[styles.empty, { color: colors.muted }]}>아직 저장한 목록이 없습니다.{'\n'}새 목록을 만들거나 곡의 메뉴에서 추가해 보세요.</Text>}
      ListFooterComponent={<Text style={[styles.note, { color: colors.muted, marginTop: 24 }]}>이 기기에 저장되며 현재 NAS 계정에서 사용할 수 있습니다.</Text>}
      renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/playlists/[id]', params: { id: item.id } })} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.separator }]}><View style={[styles.cover, { backgroundColor: colors.background }]}><Ionicons name="musical-notes" size={28} color={colors.tint} /></View><Text numberOfLines={2} style={[styles.name, { color: colors.text }]}>{item.name}</Text><Ionicons name="chevron-forward" size={20} color={colors.muted} /></Pressable>} />
    {creating && <PlaylistNameDialog title="플레이리스트 만들기" onClose={() => setCreating(false)} onSave={(name) => store.createPreset(name)} />}
  </View>;
}
const styles = StyleSheet.create({ fill: { flex: 1 }, center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 22 }, button: { padding: 16 }, list: { flexGrow: 1, padding: 22, paddingBottom: 180 }, title: { fontSize: 25, fontWeight: '800' }, note: { fontSize: 13, lineHeight: 20, marginTop: 8, marginBottom: 18 }, create: { minHeight: 48, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 22 }, createText: { color: 'white', fontWeight: '700' }, card: { minHeight: 84, padding: 14, gap: 14, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, marginBottom: 12 }, cover: { width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, name: { flex: 1, fontSize: 17, fontWeight: '700' }, empty: { textAlign: 'center', lineHeight: 24, paddingVertical: 45 } });
