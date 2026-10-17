import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from './text';
import { SidebarHeader } from './sidebar-header';
import { SettingsButton } from './settings-button';
import { useColors } from '@/theme/tokens';
import { useMenuPreferences } from '@/stores/menu-preferences';
import { BOTTOM_MENU_HREFS, MENU_LABELS, visibleMenuIds, type BottomMenuId } from '@/features/settings/menu-layout';
import { playHaptic } from '@/services/haptics';

const icons = { library: 'library-outline', playlists: 'musical-notes-outline', search: 'search-outline' } as const;
export function SidebarAppNavigation({ active, showSettings = true }: { active: BottomMenuId | 'settings'; showSettings?: boolean }) {
  const colors = useColors(), menu = useMenuPreferences(state => state.layout.bottom);
  return <View style={styles.navigation}>
    {visibleMenuIds(menu).map(id => <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: active === id }} onPress={() => {
      playHaptic('selection'); router.navigate(BOTTOM_MENU_HREFS[id]);
    }} style={({ pressed }) => [styles.item, { backgroundColor: active === id ? colors.tint + '18' : pressed ? colors.rowPressed : 'transparent' }]}>
      <Ionicons name={icons[id]} size={22} color={active === id ? colors.tint : colors.muted} /><Text style={[styles.label, { color: active === id ? colors.tint : colors.text }]}>{MENU_LABELS[id]}</Text>
    </Pressable>)}
    {showSettings && <SettingsButton label onOpen={() => router.navigate('/settings')} />}
    <View style={[styles.divider, { backgroundColor: colors.separator }]} />
  </View>;
}
export function TabletSidebar({ active, width, children, showSettings = true }: { active: BottomMenuId; width: number; children?: ReactNode; showSettings?: boolean }) {
  const colors = useColors();
  return <View style={[styles.sidebar, { width, backgroundColor: colors.surface, borderRightColor: colors.separator }]}>
    <SidebarHeader />
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <SidebarAppNavigation active={active} showSettings={showSettings} />{children}
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  sidebar: { flexGrow: 0, flexShrink: 0, borderRightWidth: StyleSheet.hairlineWidth }, content: { paddingHorizontal: 14, paddingBottom: 110 }, navigation: { gap: 4 },
  item: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12 }, label: { flex: 1, fontSize: 15, fontWeight: '700' },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 12, marginVertical: 18 },
});
