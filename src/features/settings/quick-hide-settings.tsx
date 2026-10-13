import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AnimatedSwitch } from '@/components/animated-switch';
import { useHiddenFeatureAccess } from '@/stores/hidden-feature-access';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import { useColors } from '@/theme/tokens';
import { settingsMenuStyles } from './settings-menu-layout';
import { SettingsLink } from './settings-ui';

export function QuickHideSettings() {
  const colors = useColors();
  const access = useHiddenFeatureAccess();
  const privacy = useHiddenMusicStore();
  const selected = privacy.profile.presets.find(preset => preset.id === privacy.profile.quickHidePresetId);
  const separator = { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator };
  const allDisabled = !access.ready || access.busy || access.quickHideMode === 'preset';
  const presetDisabled = !access.ready || access.busy || !privacy.ready || privacy.busy || access.quickHideMode === 'all' || (!selected && access.quickHideMode !== 'preset');
  return <View>
    <View style={settingsMenuStyles.row}>
      <View style={settingsMenuStyles.icon}><Ionicons name="eye-off-outline" size={23} color={allDisabled ? colors.muted : colors.tint} /></View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: allDisabled ? colors.muted : colors.text }]}>5번 눌러 전체 프리셋 숨기기</Text>
        <Text style={[styles.hint, { color: colors.muted }]}>{access.quickHideMode === 'preset' ? '특정 프리셋 숨기기를 먼저 끄면 켤 수 있습니다.' : '메인 화면의 설정 버튼을 빠르게 5번 누르면 모든 음악 숨김 프리셋을 적용하고 기타 메뉴를 숨깁니다.'}</Text>
      </View>
      <AnimatedSwitch accessibilityLabel="설정 버튼 5번 눌러 전체 프리셋 숨기기" value={access.quickHideMode === 'all'} disabled={allDisabled}
        onValueChange={enabled => { if (!allDisabled) void access.setQuickHideEnabled(enabled); }} trackColor={{ false: colors.separator, true: colors.tint }} />
    </View>
    <View style={[settingsMenuStyles.row, separator]}>
      <View style={settingsMenuStyles.icon}><Ionicons name="eye-off-outline" size={23} color={presetDisabled ? colors.muted : colors.tint} /></View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: presetDisabled ? colors.muted : colors.text }]}>5번 눌러 특정 프리셋 숨기기</Text>
        <Text style={[styles.hint, { color: colors.muted }]}>{access.quickHideMode === 'all' ? '전체 프리셋 숨기기를 먼저 끄면 켤 수 있습니다.' : !selected ? '빠른 숨기기에 사용할 프리셋을 먼저 선택해 주세요.' : '선택한 음악 숨김 프리셋을 적용하고 기타 메뉴를 숨깁니다. 다른 프리셋과 플레이리스트의 숨김 상태는 유지합니다.'}</Text>
      </View>
      <AnimatedSwitch accessibilityLabel="설정 버튼 5번 눌러 특정 프리셋 숨기기" value={access.quickHideMode === 'preset'}
        disabled={presetDisabled}
        onValueChange={enabled => { if (!presetDisabled) void access.setQuickHideMode(enabled ? 'preset' : 'off'); }} trackColor={{ false: colors.separator, true: colors.tint }} />
    </View>
    <View style={separator}><SettingsLink title="빠른 숨기기 프리셋 선택" icon="options-outline" href="/settings/quick-hide-preset"
      disabled={!privacy.ready || !privacy.scope || privacy.busy || access.busy}
      description={!privacy.scope ? 'NAS 계정에 연결한 후 선택할 수 있습니다.' : selected ? privacy.profile.biometricLock && !privacy.unlocked ? '프리셋이 선택되어 있습니다. 인증 후 변경할 수 있습니다.' : selected.name : '특정 프리셋 숨기기에 사용할 프리셋을 먼저 선택해 주세요.'} /></View>
    {access.error && <Text accessibilityRole="alert" style={[styles.error, { color: colors.tint }]}>{access.error}</Text>}
  </View>;
}
const styles = StyleSheet.create({
  copy: { flex: 1 }, title: { fontSize: 16, fontWeight: '600' }, hint: { fontSize: 12, lineHeight: 18, marginTop: 6 },
  error: { fontSize: 12, lineHeight: 18, paddingHorizontal: 15, paddingBottom: 15 },
});
