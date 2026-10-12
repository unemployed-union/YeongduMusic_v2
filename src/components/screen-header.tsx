import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/theme/tokens';

export function ScreenHeader({ title, children, action, bottomSpacing = 22 }: { title: string; children?: ReactNode; action?: ReactNode; bottomSpacing?: number }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return <View style={[styles.header, { paddingTop: insets.top + 16, paddingBottom: bottomSpacing }]}>
    <View style={styles.titleRow}><Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{title}</Text>{action}</View>
    {children}
  </View>;
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 22, paddingBottom: 22 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, fontSize: 38, fontWeight: '800', letterSpacing: -1.6, lineHeight: 46, includeFontPadding: false },
});
