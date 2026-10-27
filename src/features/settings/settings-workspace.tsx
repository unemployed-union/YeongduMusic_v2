import { isIosSystemSettingsAvailable } from './ios-system-settings';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router, type Href } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/text';
import { useColors } from '@/theme/tokens';
import { workspaceLayout } from '@/theme/layout';
import { useHiddenFeatureAccess } from '@/stores/hidden-feature-access';
import { playHaptic } from '@/services/haptics';
import { SETTINGS_NAVIGATION, selectedSettingsPath } from './settings-navigation';
import { SidebarHeader } from '@/components/sidebar-header';
import { ContentTitleBar } from '@/components/content-title-bar';
import { ContentTransition } from '@/components/content-transition';
import { SidebarAppNavigation } from '@/components/tablet-sidebar';
import { useSettingsMenuIconStyle } from './settings-menu-layout';

/** Keep the routed screen in the same child slot when the sidebar appears. */
export function SettingsWorkspace({ routeName, children }: { routeName: string; children: ReactNode }) {
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets(), colors = useColors();
  const iconStyle = useSettingsMenuIconStyle(colors.tint, null);
  const layout = workspaceLayout(width - insets.left - insets.right, height, fontScale);
  const enabled = useHiddenFeatureAccess(state => state.ready && state.enabled);
  const selected = selectedSettingsPath(routeName);
  const isSettings = routeName === 'settings' || routeName.startsWith('settings/') || routeName === 'hidden-music' || routeName === 'hidden-playlists';
  const expanded = isSettings && layout.expanded;
  const titles: Record<string, string> = { settings: '설정', 'settings/colors': '색상 설정', 'settings/player-menu': '재생 화면 메뉴', 'settings/cloud/synology': 'Synology', 'settings/cloud/google-drive': 'Google Drive', 'settings/cloud/s3': 'S3 호환 저장소', 'settings/cloud/mybox': '네이버 MYBOX', 'settings/quick-hide-preset': '빠른 숨기기 대상', 'hidden-music': '음악 숨기기', 'hidden-playlists': '플레이리스트 숨기기' };
  const title = titles[routeName] ?? SETTINGS_NAVIGATION.find(item => item.path === selected)?.title ?? '설정';
  const fullWidth = routeName === 'settings/licenses' || routeName === 'settings/quick-hide-preset' || routeName === 'hidden-music' || routeName === 'hidden-playlists';
  const titleMaxWidth = routeName === 'settings' ? 1160 : fullWidth ? undefined : 840;
  return <View style={[styles.frame, { backgroundColor: colors.background }, isSettings && { paddingLeft: insets.left, paddingRight: insets.right }]}>
    {expanded && <View style={[styles.sidebar, { width: layout.sidebarWidth, backgroundColor: colors.surface, borderRightColor: colors.separator }]}>
      <SidebarHeader />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <SidebarAppNavigation active="settings" showSettings={false} />
      {SETTINGS_NAVIGATION.filter(item => (!item.hidden || enabled) && (!isIosSystemSettingsAvailable || item.path !== 'settings/haptics')).map(item => <Pressable key={item.path} accessibilityRole="button" accessibilityState={{ selected: selected === item.path }} onPress={() => {
        if (routeName === item.path) return;
        playHaptic('menu'); router.navigate(('/' + item.path) as Href);
      }} style={({ pressed }) => [styles.item, { backgroundColor: selected === item.path ? colors.tint + '18' : pressed ? colors.rowPressed : 'transparent' }]}>
        <View style={iconStyle}><Ionicons name={item.icon} size={21} color={selected === item.path ? colors.tint : colors.muted} /></View>
        <Text style={[styles.label, { color: selected === item.path ? colors.tint : colors.text }]}>{item.title}</Text>
      </Pressable>)}
      </ScrollView>
    </View>}
    <ContentTransition enabled={expanded} transitionKey={routeName}>
      {expanded && <ContentTitleBar title={title} maxWidth={titleMaxWidth} />}
      {children}
    </ContentTransition>
  </View>;
}
const styles = StyleSheet.create({
  frame: { flex: 1, flexDirection: 'row' }, content: { flex: 1, minWidth: 0 },
  sidebar: { flexGrow: 0, flexShrink: 0, borderRightWidth: StyleSheet.hairlineWidth },
  heading: { fontSize: 25, fontWeight: '800', marginTop: 10, marginBottom: 24, paddingHorizontal: 10 },
  item: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 5, borderRadius: 12 },
  label: { flex: 1, fontSize: 14, fontWeight: '600', lineHeight: 21 },
});
