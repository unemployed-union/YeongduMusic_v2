import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AnimatedSwitch } from '@/components/animated-switch';
import { SettingsPage, SettingsSection } from '@/features/settings/settings-ui';
import { settingsMenuStyles } from '@/features/settings/settings-menu-layout';
import { useHiddenFeatureAccess } from '@/stores/hidden-feature-access';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import { usePlaylistStore } from '@/stores/playlists';
import { createPlaylistBackup, restorePlaylistBackup } from '@/services/playlists/backup';
import { useColors } from '@/theme/tokens';
import { pickPlaylistBackup, savePlaylistBackup } from './backup-files';
import { playlistStorageScope } from './rules';
import type { PlaylistBackup } from './backup-format';

export function PlaylistBackupSettings() {
  const colors = useColors(), playlists = usePlaylistStore(), privacy = useHiddenMusicStore(), access = useHiddenFeatureAccess();
  const loadAccess = access.load;
  useEffect(() => { void loadAccess(); }, [loadAccess]);
  const [includeHidden, setIncludeHidden] = useState(false);
  const [selected, setSelected] = useState<{ name: string; backup: PlaylistBackup } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [message, setMessage] = useState<string | null>(null);
  const running = useRef(false);
  const unavailable = !playlists.ready || !privacy.ready || playlists.scope !== privacy.scope;
  const disabled = busy || playlists.busy || privacy.busy || access.busy || unavailable;
  const wrongAccount = !!selected && selected.backup.scope !== playlistStorageScope(playlists.scope);
  const protectedRestore = !!selected && (selected.backup.hiddenPlaylistIds.length > 0 || selected.backup.playlists.presets.some(preset => privacy.profile.hiddenPlaylistIds?.includes(preset.id)));
  const restoreDisabled = disabled || wrongAccount || protectedRestore && (!access.ready || !access.enabled || access.busy);
  async function run(operation: () => Promise<void>) {
    if (running.current) return;
    running.current = true; setBusy(true); setError(null); setMessage(null);
    try { await operation(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '작업을 완료하지 못했습니다. 다시 시도해 주세요.'); }
    finally { running.current = false; setBusy(false); }
  }
  function backup() {
    if (disabled) return;
    void run(async () => {
      const text = await createPlaylistBackup(!!playlists.scope && access.ready && access.enabled && includeHidden);
      const name = await savePlaylistBackup(text);
      if (name) setMessage((Platform.OS === 'web' ? '백업 파일 다운로드를 요청했습니다.' : '선택한 폴더에 플레이리스트 백업을 저장했습니다.') + '\n' + name);
    });
  }
  function choose() {
    if (running.current) return;
    setSelected(null);
    void run(async () => { const result = await pickPlaylistBackup(); if (result) setSelected(result); });
  }
  function restore() {
    if (!selected || restoreDisabled) return;
    void run(async () => {
      const count = await restorePlaylistBackup(selected.backup);
      setSelected(null); setMessage(`플레이리스트 ${count}개를 복구했습니다.`);
    });
  }
  return <SettingsPage>
    <Text style={[styles.note, { color: colors.muted }]}>현재 보관함의 플레이리스트 이름과 곡 순서를 파일로 백업합니다. NAS 없이 Google Drive·기기 음악으로 만든 목록도 저장하고 복구할 수 있습니다. NAS 연결 중에는 해당 계정의 목록을 백업하며 같은 서버·계정에서 복구합니다. 음악 파일과 로그인 암호·인증 토큰은 포함하지 않습니다.</Text>
    {unavailable && <View style={styles.feedback}>
      <Text style={[styles.note, { color: colors.muted }]}>{playlists.error ?? privacy.error ?? '플레이리스트를 불러오는 중입니다.'}</Text>
      {!!playlists.error && <Pressable accessibilityRole="button" disabled={busy || playlists.busy} onPress={() => void playlists.load(playlists.scope)} style={styles.retry}><Text style={{ color: busy || playlists.busy ? colors.muted : colors.tint }}>플레이리스트 다시 불러오기</Text></Pressable>}
    </View>}
    <SettingsSection title="백업">
      {!!playlists.scope && access.ready && access.enabled && Platform.OS !== 'web' && <View style={settingsMenuStyles.row}>
        <View style={settingsMenuStyles.icon}><Ionicons name="eye-off-outline" size={23} color={disabled ? colors.muted : colors.tint} /></View>
        <View style={styles.copy}><Text style={[styles.title, { color: disabled ? colors.muted : colors.text }]}>숨긴 플레이리스트 포함</Text><Text style={[styles.detail, { color: colors.muted }]}>숨김 목록과 숨김 상태도 저장합니다. 잠겨 있으면 기기 인증이 필요합니다.</Text></View>
        <AnimatedSwitch accessibilityLabel="백업에 숨긴 플레이리스트 포함" value={includeHidden} disabled={disabled || access.busy} onValueChange={setIncludeHidden} trackColor={{ false: colors.separator, true: colors.tint }} />
      </View>}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={backup} style={settingsMenuStyles.row}>
        <View style={settingsMenuStyles.icon}><Ionicons name="download-outline" size={23} color={disabled ? colors.muted : colors.tint} /></View>
        <View style={styles.copy}><Text style={[styles.title, { color: disabled ? colors.muted : colors.text }]}>플레이리스트 백업하기</Text><Text style={[styles.detail, { color: colors.muted }]}>{Platform.OS === 'web' ? '백업 파일 다운로드' : '저장할 폴더 선택'}</Text></View>
        <Ionicons name="chevron-forward" size={19} color={colors.muted} />
      </Pressable>
    </SettingsSection>
    <Text style={[styles.note, { color: colors.muted }]}>백업은 내용을 읽을 수 있는 JSON 파일입니다. 기본으로 표시 중인 플레이리스트만 저장합니다.</Text>
    <SettingsSection title="복구">
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={choose} style={settingsMenuStyles.row}>
        <View style={settingsMenuStyles.icon}><Ionicons name="folder-open-outline" size={23} color={busy ? colors.muted : colors.tint} /></View>
        <View style={styles.copy}><Text style={[styles.title, { color: busy ? colors.muted : colors.text }]}>플레이리스트 백업 파일 선택</Text><Text style={[styles.detail, { color: colors.muted }]}>파일을 검사한 뒤 복구할 내용을 확인합니다.</Text></View>
        <Ionicons name="chevron-forward" size={19} color={colors.muted} />
      </Pressable>
    </SettingsSection>
    {selected && <View style={[styles.preview, { backgroundColor: colors.surface, borderColor: colors.separator }]}>
      <Text style={[styles.title, { color: colors.text }]}>{selected.name}</Text>
      <Text style={[styles.detail, { color: colors.muted }]}>백업 날짜: {new Date(selected.backup.exportedAt).toLocaleString()}{'\n'}플레이리스트 {selected.backup.playlists.presets.length}개 · 수록곡 {selected.backup.playlists.presets.reduce((total, preset) => total + preset.songIds.length, 0)}곡</Text>
      <Text style={[styles.note, { color: colors.muted, marginTop: 16 }]}>기존 목록을 유지하고, 같은 목록은 백업의 이름과 곡 순서로 갱신합니다. 없는 목록은 추가하며 이름이 겹치면 ‘복구’ 번호를 붙입니다. 현재 숨김 상태를 유지하고 백업에서 숨긴 목록도 숨깁니다. 음악 파일은 복구하지 않습니다. 기기 음악은 다시 가져오고 Google Drive·NAS 음악은 원래 계정의 보관함에 연결하면 표시됩니다.</Text>
      {wrongAccount && <Text accessibilityRole="alert" style={[styles.note, { color: colors.muted }]}>백업과 같은 보관함에서 복구해 주세요. 기기 백업은 NAS 미연결 상태에서, NAS 백업은 같은 서버·계정에서 복구할 수 있습니다.</Text>}
      {protectedRestore && <Text style={[styles.note, { color: colors.muted }]}>숨긴 플레이리스트가 포함되어 있습니다. 기타 설정을 활성화해야 하며, 잠겨 있으면 기기 인증이 필요합니다.</Text>}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: restoreDisabled }} disabled={restoreDisabled} onPress={restore} style={[styles.button, { backgroundColor: restoreDisabled ? colors.separator : colors.tint }]}><Text style={[styles.buttonText, restoreDisabled && { color: colors.muted }]}>플레이리스트 복구하기</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => setSelected(null)} style={styles.retry}><Text style={{ color: colors.muted }}>취소</Text></Pressable>
    </View>}
    {busy && <ActivityIndicator accessibilityLabel="플레이리스트 백업 또는 복구 중" color={colors.tint} style={styles.feedback} />}
    {error && <Text accessibilityRole="alert" style={[styles.feedback, { color: colors.tint }]}>{error}</Text>}
    {message && <Text accessibilityLiveRegion="polite" style={[styles.feedback, { color: colors.text }]}>{message}</Text>}
  </SettingsPage>;
}

const styles = StyleSheet.create({
  note: { fontSize: 13, lineHeight: 20, marginBottom: 18 }, copy: { flex: 1 }, title: { fontSize: 16, fontWeight: '600' }, detail: { fontSize: 12, lineHeight: 18, marginTop: 6 },
  preview: { padding: 18, borderWidth: 1, borderRadius: 15 }, button: { minHeight: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  buttonText: { color: 'white', fontSize: 15, fontWeight: '700' }, retry: { minHeight: 44, alignItems: 'center', justifyContent: 'center' }, feedback: { marginVertical: 14 },
});
