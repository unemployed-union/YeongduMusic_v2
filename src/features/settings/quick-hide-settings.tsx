import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AnimatedSwitch } from '@/components/animated-switch';
import { useHiddenFeatureAccess } from '@/stores/hidden-feature-access';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import { useColors } from '@/theme/tokens';
import { settingsMenuStyles, useSettingsMenuIconStyle } from './settings-menu-layout';
import { SettingsLink } from './settings-ui';

export function QuickHideSettings() {
  const colors = useColors();
  const iconStyle = useSettingsMenuIconStyle(colors.tint);
  const access = useHiddenFeatureAccess();
  const privacy = useHiddenMusicStore();
  const selected = privacy.profile.presets.find(preset => preset.id === privacy.profile.quickHidePresetId);
  const separator = { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator };
  const allDisabled = !access.ready || access.quickHideMode === 'preset';
  const presetDisabled = !access.ready || !privacy.ready || access.quickHideMode === 'all' || (!selected && access.quickHideMode !== 'preset');
  return <View>
    <View style={settingsMenuStyles.row}>
      <View style={iconStyle}><Ionicons name="eye-off-outline" size={23} color={allDisabled ? colors.muted : colors.tint} /></View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: allDisabled ? colors.muted : colors.text }]}>5번 눌러 전체 프리셋 숨기기</Text>
        <Text style={[styles.hint, { color: colors.muted }]}>{access.quickHideMode === 'preset' ? '특정 프리셋 숨기기를 먼저 끄면 켤 수 있습니다.' : '메인 화면의 설정 버튼을 빠르게 5번 누르면 모든 음악 숨김 프리셋과 선택한 플레이리스트를 숨기고 기타 메뉴를 숨깁니다.'}</Text>
      </View>
      <AnimatedSwitch accessibilityLabel="설정 버튼 5번 눌러 전체 프리셋 숨기기" value={access.quickHideMode === 'all'} disabled={allDisabled} busy={access.busy}
        onValueChange={enabled => { if (!allDisabled && !access.busy) void access.setQuickHideEnabled(enabled); }} trackColor={{ false: colors.separator, true: colors.tint }} />
    </View>
    <View style={[settingsMenuStyles.row, separator]}>
      <View style={iconStyle}><Ionicons name="eye-off-outline" size={23} color={presetDisabled ? colors.muted : colors.tint} /></View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: presetDisabled ? colors.muted : colors.text }]}>5번 눌러 특정 프리셋 숨기기</Text>
        <Text style={[styles.hint, { color: colors.muted }]}>{access.quickHideMode === 'all' ? '전체 프리셋 숨기기를 먼저 끄면 켤 수 있습니다.' : !selected ? '빠른 숨기기에 사용할 프리셋을 먼저 선택해 주세요.' : '선택한 음악 숨김 프리셋과 플레이리스트를 함께 숨기고 기타 메뉴를 숨깁니다. 선택하지 않은 항목의 숨김 상태는 유지합니다.'}</Text>
      </View>
      <AnimatedSwitch accessibilityLabel="설정 버튼 5번 눌러 특정 프리셋 숨기기" value={access.quickHideMode === 'preset'}
        disabled={presetDisabled} busy={access.busy || privacy.busy}
        onValueChange={enabled => { if (!presetDisabled && !access.busy && !privacy.busy) void access.setQuickHideMode(enabled ? 'preset' : 'off'); }} trackColor={{ false: colors.separator, true: colors.tint }} />
    </View>
    <View style={separator}><SettingsLink title="빠른 숨기기 대상 선택" icon="options-outline" href="/settings/quick-hide-preset"
      disabled={!privacy.ready || !privacy.scope} busy={privacy.busy || access.busy}
      description={!privacy.scope ? 'NAS 계정에 연결한 후 선택할 수 있습니다.' : privacy.profile.biometricLock && !privacy.unlocked ? '인증 후 음악 프리셋과 플레이리스트를 선택할 수 있습니다.' : `${selected?.name ?? '음악 프리셋 미선택'} · 플레이리스트 ${privacy.profile.quickHidePlaylistIds?.length ?? 0}개 선택`} /></View>
    {access.error && <Text accessibilityRole="alert" style={[styles.error, { color: colors.tint }]}>{access.error}</Text>}
  </View>;
}
const styles = StyleSheet.create({
  copy: { flex: 1 }, title: { fontSize: 16, fontWeight: '600' }, hint: { fontSize: 12, lineHeight: 18, marginTop: 6 },
  error: { fontSize: 12, lineHeight: 18, paddingHorizontal: 15, paddingBottom: 15 },
});
