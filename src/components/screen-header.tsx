import type { ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '@/components/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/theme/tokens';
import { workspaceLayout } from '@/theme/layout';
import { useLiquidGlass } from '@/theme/liquid-glass';

export function ScreenHeader({
  title,
  children,
  action,
  bottomSpacing = 22,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  bottomSpacing?: number;
}) {
  const colors = useColors();
  const glass = useLiquidGlass();
  const insets = useSafeAreaInsets();
  const { width, height, fontScale } = useWindowDimensions();
  if (workspaceLayout(width, height, fontScale).expanded) {
    return null;
  }

  return (
    <View style={[styles.header, { paddingTop: insets.top + 16, paddingBottom: bottomSpacing }]}>
      <View style={styles.titleRow}>
        <Text
          accessibilityRole="header"
          style={[
            styles.title,
            { color: colors.text },
            glass.supported && { fontWeight: '700', letterSpacing: -1.2 },
          ]}
        >
          {title}
        </Text>
        {action}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 22, paddingBottom: 22 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: {
    flex: 1,
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: -1.6,
    lineHeight: 46,
    includeFontPadding: false,
  },
});
