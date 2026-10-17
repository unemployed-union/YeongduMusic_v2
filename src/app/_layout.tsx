import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { ActivityIndicator, Pressable, View, useWindowDimensions } from 'react-native';
import { Text } from '@/components/text';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useAppBootstrap } from '@/features/startup/use-app-bootstrap';
import { usePlaybackRecovery } from '@/features/startup/use-playback-recovery';
import { useAppColorScheme, useColors } from '@/theme/tokens';
import { useEffect, useMemo } from 'react';
import { useMenuPreferences } from '@/stores/menu-preferences';
import { useSongMetadataStore } from '@/stores/song-metadata';
import { AutomaticMetadata } from '@/features/metadata/automatic-metadata';
import { useSongArtworkStore } from '@/stores/song-artwork';
import { useThemePreferences } from '@/stores/theme-preferences';
import { prepareHaptics } from '@/services/haptics';
import { useFavoritesStore } from '@/stores/favorites';
import { useFavoriteDisplayPreferences } from '@/stores/favorite-display-preferences';
import { useBlurPreferences } from '@/stores/blur-preferences';
import { useAppearancePreferences } from '@/stores/appearance-preferences';
import { SettingsWorkspace } from '@/features/settings/settings-workspace';
import { workspaceLayout } from '@/theme/layout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30000, retry: 2 } } });

function Navigation() {
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tablet = workspaceLayout(width - insets.left - insets.right, height, fontScale).expanded;
  useEffect(() => { prepareHaptics(); }, []);
  const loadFavorites = useFavoritesStore(state => state.load);
  useEffect(() => { void loadFavorites(); }, [loadFavorites]);
  const loadFavoriteDisplay = useFavoriteDisplayPreferences(state => state.load);
  useEffect(() => { void loadFavoriteDisplay(); }, [loadFavoriteDisplay]);
  const blurReady = useBlurPreferences(state => state.ready), loadBlur = useBlurPreferences(state => state.load);
  useEffect(() => { void loadBlur(); }, [loadBlur]);
  const appearanceReady = useAppearancePreferences(state => state.ready), loadAppearance = useAppearancePreferences(state => state.load);
  useEffect(() => { void loadAppearance(); }, [loadAppearance]);
  const customTheme = useAppearancePreferences(state => !!(state.preferences.accent || state.preferences.background));
  const { ready, displayReady, privacy, scope, ...recovery } = useAppBootstrap();
  const colors = useColors();
  const scheme = useAppColorScheme();
  const navigationTheme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return customTheme ? { ...base, colors: { ...base.colors, primary: colors.tint, background: colors.background, card: colors.surface, text: colors.text, border: colors.separator, notification: colors.tint } } : base;
  }, [scheme, colors, customTheme]);
  const themeReady = useThemePreferences(state => state.ready), loadTheme = useThemePreferences(state => state.load);
  useEffect(() => { void loadTheme(); }, [loadTheme]);
  const menuReady = useMenuPreferences(state => state.ready);
  const loadMenus = useMenuPreferences(state => state.load);
  useEffect(() => { void loadMenus(); }, [loadMenus]);
  const metadataReady = useSongMetadataStore(state => state.ready);
  const loadMetadata = useSongMetadataStore(state => state.load);
  useEffect(() => { void loadMetadata(); }, [loadMetadata]);
  const artworkReady = useSongArtworkStore(state => state.ready), loadArtwork = useSongArtworkStore(state => state.load);
  useEffect(() => { void loadArtwork(); }, [loadArtwork]);
  usePlaybackRecovery({ ready: ready && metadataReady && artworkReady && themeReady, privacyReady: privacy.ready, privacyScope: privacy.scope, scope, ...recovery });
  if (!ready || !displayReady || !menuReady || !metadataReady || !artworkReady || !themeReady || !blurReady || !appearanceReady) return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}><ActivityIndicator color={colors.tint} /></View>;
  if (!privacy.ready || privacy.scope !== scope) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28, backgroundColor: colors.background }}>{privacy.error ? <><Text style={{ color: colors.text, textAlign: 'center', marginBottom: 16 }}>{privacy.error}</Text><Pressable onPress={() => void privacy.load(scope)}><Text style={{ color: colors.tint }}>숨김 설정 다시 불러오기</Text></Pressable></> : <ActivityIndicator color={colors.tint} />}</View>;
  return <ThemeProvider value={navigationTheme}>
    <AutomaticMetadata />
    <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    <Stack screenLayout={({ children, route }) => route.name === 'settings' || route.name.startsWith('settings/') || route.name === 'hidden-music' || route.name === 'hidden-playlists' ? <SettingsWorkspace routeName={route.name}>{children}</SettingsWorkspace> : children} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: tablet ? 'none' : 'slide_from_right', ...(tablet && { gestureEnabled: false }) }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="connect" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="settings" options={{ headerShown: !tablet, title: '설정', headerBackTitle: '뒤로', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="settings/cloud" options={{ headerShown: !tablet, title: '클라우드 연결', headerBackTitle: '설정', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="settings/cloud/synology" options={{ headerShown: !tablet, title: 'Synology', headerBackTitle: '클라우드 연결', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="settings/cloud/google-drive" options={{ headerShown: !tablet, title: 'Google Drive', headerBackTitle: '클라우드 연결', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="settings/cloud/s3" options={{ headerShown: !tablet, title: 'S3 호환 저장소', headerBackTitle: '클라우드 연결', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="settings/playback" options={{ headerShown: !tablet, title: '재생 및 화면', headerBackTitle: '설정', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="settings/colors" options={{ headerShown: !tablet, title: '색상 설정', headerBackTitle: '재생 및 화면', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="settings/haptics" options={{ headerShown: !tablet, title: '햅틱 피드백', headerBackTitle: '설정', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="settings/library" options={{ headerShown: !tablet, title: '보관함 설정', headerBackTitle: '설정', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="settings/bottom-menu" options={{ headerShown: !tablet, title: '하단 메뉴 설정', headerBackTitle: '설정', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="settings/player-menu" options={{ headerShown: !tablet, title: '재생 화면 메뉴 설정', headerBackTitle: '설정', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="settings/backup" options={{ headerShown: !tablet, title: '설정 백업 및 복구', headerBackTitle: '설정', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="settings/playlist-backup" options={{ headerShown: !tablet, title: '플레이리스트 백업 및 복구', headerBackTitle: '뒤로', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="settings/licenses" options={{ headerShown: !tablet, title: '오픈소스 라이선스', headerBackTitle: '설정', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="settings/other" options={{ headerShown: !tablet, title: '기타', headerBackTitle: '설정', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="settings/quick-hide-preset" options={{ headerShown: !tablet, title: '빠른 숨기기 프리셋', headerBackTitle: '기타', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="hidden-music" options={{ headerShown: !tablet, title: '음악 숨기기', headerBackTitle: '기타', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="hidden-playlists" options={{ headerShown: !tablet, title: '플레이리스트 숨기기', headerBackTitle: '기타', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="player" options={{ presentation: 'transparentModal', animation: 'none', gestureEnabled: false, contentStyle: { backgroundColor: 'transparent' } }} />
    </Stack>
  </ThemeProvider>;
}

export default function RootLayout() {
  return <GestureHandlerRootView style={{ flex: 1 }}><KeyboardProvider><QueryClientProvider client={queryClient}><Navigation /></QueryClientProvider></KeyboardProvider></GestureHandlerRootView>;
}
