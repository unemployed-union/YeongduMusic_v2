import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/theme/tokens';

export function ScreenHeader({ title, children }: { title: string; children?: ReactNode }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
    <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{title}</Text>
    {children}
  </View>;
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 22, paddingBottom: 22 },
  title: { fontSize: 38, fontWeight: '800', letterSpacing: -1.6, lineHeight: 46, includeFontPadding: false },
});
