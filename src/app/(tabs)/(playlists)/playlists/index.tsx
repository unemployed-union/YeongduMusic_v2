import { TabScrollEdgeFade } from '@/components/tab-scroll-edge-fade';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ScreenHeader } from '@/components/screen-header';
import { ListLoading } from '@/components/list-loading';
import { SettingsButton } from '@/components/settings-button';
import { PlaylistNameDialog } from '@/features/playlists/dialogs';
import { visiblePlaylists } from '@/features/playlists/rules';
import { usePlaylistStore } from '@/stores/playlists';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import { useColors } from '@/theme/tokens';

const description = '기분과 상황에 맞는 목록을 여러 개 저장해 보세요. 이 기기에 저장되며 NAS 없이도 사용할 수 있습니다. NAS 연결 중에는 해당 계정의 목록을 사용합니다.';

export default function PlaylistsScreen() {
  const colors = useColors(), store = usePlaylistStore();
  const privacy = useHiddenMusicStore();
  const scope = privacy.scope;
  const [creating, setCreating] = useState(false);
  const loading = !privacy.ready || !store.ready || store.scope !== scope;
  const loadingContent = store.error ? <View style={styles.center}><Text style={{ color: colors.text }}>{store.error}</Text><Pressable style={styles.button} onPress={() => void store.load(scope)}><Text style={{ color: colors.tint }}>다시 불러오기</Text></Pressable></View> : <ListLoading />;
  return <View style={[styles.fill, { backgroundColor: colors.background }]}>
    <ScreenHeader title="플레이리스트" action={<SettingsButton />} />
    {loading ? loadingContent : <><TabScrollEdgeFade><FlatList data={visiblePlaylists(store.profile.presets, privacy.profile.hiddenPlaylistIds)} keyExtractor={(item) => item.id} contentContainerStyle={styles.list}
      ListHeaderComponent={<View><Pressable accessibilityRole="button" disabled={store.busy} onPress={() => setCreating(true)} style={[styles.create, { backgroundColor: colors.tint }]}><Ionicons name="add" size={22} color="white" /><Text style={styles.createText}>플레이리스트 만들기</Text></Pressable><Text accessibilityLabel={description} style={[styles.note, { color: colors.muted }]}>{description}</Text></View>}
      ListEmptyComponent={<View style={styles.emptyContainer}><Text style={[styles.empty, { color: colors.muted }]}>표시할 플레이리스트가 없습니다.{'\n'}새 목록을 만들거나 곡의 메뉴에서 추가해 보세요.</Text></View>}
      renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/playlists/[id]', params: { id: item.id } })} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.separator }]}><View style={[styles.cover, { backgroundColor: colors.background }]}><Ionicons name="musical-notes" size={28} color={colors.tint} /></View><Text numberOfLines={2} style={[styles.name, { color: colors.text }]}>{item.name}</Text><Ionicons name="chevron-forward" size={20} color={colors.muted} /></Pressable>} /></TabScrollEdgeFade>
    {creating && <PlaylistNameDialog title="플레이리스트 만들기" onClose={() => setCreating(false)} onSave={(name) => store.createPreset(name)} />}</>}
  </View>;
}
const styles = StyleSheet.create({ fill: { flex: 1 }, center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 22 }, button: { padding: 16 }, list: { flexGrow: 1, padding: 22, paddingTop: 0, paddingBottom: 180 }, note: { fontSize: 13, lineHeight: 20, marginBottom: 12 }, create: { minHeight: 48, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 18 }, createText: { color: 'white', fontWeight: '700' }, card: { minHeight: 84, padding: 14, gap: 14, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, marginBottom: 12 }, cover: { width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, name: { flex: 1, fontSize: 17, fontWeight: '700' }, emptyContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 24 }, empty: { textAlign: 'center', lineHeight: 24 } });
