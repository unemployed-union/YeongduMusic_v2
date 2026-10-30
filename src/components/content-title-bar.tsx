import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/text';
import { useColors } from '@/theme/tokens';
import { useLiquidGlass } from '@/theme/liquid-glass';

/** Render inside the content pane, alongside rather than above the sidebar. */
export function ContentTitleBar({
  title,
  action,
  maxWidth,
}: {
  title: string;
  action?: ReactNode;
  maxWidth?: number;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const glass = useLiquidGlass();
  return (
    <View
      style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: colors.background }]}
    >
      <View style={[styles.row, { maxWidth }]}>
        <Text
          accessibilityRole="header"
          style={[
            styles.title,
            { color: colors.text },
            glass.supported && {
              fontSize: 26,
              lineHeight: 34,
              fontWeight: '700',
              letterSpacing: -0.6,
            },
          ]}
        >
          {title}
        </Text>
        {action}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexShrink: 0, paddingBottom: 18 },
  row: {
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 22,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: { flex: 1, fontSize: 22, lineHeight: 29, fontWeight: '800' },
});
