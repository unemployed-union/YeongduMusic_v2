import { useRef } from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';
import { Tabs } from 'expo-router';
import { BlurTargetView, BlurView } from 'expo-blur';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { MINI_PLAYER_INSET, MiniPlayer } from '@/components/mini-player';
import { TAB_BAR_HEIGHT, TabBarInsetContext } from '@/components/tab-bar-inset';
import { useColors } from '@/theme/tokens';
import { useMenuPreferences } from '@/stores/menu-preferences';
import { BOTTOM_MENU_ROUTES, MENU_LABELS, visibleMenuIds } from '@/features/settings/menu-layout';
import { TabMenuSelection } from '@/features/settings/tab-menu-selection';

export default function TabsLayout() {
  const colors = useColors();
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
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
      <TabBarInsetContext.Provider value={keyboardVisible ? 0 : TAB_BAR_HEIGHT + insets.bottom}>{children}</TabBarInsetContext.Provider>
    </BlurTargetView>}
    layout={({ children, state, navigation }) => <View style={styles.content}>
      <TabMenuSelection navigation={navigation} />
      {children}
      {!keyboardVisible && <View pointerEvents="box-none" style={[styles.mini, { bottom: TAB_BAR_HEIGHT + insets.bottom + MINI_PLAYER_INSET }]}><MiniPlayer blurTarget={targetFor(state.routes[state.index].name)} /></View>}
    </View>}
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarHideOnKeyboard: true,
      tabBarActiveTintColor: colors.tint,
      tabBarInactiveTintColor: colors.chromeMuted,
      tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      tabBarStyle: keyboardVisible ? { display: 'none' } : { position: 'absolute', height: TAB_BAR_HEIGHT + insets.bottom, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 8), backgroundColor: 'transparent', borderTopColor: colors.chromeBorder },
      tabBarBackground: () => <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <BlurView blurTarget={targetFor(route.name)} blurMethod="dimezisBlurView" intensity={75} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.tab }]} />
      </View>,
    })}>
    {bottom.map(item => <Tabs.Screen key={item.id} name={BOTTOM_MENU_ROUTES[item.id]} options={{
      title: MENU_LABELS[item.id],
      ...(!item.visible && { href: null }),
      tabBarIcon: ({ color, size, focused }) => <Ionicons name={item.id === 'library' ? focused ? 'albums' : 'albums-outline' : item.id === 'playlists' ? focused ? 'musical-notes' : 'musical-notes-outline' : focused ? 'search' : 'search-outline'} color={color} size={size} />,
    }} />)}
  </Tabs>;
}
const styles = StyleSheet.create({ content: { flex: 1 }, mini: { position: 'absolute', left: 0, right: 0, height: 64 } });
