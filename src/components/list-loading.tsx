import { useContext } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/theme/tokens';
import { TabBarInsetContext } from './tab-bar-inset';

/** Fill the list area below its controls and above the visible tab bar. */
export function ListLoading() {
  const colors = useColors();
  const bottomInset = useContext(TabBarInsetContext);
  return <View pointerEvents="none" accessibilityLiveRegion="polite" style={[styles.center, { marginBottom: bottomInset }]}>
    <ActivityIndicator color={colors.tint} />
    <Text style={[styles.message, { color: colors.muted }]}>가져오는 중…</Text>
  </View>;
}
const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
  message: { fontSize: 15, textAlign: 'center' },
});
