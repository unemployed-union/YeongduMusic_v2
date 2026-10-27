import { useRef } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Tabs } from 'expo-router';
import { BlurTargetView, BlurView } from 'expo-blur';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { MINI_PLAYER_INSET, MiniPlayer } from '@/components/mini-player';
import { TAB_BAR_HEIGHT, TabBarInsetContext } from '@/components/tab-bar-inset';
import { useAppColorScheme, useColors } from '@/theme/tokens';
import { useMenuPreferences } from '@/stores/menu-preferences';
import { BOTTOM_MENU_ROUTES, MENU_LABELS, visibleMenuIds } from '@/features/settings/menu-layout';
import { TabMenuSelection } from '@/features/settings/tab-menu-selection';
import { ScreenBlurTargetContext } from '@/components/screen-blur-target';
import { useBlurIntensity } from '@/stores/blur-preferences';
import { workspaceLayout } from '@/theme/layout';
import { TabletSidebar } from '@/components/tablet-sidebar';
import { ContentTitleBar } from '@/components/content-title-bar';
import { ContentTransition } from '@/components/content-transition';
import { tabletTabInfo } from '@/features/settings/tablet-tab-navigation';
import { useLiquidGlass } from '@/theme/liquid-glass';

export default function LegacyTabsLayout() {
  const colors = useColors();
  const isDark = useAppColorScheme() === 'dark';
  const glass = useLiquidGlass('tabBar');
  const blurIntensity = useBlurIntensity('tabBar'), blurEnabled = blurIntensity > 0 && !glass.reduceTransparency;
  const insets = useSafeAreaInsets();
  const { width, height, fontScale } = useWindowDimensions();
  const workspace = workspaceLayout(width, height, fontScale);
  const tablet = workspace.expanded;
  const tabInset = tablet ? insets.bottom : TAB_BAR_HEIGHT + insets.bottom;
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const bottom = useMenuPreferences(state => state.layout.bottom);
  const libraryTarget = useRef<View | null>(null);
  const searchTarget = useRef<View | null>(null);
  const playlistsTarget = useRef<View | null>(null);
  const targetFor = (name: string) => name === 'search' ? searchTarget : name === '(playlists)' ? playlistsTarget : libraryTarget;

  return <Tabs
    initialRouteName={BOTTOM_MENU_ROUTES[visibleMenuIds(bottom)[0]]}
    // Capture screen content only; both chrome surfaces share the active target.
    screenLayout={({ children, route }) => <BlurTargetView ref={targetFor(route.name)} style={styles.content}>
      <ScreenBlurTargetContext.Provider value={targetFor(route.name)}>
      <TabBarInsetContext.Provider value={keyboardVisible ? 0 : tabInset}>{children}</TabBarInsetContext.Provider>
      </ScreenBlurTargetContext.Provider>
    </BlurTargetView>}
    layout={({ children, state, navigation }) => {
      const info = tabletTabInfo(state.routes[state.index]);
      const sidebar = tablet && !info.libraryHome;
      const miniWidth = Math.min(760, workspace.contentWidth);
      return <View style={[styles.content, { flexDirection: 'row' }]}>
        <TabMenuSelection navigation={navigation} />
        {sidebar && <TabletSidebar active={info.active} width={workspace.sidebarWidth} />}
        <ContentTransition enabled={sidebar} transitionKey={info.transitionKey}>
          {sidebar && <ContentTitleBar title={info.title} />}
          {children}
          {!keyboardVisible && <View pointerEvents="box-none" style={[styles.mini, { bottom: tabInset + MINI_PLAYER_INSET }, tablet && { width: miniWidth, left: (sidebar ? 0 : workspace.sidebarWidth) + (workspace.contentWidth - miniWidth) / 2, alignSelf: 'auto' }]}><MiniPlayer blurTarget={targetFor(state.routes[state.index].name)} /></View>}
        </ContentTransition>
      </View>;
    }}
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarHideOnKeyboard: true,
      tabBarActiveTintColor: colors.tint,
      tabBarInactiveTintColor: glass.supported ? colors.muted : colors.chromeMuted,
      tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      tabBarStyle: keyboardVisible || tablet ? { display: 'none' } : { position: 'absolute', height: TAB_BAR_HEIGHT + insets.bottom, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 8), backgroundColor: 'transparent', borderTopColor: colors.chromeBorder },
      tabBarBackground: () => tablet ? null : <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {blurEnabled && <BlurView blurTarget={targetFor(route.name)} blurMethod="dimezisBlurView" intensity={blurIntensity} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: blurEnabled ? colors.tab : colors.surface }]} />
      </View>,
    })}>
    {bottom.map(item => <Tabs.Screen key={item.id} name={BOTTOM_MENU_ROUTES[item.id]} options={{
      title: MENU_LABELS[item.id],
      ...(!item.visible && { href: null }),
      tabBarIcon: ({ color, size, focused }) => <Ionicons name={item.id === 'library' ? focused ? 'albums' : 'albums-outline' : item.id === 'playlists' ? focused ? 'musical-notes' : 'musical-notes-outline' : focused ? 'search' : 'search-outline'} color={color} size={size} />,
    }} />)}
  </Tabs>;
}
const styles = StyleSheet.create({ content: { flex: 1 }, mini: { position: 'absolute', width: '100%', maxWidth: 760, alignSelf: 'center', height: 64 } });
