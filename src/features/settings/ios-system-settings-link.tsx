import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '@/components/text';
import { useColors } from '@/theme/tokens';
import { playHaptic } from '@/services/haptics';
import { settingsMenuStyles, useSettingsMenuIconStyle } from './settings-menu-layout';
import { refreshIosSystemSettings, useIosSystemSettingsStatus } from './ios-system-settings';

export function IosSystemSettingsLink() {
  const colors = useColors(), iconStyle = useSettingsMenuIconStyle(colors.tint);
  const status = useIosSystemSettingsStatus();
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  return <View>
    <Pressable accessibilityRole="button" accessibilityLabel="iOS 설정에서 YeongduMusic 설정 열기" accessibilityState={{ disabled: busy, busy }} disabled={busy}
      style={settingsMenuStyles.row} onPress={() => {
        playHaptic('menu'); setBusy(true); setError(null);
        void refreshIosSystemSettings().then(() => Linking.openSettings()).catch(() => setError('iOS 설정을 열지 못했습니다. 설정 앱에서 YeongduMusic을 선택해 주세요.')).finally(() => setBusy(false));
      }}>
      <View style={iconStyle}><Ionicons name="settings-outline" size={23} color={colors.tint} /></View>
      <View style={{ flex: 1 }}><Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>iOS 앱 설정</Text>
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 5 }}>화면 모드 · 음질 · 앨범아트 · 햅틱 · 화면 효과</Text></View>
      {busy ? <ActivityIndicator color={colors.tint} /> : <Ionicons name="open-outline" size={19} color={colors.muted} />}
    </Pressable>
    {!!(error || status.error) && <View style={{ padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }}>
      <Text accessibilityRole="alert" style={{ color: colors.tint, fontSize: 13 }}>{error || status.error}</Text>
      {!!status.error && <Pressable accessibilityRole="button" onPress={() => void refreshIosSystemSettings()} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.tint }}>설정 다시 반영하기</Text></Pressable>}
    </View>}
  </View>;
}
