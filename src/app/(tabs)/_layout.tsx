import { useRef } from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';
import { Tabs } from 'expo-router';
import { BlurTargetView, BlurView } from 'expo-blur';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { MINI_PLAYER_INSET, MiniPlayer } from '@/components/mini-player';
import { useColors } from '@/theme/tokens';

const TAB_BAR_HEIGHT = 66;

export default function TabsLayout() {
  const colors = useColors();
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const libraryTarget = useRef<View | null>(null);
  const searchTarget = useRef<View | null>(null);
  const settingsTarget = useRef<View | null>(null);
  const targetFor = (name: string) => name === 'search' ? searchTarget : name === 'settings' ? settingsTarget : libraryTarget;

  return <Tabs
    // Capture screen content only; both chrome surfaces share the active target.
    screenLayout={({ children, route }) => <BlurTargetView ref={targetFor(route.name)} style={styles.content}>{children}</BlurTargetView>}
    layout={({ children, state }) => <View style={styles.content}>
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
    <Tabs.Screen name="(library)" options={{ title: '보관함', tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'albums' : 'albums-outline'} color={color} size={size} /> }} />
    <Tabs.Screen name="search" options={{ title: '검색', tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'search' : 'search-outline'} color={color} size={size} /> }} />
    <Tabs.Screen name="settings" options={{ title: '설정', tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'settings' : 'settings-outline'} color={color} size={size} /> }} />
  </Tabs>;
}
const styles = StyleSheet.create({ content: { flex: 1 }, mini: { position: 'absolute', left: 0, right: 0, height: 64 } });
