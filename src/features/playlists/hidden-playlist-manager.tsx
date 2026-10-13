import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { AnimatedSwitch as Switch } from '@/components/animated-switch';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ScrollEdgeFade } from '@/components/scroll-edge-fade';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import { usePlaylistStore } from '@/stores/playlists';
import { useColors } from '@/theme/tokens';

export function HiddenPlaylistManager() {
  const colors = useColors(), privacy = useHiddenMusicStore(), store = usePlaylistStore();
  const [error, setError] = useState<string | null>(null);
  async function run(action: () => Promise<void>) {
    setError(null);
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : '변경하지 못했습니다. 다시 시도해 주세요.'); }
  }
  if (!store.ready || store.scope !== privacy.scope) return <View style={styles.center}>{store.error ? <><Text style={{ color: colors.text }}>{store.error}</Text><Pressable onPress={() => void store.load(privacy.scope)} style={styles.retry}><Text style={{ color: colors.tint }}>다시 불러오기</Text></Pressable></> : <ActivityIndicator color={colors.tint} />}</View>;
  return <ScrollEdgeFade><FlatList data={store.profile.presets} keyExtractor={(item) => item.id} contentContainerStyle={styles.list}
    ListHeaderComponent={<View>
      <Text style={[styles.heading, { color: colors.text }]}>플레이리스트 숨기기</Text>
      <Text style={[styles.note, { color: colors.muted }]}>선택한 목록은 보관함과 플레이리스트 추가 창에서 보이지 않습니다. 목록에 포함된 곡과 현재 재생은 그대로 유지됩니다.</Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.separator }]}><Ionicons name="finger-print" size={27} color={privacy.busy ? colors.muted : colors.tint} /><View style={styles.identity}><Text style={[styles.title, { color: privacy.busy ? colors.muted : colors.text }]}>지문 · 기기 암호로 설정 잠금</Text><Text style={[styles.detail, { color: colors.muted }]}>음악 숨기기와 잠금 설정을 공유합니다. 화면을 나가거나 앱을 백그라운드로 보내면 다시 잠급니다.</Text></View><Switch accessibilityLabel="숨김 설정 지문 또는 기기 암호 잠금" value={privacy.profile.biometricLock} disabled={privacy.busy} onValueChange={(enabled) => void run(() => privacy.setBiometricLock(enabled))} trackColor={{ false: colors.separator, true: colors.tint }} thumbColor="#FFFFFF" ios_backgroundColor={colors.separator} /></View>
      {(error || privacy.error) && <Text accessibilityRole="alert" style={[styles.note, { color: colors.tint }]}>{error ?? privacy.error}</Text>}
    </View>}
    ListEmptyComponent={<Text style={[styles.empty, { color: colors.muted }]}>아직 저장한 플레이리스트가 없습니다. 보관함에서 목록을 먼저 만들어 주세요.</Text>}
    ListFooterComponent={<Text style={[styles.note, { color: colors.muted }]}>이 기기의 현재 계정에 저장됩니다. 여기에서 토글을 끄면 목록이 다시 나타납니다. 음악 파일이나 플레이리스트를 삭제하지 않습니다.</Text>}
    renderItem={({ item }) => <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.separator }]}><Ionicons name="musical-notes-outline" size={26} color={privacy.busy ? colors.muted : colors.tint} /><View style={styles.identity}><Text numberOfLines={2} style={[styles.title, { color: privacy.busy ? colors.muted : colors.text }]}>{item.name}</Text><Text style={[styles.detail, { color: colors.muted }]}>{privacy.profile.hiddenPlaylistIds?.includes(item.id) ? '숨김' : '표시'}</Text></View><Switch accessibilityLabel={item.name + ' 플레이리스트 숨기기'} value={privacy.profile.hiddenPlaylistIds?.includes(item.id) ?? false} disabled={privacy.busy} onValueChange={(hidden) => void run(() => privacy.setPlaylistHidden(item.id, hidden))} trackColor={{ false: colors.separator, true: colors.tint }} thumbColor="#FFFFFF" ios_backgroundColor={colors.separator} /></View>}
  /></ScrollEdgeFade>;
}
const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22 }, retry: { padding: 16 },
  list: { flexGrow: 1, padding: 22, paddingTop: 28, paddingBottom: 40 }, heading: { fontSize: 26, fontWeight: '800', marginBottom: 10 }, note: { fontSize: 13, lineHeight: 20, marginBottom: 18 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1, borderRadius: 14, marginBottom: 14 }, identity: { flex: 1, gap: 5 }, title: { fontSize: 16, fontWeight: '700' }, detail: { fontSize: 12, lineHeight: 18 }, empty: { textAlign: 'center', lineHeight: 23, paddingVertical: 30 },
});
