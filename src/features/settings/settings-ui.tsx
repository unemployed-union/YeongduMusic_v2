import { Children, type ComponentProps, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { ScrollEdgeFade } from '@/components/scroll-edge-fade';
import { useColors } from '@/theme/tokens';
import { settingsMenuStyles } from './settings-menu-layout';
import { playHaptic } from '@/services/haptics';

export function SettingsPage({ children, overlay }: { children: ReactNode; overlay?: ReactNode }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <ScrollEdgeFade><KeyboardAwareScrollView style={{ flex: 1 }} bottomOffset={16} contentContainerStyle={[styles.screen, { paddingBottom: 24 + insets.bottom }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      {children}
    </KeyboardAwareScrollView></ScrollEdgeFade>
    {overlay}
  </View>;
}

export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  const colors = useColors();
  return <View style={styles.section}><Text style={[styles.heading, { color: colors.muted }]}>{title}</Text>
    <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.separator }]}>
      {Children.toArray(children).map((child, index) => <View key={index} style={index > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator } : undefined}>{child}</View>)}
    </View>
  </View>;
}

export function SettingsLink({ title, description, icon, href, disabled = false, busy = false }: {
  title: string; description?: string; icon: ComponentProps<typeof Ionicons>['name']; href: Href; disabled?: boolean; busy?: boolean;
}) {
  const colors = useColors();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || busy, ...(busy && { busy: true }) }} disabled={disabled || busy} onPress={() => { if (!disabled && !busy) { playHaptic('menu'); router.push(href); } }} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.55 : 1 }]}>
    <View style={styles.icon}><Ionicons name={icon} size={23} color={disabled ? colors.muted : colors.tint} /></View>
    <View style={styles.copy}><Text style={[styles.title, { color: disabled ? colors.muted : colors.text }]}>{title}</Text>
      {!!description && <Text numberOfLines={2} style={[styles.description, { color: colors.muted }]}>{description}</Text>}
    </View><Ionicons name="chevron-forward" size={19} color={colors.muted} />
  </Pressable>;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 22, paddingTop: 16 },
  section: { marginBottom: 24 },
  heading: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2, marginBottom: 12, marginTop: 0 },
  group: { borderWidth: 1, borderRadius: 15, overflow: 'hidden' },
  row: settingsMenuStyles.row,
  icon: settingsMenuStyles.icon,
  copy: { flex: 1 }, title: { fontSize: 16, fontWeight: '600' },
  description: { fontSize: 12, lineHeight: 18, marginTop: 5 },
});
