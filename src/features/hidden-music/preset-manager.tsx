import { ScrollEdgeFade } from '@/components/scroll-edge-fade';
import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { AnimatedSwitch as Switch } from '@/components/animated-switch';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AsyncState } from '@/components/async-state';
import { useRawSongLibrary } from '@/features/library/queries';
import { hiddenMatcher } from './rules';
import { PresetEditor } from './preset-editor';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import { useColors } from '@/theme/tokens';
import type { HiddenPreset } from '@/types/hidden-music';

export function PresetManager() {
  const colors = useColors();
  const { profile, busy, error, savePreset, removePreset, togglePreset, setBiometricLock } = useHiddenMusicStore();
  const query = useRawSongLibrary();
  const songs = query.data?.items;
  const [draft, setDraft] = useState<HiddenPreset | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const hiddenCount = useMemo(() => songs?.filter(hiddenMatcher(profile.presets)).length ?? 0, [songs, profile.presets]);
  async function run(operation: () => Promise<void>, success?: () => void) {
    setMessage(null);
    try { await operation(); success?.(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : '변경하지 못했습니다. 다시 시도해 주세요.'); }
  }
  function remove(preset: HiddenPreset) {
    Alert.alert('프리셋 삭제', preset.name + ' 프리셋을 삭제합니다. 이 프리셋으로만 숨긴 음악은 다시 표시됩니다.', [
      { text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: () => void run(() => removePreset(preset.id)) },
    ]);
  }
  return <AsyncState loading={query.isPending} error={query.isError && !query.data ? query.error.message : null} retry={() => void query.refetch()}>
    {draft ? <PresetEditor key={draft.id} preset={draft} songs={songs ?? []} busy={busy} error={message ?? error} onCancel={() => { setDraft(null); setMessage(null); }} onSave={(preset) => void run(() => savePreset(preset), () => setDraft(null))} /> : <ScrollEdgeFade><FlatList
      data={profile.presets} keyExtractor={(preset) => preset.id} contentContainerStyle={styles.list} alwaysBounceVertical
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} colors={[colors.tint]} tintColor={colors.tint} progressBackgroundColor={colors.surface} />}
      ListHeaderComponent={<View>
        <Text style={[styles.heading, { color: colors.text }]}>숨김 프리셋</Text>
        <Text style={[styles.note, { color: colors.muted }]}>여러 프리셋을 함께 켤 수 있습니다. 보관함·검색·앨범·아티스트에서 총 {hiddenCount}곡을 숨기고 있습니다.</Text>
        <View style={[styles.lockRow, { backgroundColor: colors.surface, borderColor: colors.separator }]}><Ionicons name="finger-print" size={29} color={busy ? colors.muted : colors.tint} /><View style={styles.identity}><Text style={[styles.title, { color: busy ? colors.muted : colors.text }]}>지문 · 기기 암호로 설정 잠금</Text><Text style={[styles.detail, { color: colors.muted }]}>휴대전화의 PIN·암호·패턴도 사용할 수 있습니다. 플레이리스트 숨김과 잠금을 공유하며 화면을 나가면 다시 잠급니다.</Text></View><Switch accessibilityLabel="숨김 설정 지문 또는 기기 암호 잠금" value={profile.biometricLock} disabled={busy} onValueChange={(enabled) => void run(() => setBiometricLock(enabled))} trackColor={{ false: colors.separator, true: colors.tint }} thumbColor="#FFFFFF" ios_backgroundColor={colors.separator} /></View>
        {(message || error) && <Text style={[styles.note, { color: colors.tint }]}>{message ?? error}</Text>}
        {query.data?.stale && <Text style={[styles.note, { color: colors.muted }]}>오프라인 목록입니다. 폴더와 곡 선택이 최신 상태가 아닐 수 있습니다.</Text>}
        {query.isRefetchError && <Pressable onPress={() => void query.refetch()}><Text style={[styles.note, { color: colors.tint }]}>{query.error.message} · 다시 시도</Text></Pressable>}
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setMessage(null); setDraft({ id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10), name: '', enabled: true, songIds: [], folders: [] }); }} style={[styles.create, { backgroundColor: busy ? colors.separator : colors.tint }]}><Ionicons name="add" size={22} color={busy ? colors.muted : 'white'} /><Text style={[styles.createText, busy && { color: colors.muted }]}>프리셋 만들기</Text></Pressable>
      </View>}
      ListEmptyComponent={<Text style={[styles.empty, { color: colors.muted }]}>아직 프리셋이 없습니다.{'\n'}폴더나 곡을 골라 첫 목록을 만들어 보세요.</Text>}
      ListFooterComponent={<Text style={[styles.note, { color: colors.muted, marginTop: 25 }]}>이 기기의 현재 NAS 계정에만 적용합니다. NAS 파일은 삭제하거나 변경하지 않습니다. 선택한 폴더의 새 곡은 목록을 새로 받은 뒤 자동으로 숨깁니다.</Text>}
      renderItem={({ item }) => <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.separator }]}>
        <View style={styles.cardTop}><View style={styles.identity}><Text style={[styles.title, { color: busy ? colors.muted : colors.text }]}>{item.name}</Text><Text style={[styles.detail, { color: colors.muted }]}>폴더 {item.folders.length}개 · 곡 {item.songIds.length}개</Text></View><Switch accessibilityLabel={item.name + ' 프리셋 적용'} value={item.enabled} disabled={busy} onValueChange={() => void run(() => togglePreset(item.id))} trackColor={{ false: colors.separator, true: colors.tint }} thumbColor="#FFFFFF" ios_backgroundColor={colors.separator} /></View>
        <View style={styles.actions}><Pressable disabled={busy} onPress={() => { setMessage(null); setDraft({ ...item, songIds: [...item.songIds], folders: [...item.folders] }); }} style={styles.action}><Ionicons name="pencil-outline" size={17} color={busy ? colors.muted : colors.tint} /><Text style={{ color: busy ? colors.muted : colors.tint }}>선택 목록 편집</Text></Pressable><Pressable disabled={busy} onPress={() => remove(item)} style={styles.action}><Ionicons name="trash-outline" size={17} color={colors.muted} /><Text style={{ color: colors.muted }}>삭제</Text></Pressable></View>
      </View>}
    /></ScrollEdgeFade>}
  </AsyncState>;
}

const styles = StyleSheet.create({
  list: { flexGrow: 1, padding: 22, paddingTop: 16, paddingBottom: 40 }, heading: { fontSize: 26, fontWeight: '800', marginBottom: 10 }, note: { fontSize: 13, lineHeight: 20, marginBottom: 14 },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 20 }, identity: { flex: 1, gap: 5 },
  title: { fontSize: 16, fontWeight: '700' }, detail: { fontSize: 12, lineHeight: 18 }, create: { height: 48, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 22 }, createText: { color: 'white', fontSize: 15, fontWeight: '700' },
  card: { padding: 16, borderWidth: 1, borderRadius: 14, marginBottom: 12 }, cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 }, actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 13 }, action: { flexDirection: 'row', gap: 6, paddingVertical: 7 }, empty: { textAlign: 'center', lineHeight: 23, paddingVertical: 30 },
});
