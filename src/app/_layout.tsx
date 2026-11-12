import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useSegments } from 'expo-router';
import { ActivityIndicator, Platform, Pressable, View, useWindowDimensions } from 'react-native';
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
import { workspaceLayout } from '@/theme/layout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIosSystemSettingsReady } from '@/features/settings/ios-system-settings';
import { LiquidGlassProvider } from '@/theme/liquid-glass';
import { settingsPresentationOptions } from '@/features/settings/settings-presentation';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30000, retry: 2 } },
});

function Navigation() {
  const systemSettingsReady = useIosSystemSettingsReady();
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tablet = workspaceLayout(width - insets.left - insets.right, height, fontScale).expanded;
  useEffect(() => {
    prepareHaptics();
  }, []);
  const loadFavorites = useFavoritesStore((state) => state.load);
  useEffect(() => {
    void loadFavorites();
  }, [loadFavorites]);
  const loadFavoriteDisplay = useFavoriteDisplayPreferences((state) => state.load);
  useEffect(() => {
    void loadFavoriteDisplay();
  }, [loadFavoriteDisplay]);
  const blurReady = useBlurPreferences((state) => state.ready);
  const loadBlur = useBlurPreferences((state) => state.load);
  useEffect(() => {
    void loadBlur();
  }, [loadBlur]);
  const appearanceReady = useAppearancePreferences((state) => state.ready);
  const loadAppearance = useAppearancePreferences((state) => state.load);
  useEffect(() => {
    void loadAppearance();
  }, [loadAppearance]);
  const customTheme = useAppearancePreferences(
    (state) => !!(state.preferences.accent || state.preferences.background),
  );
  const { ready, displayReady, privacy, scope, ...recovery } = useAppBootstrap();
  const colors = useColors();
  const scheme = useAppColorScheme();
  const segments = useSegments();
  const lightStatusBar = scheme === 'dark' || (Platform.OS === 'ios' && segments[0] === 'player');
  const statusBarStyle = lightStatusBar ? 'light' : 'dark';
  const navigationTheme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return customTheme
      ? {
          ...base,
          colors: {
            ...base.colors,
            primary: colors.tint,
            background: colors.background,
            card: colors.surface,
            text: colors.text,
            border: colors.separator,
            notification: colors.tint,
          },
        }
      : base;
  }, [scheme, colors, customTheme]);
  const themeReady = useThemePreferences((state) => state.ready);
  const loadTheme = useThemePreferences((state) => state.load);
  useEffect(() => {
    void loadTheme();
  }, [loadTheme]);
  const menuReady = useMenuPreferences((state) => state.ready);
  const loadMenus = useMenuPreferences((state) => state.load);
  useEffect(() => {
    void loadMenus();
  }, [loadMenus]);
  const metadataReady = useSongMetadataStore((state) => state.ready);
  const loadMetadata = useSongMetadataStore((state) => state.load);
  useEffect(() => {
    void loadMetadata();
  }, [loadMetadata]);
  const artworkReady = useSongArtworkStore((state) => state.ready);
  const loadArtwork = useSongArtworkStore((state) => state.load);
  useEffect(() => {
    void loadArtwork();
  }, [loadArtwork]);
  usePlaybackRecovery({
    ready: ready && metadataReady && artworkReady && themeReady && systemSettingsReady,
    privacyReady: privacy.ready,
    privacyScope: privacy.scope,
    scope,
    ...recovery,
  });
  if (
    !systemSettingsReady ||
    !ready ||
    !displayReady ||
    !menuReady ||
    !metadataReady ||
    !artworkReady ||
    !themeReady ||
    !blurReady ||
    !appearanceReady
  ) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.tint} />
      </View>
    );
  }
  if (!privacy.ready || privacy.scope !== scope) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 28,
          backgroundColor: colors.background,
        }}
      >
        {privacy.error ? (
          <>
            <Text style={{ color: colors.text, textAlign: 'center', marginBottom: 16 }}>
              {privacy.error}
            </Text>
            <Pressable onPress={() => void privacy.load(scope)}>
              <Text style={{ color: colors.tint }}>숨김 설정 다시 불러오기</Text>
            </Pressable>
          </>
        ) : (
          <ActivityIndicator color={colors.tint} />
        )}
      </View>
    );
  }
  return (
    <ThemeProvider value={navigationTheme}>
      <AutomaticMetadata />
      <StatusBar style={statusBarStyle} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          // Over-full-screen player presentation leaves status-bar ownership with its presenter.
          ...(Platform.OS === 'ios' && { statusBarStyle }),
          animation: tablet ? 'none' : 'slide_from_right',
          ...(tablet && { gestureEnabled: false }),
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="connect" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="(settings)"
          options={{ headerShown: false, ...settingsPresentationOptions() }}
        />
        <Stack.Screen
          name="server-playlist"
          options={{
            headerShown: true,
            title: '서버 플레이리스트',
            headerBackTitle: '플레이리스트',
            headerTintColor: colors.tint,
            headerStyle: { backgroundColor: colors.background },
          }}
        />
        <Stack.Screen
          name="player"
          options={{
            presentation: 'transparentModal',
            ...(Platform.OS === 'ios' && { statusBarStyle: 'light' as const }),
            animation: 'none',
            gestureEnabled: false,
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <QueryClientProvider client={queryClient}>
          <LiquidGlassProvider>
            <Navigation />
          </LiquidGlassProvider>
        </QueryClientProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
