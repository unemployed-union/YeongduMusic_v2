import { Children, type ComponentProps, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '@/components/text';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { ScrollEdgeFade } from '@/components/scroll-edge-fade';
import { useColors } from '@/theme/tokens';
import { settingsMenuStyles, useSettingsMenuIconStyle } from './settings-menu-layout';
import { playHaptic } from '@/services/haptics';
import { workspaceLayout } from '@/theme/layout';
import { useLiquidGlass } from '@/theme/liquid-glass';

export function SettingsPage({
  children,
  overlay,
  overview = false,
}: {
  children: ReactNode;
  overlay?: ReactNode;
  overview?: boolean;
}) {
  const colors = useColors();
  const glass = useLiquidGlass();
  const insets = useSafeAreaInsets();
  const { width, height, fontScale } = useWindowDimensions();
  const layout = workspaceLayout(width - insets.left - insets.right, height, fontScale);
  const contentWidth = Math.min(1160, layout.contentWidth);
  const columns = overview && contentWidth >= 860 * Math.max(1, fontScale) ? 2 : 1;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        ...(glass.supported && { paddingLeft: insets.left, paddingRight: insets.right }),
      }}
    >
      <ScrollEdgeFade>
        <KeyboardAwareScrollView
          style={{ flex: 1 }}
          bottomOffset={16}
          contentContainerStyle={[
            styles.screen,
            { maxWidth: overview ? 1160 : 840, paddingBottom: 24 + insets.bottom },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={columns === 2 ? styles.cards : undefined}>
            {Children.toArray(children).map((child, index) => (
              <View
                key={index}
                style={columns === 2 ? { width: (contentWidth - 68) / 2 } : undefined}
              >
                {child}
              </View>
            ))}
          </View>
        </KeyboardAwareScrollView>
      </ScrollEdgeFade>
      {overlay}
    </View>
  );
}

export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  const colors = useColors();
  const glass = useLiquidGlass();
  return (
    <View style={[styles.section, glass.supported && { marginBottom: 28 }]}>
      <Text
        style={[
          styles.heading,
          { color: colors.muted },
          glass.supported && {
            fontSize: 13,
            fontWeight: '600',
            letterSpacing: 0,
            paddingHorizontal: 16,
          },
        ]}
      >
        {title}
      </Text>
      <View
        style={[
          styles.group,
          { backgroundColor: colors.surface, borderColor: colors.separator },
          glass.supported && { borderRadius: 24, borderWidth: 0 },
        ]}
      >
        {Children.toArray(children).map((child, index) => (
          <View key={index}>
            {glass.supported && index > 0 && (
              <View
                style={{
                  height: StyleSheet.hairlineWidth,
                  marginLeft: 64,
                  backgroundColor: colors.separator,
                }}
              />
            )}
            <View
              style={
                !glass.supported && index > 0
                  ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }
                  : undefined
              }
            >
              {child}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export function SettingsLink({
  title,
  description,
  icon,
  href,
  badge,
  disabled = false,
  busy = false,
}: {
  title: string;
  description?: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  href: Href;
  badge?: string;
  disabled?: boolean;
  busy?: boolean;
}) {
  const colors = useColors();
  const iconStyle = useSettingsMenuIconStyle(colors.tint);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, ...(busy && { busy: true }) }}
      disabled={disabled || busy}
      onPress={() => {
        if (!disabled && !busy) {
          playHaptic('menu');
          router.push(href);
        }
      }}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.55 : 1 }]}
    >
      <View style={iconStyle}>
        <Ionicons name={icon} size={23} color={disabled ? colors.muted : colors.tint} />
      </View>
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: disabled ? colors.muted : colors.text }]}>
            {title}
          </Text>
          {!!badge && (
            <View style={[styles.badge, { backgroundColor: colors.tint + '18' }]}>
              <Text style={[styles.badgeText, { color: colors.tint }]}>{badge}</Text>
            </View>
          )}
        </View>
        {!!description && (
          <Text numberOfLines={2} style={[styles.description, { color: colors.muted }]}>
            {description}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={19} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 22,
    paddingTop: 16,
    width: '100%',
    maxWidth: 840,
    alignSelf: 'center',
  },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' },
  section: { marginBottom: 24 },
  heading: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2, marginBottom: 12, marginTop: 0 },
  group: { borderWidth: 1, borderRadius: 15, overflow: 'hidden' },
  row: settingsMenuStyles.row,
  copy: { flex: 1 },
  title: { fontSize: 16, fontWeight: '600' },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: 8,
    rowGap: 4,
  },
  badge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  description: { fontSize: 12, lineHeight: 18, marginTop: 5 },
});
