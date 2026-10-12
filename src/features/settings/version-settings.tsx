import { useCallback, useEffect } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import Ionicons from '@expo/vector-icons/Ionicons';
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
    <Pressable accessibilityRole="button" accessibilityLabel={`버전 ${version}`} disabled={!ready || busy} onPress={() => void onPress()} style={styles.row}>
      <View style={styles.icon}><Ionicons name="information-circle-outline" size={23} color={colors.tint} /></View>
      <Text style={[styles.label, { color: colors.text }]}>버전</Text>
      <Text style={[styles.version, { color: colors.muted }]}>{version}</Text>
    </Pressable>
    {error && <Text accessibilityRole="alert" style={[styles.error, { color: colors.tint }]}>{error}</Text>}
  </View>;
}
const styles = StyleSheet.create({
  // Match the visible icon's inset (a 23px glyph centered in a 28px slot).
  row: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 18, padding: 15, paddingRight: 15 + (28 - 23) / 2 },
  icon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontSize: 16, fontWeight: '600' }, version: { fontSize: 14, flexShrink: 1 }, error: { fontSize: 12, lineHeight: 18, paddingHorizontal: 15, paddingBottom: 15 },
});
