import { useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { ScrollEdgeFade } from '@/components/scroll-edge-fade';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import { usePlaylistStore } from '@/stores/playlists';
import { useColors } from '@/theme/tokens';
import type { HiddenPreset } from '@/types/hidden-music';
import type { PlaylistPreset } from '@/types/playlists';
import { settingsMenuStyles, useSettingsMenuIconStyle } from './settings-menu-layout';

type Choice = { kind: 'preset'; id: string; preset: HiddenPreset }
  | { kind: 'playlist'; id: string; playlist: PlaylistPreset }
  | { kind: 'heading'; id: string; title: string; detail: string }
  | { kind: 'empty-presets' | 'empty-playlists' | 'playlist-status'; id: string };

export function QuickHidePresetSettings() {
  const colors = useColors(), privacy = useHiddenMusicStore(), playlists = usePlaylistStore();
  const iconStyle = useSettingsMenuIconStyle(colors.tint);
  const playlistsReady = playlists.ready && playlists.scope === privacy.scope;
  const choices = useMemo<Choice[]>(() => [
    { kind: 'heading', id: 'music-heading', title: '음악 숨김 프리셋', detail: '‘특정 프리셋 숨기기’에서 적용할 프리셋을 하나 선택하세요.' },
    ...(privacy.profile.presets.length ? privacy.profile.presets.map(preset => ({ kind: 'preset' as const, id: 'preset:' + preset.id, preset })) : [{ kind: 'empty-presets' as const, id: 'empty-presets' }]),
    { kind: 'heading', id: 'playlist-heading', title: '함께 숨길 플레이리스트', detail: '전체·특정 프리셋 숨기기 모두에서 함께 숨길 목록을 선택하세요. 목록에 포함된 곡을 별도로 숨기지는 않습니다.' },
    ...(!playlistsReady ? [{ kind: 'playlist-status' as const, id: 'playlist-status' }]
      : playlists.profile.presets.length ? playlists.profile.presets.map(playlist => ({ kind: 'playlist' as const, id: 'playlist:' + playlist.id, playlist }))
      : [{ kind: 'empty-playlists' as const, id: 'empty-playlists' }]),
  ], [privacy.profile.presets, playlistsReady, playlists.profile.presets]);
  async function select(id: string) {
    try { await privacy.setQuickHidePreset(id); }
    catch { /* The store exposes the saved error for retry. */ }
  }
  async function selectPlaylist(id: string) {
    const current = useHiddenMusicStore.getState(), lists = usePlaylistStore.getState();
    if (!lists.ready || lists.scope !== current.scope || current.scope !== privacy.scope || !lists.profile.presets.some(item => item.id === id)) return;
    try { await current.setQuickHidePlaylist(id, !current.profile.quickHidePlaylistIds?.includes(id)); }
    catch { /* The store exposes the saved error for retry. */ }
  }
  return <ScrollEdgeFade><FlatList style={styles.fill} data={choices} extraData={privacy.profile}
    keyExtractor={item => item.id} contentContainerStyle={styles.list}
    ListHeaderComponent={<View>
      <Text style={[styles.note, { color: colors.muted }]}>설정 버튼을 빠르게 5번 눌렀을 때 숨길 대상을 정합니다. 선택만으로 음악이나 플레이리스트가 숨겨지지는 않습니다. 기타 설정에서 빠른 숨기기를 켜 주세요.</Text>
      {privacy.error && <Text accessibilityRole="alert" style={[styles.note, { color: colors.tint }]}>{privacy.error}</Text>}
    </View>}
    renderItem={({ item }) => {
      if (item.kind === 'heading') return <View><Text style={[styles.sectionTitle, { color: colors.text }]}>{item.title}</Text><Text style={[styles.note, { color: colors.muted }]}>{item.detail}</Text></View>;
      if (item.kind === 'empty-presets') return <View>
        <Text style={[styles.note, { color: colors.muted }]}>저장된 프리셋이 없습니다. 음악 숨기기에서 프리셋을 먼저 만들어 주세요.</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push('/hidden-music')} style={styles.create}><Text style={{ color: colors.tint }}>음악 숨기기 열기</Text></Pressable>
      </View>;
      if (item.kind === 'empty-playlists') return <Text style={[styles.note, { color: colors.muted }]}>저장된 플레이리스트가 없습니다. 플레이리스트 탭에서 목록을 먼저 만들어 주세요.</Text>;
      if (item.kind === 'playlist-status') return <View style={styles.status}>{playlists.error ? <>
        <Text accessibilityRole="alert" style={[styles.note, { color: colors.tint }]}>{playlists.error}</Text>
        <Pressable accessibilityRole="button" onPress={() => void playlists.load(privacy.scope)} style={styles.create}><Text style={{ color: colors.tint }}>플레이리스트 다시 불러오기</Text></Pressable>
      </> : <ActivityIndicator color={colors.tint} />}</View>;
      if (item.kind !== 'preset' && item.kind !== 'playlist') return null;
      const preset = item.kind === 'preset' ? item.preset : null, playlist = item.kind === 'playlist' ? item.playlist : null;
      const selected = preset ? privacy.profile.quickHidePresetId === preset.id : privacy.profile.quickHidePlaylistIds?.includes(playlist!.id) ?? false;
      const disabled = privacy.busy || !!playlist && playlists.busy;
      return <Pressable accessibilityRole={preset ? 'radio' : 'checkbox'} accessibilityLabel={preset ? preset.name : playlist!.name + ' 빠른 숨기기에 포함'} accessibilityState={{ checked: selected, disabled }} disabled={disabled}
        onPress={() => { if (preset) void select(preset.id); else void selectPlaylist(playlist!.id); }} style={[settingsMenuStyles.row, styles.card, { backgroundColor: colors.surface, borderColor: selected && !disabled ? colors.tint : colors.separator }]}>
        <View style={iconStyle}><Ionicons name={preset ? selected ? 'radio-button-on' : 'radio-button-off' : selected ? 'checkbox' : 'square-outline'} size={23} color={selected && !disabled ? colors.tint : colors.muted} /></View>
        <View style={styles.fill}><Text style={[styles.title, { color: disabled ? colors.muted : colors.text }]}>{preset?.name ?? playlist!.name}</Text>
          <Text style={[styles.detail, { color: colors.muted }]}>{preset ? '폴더 ' + preset.folders.length + '개 · 곡 ' + preset.songIds.length + '개' : '곡 ' + playlist!.songIds.length + '개 · ' + (privacy.profile.hiddenPlaylistIds?.includes(playlist!.id) ? '현재 숨김' : '현재 표시')}</Text>
        </View>
      </Pressable>;
    }}
  /></ScrollEdgeFade>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 }, list: { flexGrow: 1, padding: 22, paddingTop: 16, paddingBottom: 32 },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginTop: 10, marginBottom: 8 }, status: { paddingVertical: 16 },
  note: { fontSize: 13, lineHeight: 20, marginBottom: 18 }, card: { borderWidth: 1, borderRadius: 15, marginBottom: 12 },
  title: { fontSize: 16, fontWeight: '600' }, detail: { fontSize: 12, lineHeight: 18, marginTop: 5 }, create: { minHeight: 48, justifyContent: 'center' },
});
