import { useCallback, useEffect } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import { useHiddenFeatureAccess } from '@/stores/hidden-feature-access';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import { useColors } from '@/theme/tokens';

export function VersionSettings() {
  const colors = useColors();
  const { ready, busy, error, load, tapVersion, resetTaps } = useHiddenFeatureAccess();
  useEffect(() => { void load(); }, [load]);
  useFocusEffect(useCallback(() => () => resetTaps(), [resetTaps]));
  const configuredVersion: unknown = Constants.expoConfig?.extra?.buildVersion;
  const version = typeof configuredVersion === 'string' ? configuredVersion : Constants.expoConfig?.version ?? '알 수 없음';
  async function onPress() {
    const enabled = await tapVersion();
    if (enabled === null) return;
    if (!enabled) useHiddenMusicStore.getState().lock();
    Alert.alert('설정', enabled ? '숨김 기능 메뉴를 켰습니다.' : '숨김 기능 메뉴를 감췄습니다. 기존 숨김 목록은 유지됩니다.');
  }
  return <View>
    <Pressable accessibilityRole="button" accessibilityLabel={`버전 ${version}`} disabled={!ready || busy} onPress={() => void onPress()} style={[styles.row, { borderBottomColor: colors.separator }]}>
      <Text style={[styles.label, { color: colors.text }]}>버전</Text>
      <Text style={[styles.version, { color: colors.muted }]}>{version}</Text>
    </Pressable>
    {error && <Text accessibilityRole="alert" style={[styles.error, { color: colors.tint }]}>{error}</Text>}
  </View>;
}
const styles = StyleSheet.create({
  row: { minHeight: 57, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, gap: 12, marginBottom: 14 },
  label: { fontSize: 16, fontWeight: '600' }, version: { fontSize: 14 }, error: { fontSize: 12, lineHeight: 18, marginBottom: 14 },
});
