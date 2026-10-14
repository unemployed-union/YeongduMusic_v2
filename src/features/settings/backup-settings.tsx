import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AnimatedSwitch } from '@/components/animated-switch';
import { useHiddenFeatureAccess } from '@/stores/hidden-feature-access';
import { useColors } from '@/theme/tokens';
import { createSettingsBackup, restoreSettingsBackup } from '@/services/settings-backup';
import { pickSettingsBackup, saveSettingsBackup } from './backup-files';
import type { SettingsBackup } from './backup-format';
import { settingsMenuStyles } from './settings-menu-layout';
import { SettingsPage, SettingsSection } from './settings-ui';
import { MENU_LABELS, visibleMenuIds } from './menu-layout';

export function BackupSettings() {
  const colors = useColors();
  const access = useHiddenFeatureAccess(), loadAccess = access.load;
  useEffect(() => { void loadAccess(); }, [loadAccess]);
  const [includeAccount, setIncludeAccount] = useState(false);
  const [restoreAccount, setRestoreAccount] = useState(false);
  const [selected, setSelected] = useState<{ name: string; backup: SettingsBackup } | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<string | null>(null), [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const restoreAccountDisabled = busy || Platform.OS === 'web';
  async function run(operation: () => Promise<void>) {
    if (running.current) return;
    running.current = true; setBusy(true); setError(null); setMessage(null);
    try { await operation(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '작업을 완료하지 못했습니다. 다시 시도해 주세요.'); }
    finally { running.current = false; setBusy(false); }
  }
  function backup() {
    void run(async () => {
      const text = await createSettingsBackup(access.enabled && includeAccount);
      const name = await saveSettingsBackup(text);
      if (name) setMessage(Platform.OS === 'web' ? '백업 파일 다운로드를 요청했습니다.\n' + name : '선택한 폴더에 백업을 저장했습니다.\n' + name);
    });
  }
  function choose() {
    setSelected(null); setRestoreAccount(false);
    void run(async () => {
      const result = await pickSettingsBackup();
      if (result) setSelected(result);
    });
  }
  function restore() {
    if (!selected) return;
    void run(async () => {
      await restoreSettingsBackup(selected.backup, restoreAccount);
      setSelected(null); setRestoreAccount(false); setMessage('설정을 복구했습니다. 변경한 설정이 바로 적용됩니다.');
    });
  }
  return <SettingsPage>
    <Text style={[styles.note, { color: colors.muted }]}>화면 모드·보관함 상세 화면·앨범 표시·앨범아트·스트리밍 음질·가져오기 제외 폴더를 파일로 백업합니다. 로그인 암호와 인증 정보, 음악 파일, 재생 중인 목록, 시스템 이퀄라이저 설정은 포함하지 않습니다.</Text>
    <SettingsSection title="백업">
      {access.ready && access.enabled && Platform.OS !== 'web' && <View style={settingsMenuStyles.row}>
        <View style={settingsMenuStyles.icon}><Ionicons name="options-outline" size={23} color={busy ? colors.muted : colors.tint} /></View>
        <View style={styles.copy}><Text style={[styles.title, { color: busy ? colors.muted : colors.text }]}>프리셋과 숨김 설정 포함</Text><Text style={[styles.detail, { color: colors.muted }]}>현재 NAS 계정의 음악·플레이리스트 프리셋, 잠금, 기타 메뉴와 빠른 숨기기 설정을 함께 저장합니다. 잠겨 있으면 기기 인증이 필요합니다.</Text></View>
        <AnimatedSwitch accessibilityLabel="백업에 프리셋과 숨김 설정 포함" value={includeAccount} disabled={busy} onValueChange={setIncludeAccount} trackColor={{ false: colors.separator, true: colors.tint }} />
      </View>}
      <Pressable accessibilityRole="button" disabled={busy} onPress={backup} style={settingsMenuStyles.row}>
        <View style={settingsMenuStyles.icon}><Ionicons name="download-outline" size={23} color={busy ? colors.muted : colors.tint} /></View>
        <View style={styles.copy}><Text style={[styles.title, { color: busy ? colors.muted : colors.text }]}>설정 백업하기</Text><Text style={[styles.detail, { color: colors.muted }]}>{Platform.OS === 'web' ? '설정 백업 파일 다운로드' : '저장할 폴더 선택'}</Text></View>
        <Ionicons name="chevron-forward" size={19} color={colors.muted} />
      </Pressable>
    </SettingsSection>
    <Text style={[styles.note, { color: colors.muted }]}>백업은 내용을 읽을 수 있는 JSON 파일입니다. 제외 폴더 경로와 포함한 프리셋 이름·숨김 목록이 저장되므로 개인적으로 보관해 주세요.</Text>
    <SettingsSection title="복구">
      <Pressable accessibilityRole="button" disabled={busy} onPress={choose} style={settingsMenuStyles.row}>
        <View style={settingsMenuStyles.icon}><Ionicons name="folder-open-outline" size={23} color={busy ? colors.muted : colors.tint} /></View>
        <View style={styles.copy}><Text style={[styles.title, { color: busy ? colors.muted : colors.text }]}>백업 파일 선택</Text><Text style={[styles.detail, { color: colors.muted }]}>파일을 검사한 뒤 복구할 내용을 확인합니다.</Text></View>
        <Ionicons name="chevron-forward" size={19} color={colors.muted} />
      </Pressable>
    </SettingsSection>
    {selected && <View style={[styles.preview, { backgroundColor: colors.surface, borderColor: colors.separator }]}>
      <Text style={[styles.title, { color: colors.text }]}>{selected.name}</Text>
      <Text style={[styles.detail, { color: colors.muted }]}>화면 모드: {selected.backup.preferences.themeMode === undefined ? '현재 설정 유지' : selected.backup.preferences.themeMode === 'dark' ? '다크' : selected.backup.preferences.themeMode === 'light' ? '화이트' : '자동'}</Text>
      <Text style={[styles.detail, { color: colors.muted }]}>보관함 상세 화면: {selected.backup.preferences.libraryDetails ? `아티스트 사진 ${selected.backup.preferences.libraryDetails.artistPhotos ? '켬' : '끔'} · 앨범 색상 ${selected.backup.preferences.libraryDetails.albumColors ? '켬' : '끔'}` : '현재 설정 유지'}</Text>
      <Text style={[styles.detail, { color: colors.muted }]}>백업 날짜: {new Date(selected.backup.exportedAt).toLocaleString()}{'\n'}앨범아트: {selected.backup.preferences.hideArtwork ? '숨김' : '표시'} · 폴더 앨범: {selected.backup.preferences.includeFolderAlbums ? '표시' : '숨김'}{'\n'}음질: {selected.backup.preferences.quality === 'mp3' ? 'MP3' : '원본'} · 제외 폴더 {selected.backup.preferences.excludedFolders.length}개</Text>
      {selected.backup.account && <View style={styles.option}>
        <View style={styles.copy}><Text style={[styles.title, { color: restoreAccountDisabled ? colors.muted : colors.text }]}>프리셋과 숨김 설정도 복구</Text><Text style={[styles.detail, { color: colors.muted }]}>음악 숨김 프리셋 {selected.backup.account.hidden.presets.length}개 · 플레이리스트 {selected.backup.account.playlists.presets.length}개. 같은 서버·NAS 계정에서만 복구할 수 있습니다. 기타 메뉴 활성화 상태와 빠른 숨기기 설정도 바뀝니다.</Text></View>
        <AnimatedSwitch accessibilityLabel="프리셋과 숨김 설정도 복구" value={restoreAccount} disabled={restoreAccountDisabled} onValueChange={setRestoreAccount} trackColor={{ false: colors.separator, true: colors.tint }} />
      </View>}
      {selected.backup.preferences.menus && <Text style={[styles.detail, { color: colors.muted }]}>하단 메뉴: {visibleMenuIds(selected.backup.preferences.menus.bottom).map(id => MENU_LABELS[id]).join(' → ')}{'\n'}보관함 메뉴: {visibleMenuIds(selected.backup.preferences.menus.library).map(id => MENU_LABELS[id]).join(' → ')}{'\n'}재생 화면 메뉴: {visibleMenuIds(selected.backup.preferences.menus.player).map(id => MENU_LABELS[id]).join(' → ')}</Text>}
      <Text style={[styles.note, { color: colors.muted, marginTop: 16 }]}>복구하면 위 설정을 백업 내용으로 덮어씁니다. 제외 폴더와 숨김 목록이 바뀌면 표시되는 음악도 바뀔 수 있습니다. 다른 기기에서는 제외 폴더 경로를 확인해 주세요.</Text>
      <Pressable accessibilityRole="button" disabled={busy} onPress={restore} style={[styles.button, { backgroundColor: busy ? colors.separator : colors.tint }]}><Text style={[styles.buttonText, busy && { color: colors.muted }]}>이 설정으로 복구하기</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setSelected(null); setRestoreAccount(false); }} style={styles.cancel}><Text style={{ color: colors.muted }}>취소</Text></Pressable>
    </View>}
    {busy && <ActivityIndicator accessibilityLabel="백업 또는 복구 중" color={colors.tint} style={styles.feedback} />}
    {error && <Text accessibilityRole="alert" style={[styles.feedback, { color: colors.tint }]}>{error}</Text>}
    {message && <Text accessibilityLiveRegion="polite" style={[styles.feedback, { color: colors.text }]}>{message}</Text>}
  </SettingsPage>;
}
const styles = StyleSheet.create({
  note: { fontSize: 13, lineHeight: 20, marginBottom: 18 }, copy: { flex: 1 }, title: { fontSize: 16, fontWeight: '600' }, detail: { fontSize: 12, lineHeight: 18, marginTop: 6 },
  preview: { padding: 18, borderWidth: 1, borderRadius: 15 }, option: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 20 },
  button: { minHeight: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }, buttonText: { color: 'white', fontSize: 15, fontWeight: '700' },
  cancel: { minHeight: 48, justifyContent: 'center', alignItems: 'center' }, feedback: { fontSize: 13, lineHeight: 20, marginVertical: 14 },
});
