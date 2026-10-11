import { useEffect } from 'react';
import { ActivityIndicator, AppState, Pressable, Text, View, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useAuthStore } from '@/stores/auth';
import { useLocalMusicStore } from '@/stores/local-music';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import { usePlaylistStore } from '@/stores/playlists';
import { privacyScope } from '@/features/hidden-music/rules';
import { checkSleepTimer, reconcilePlaybackVisibility } from '@/services/playback/controller';
import { useColors } from '@/theme/tokens';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30000, retry: 2 } } });

function Navigation() {
  const { ready, mode, session, bootstrap } = useAuthStore();
  const colors = useColors();
  const scheme = useColorScheme();
  const privacy = useHiddenMusicStore();
  const loadPrivacy = privacy.load;
  const loadPlaylists = usePlaylistStore((state) => state.load);
  const scope = privacyScope(mode, session);
  const loadLocalMusic = useLocalMusicStore((state) => state.load);
  useEffect(() => { void loadLocalMusic(); }, [loadLocalMusic]);
  useEffect(() => { void bootstrap(); }, [bootstrap]);
  useEffect(() => { if (ready && mode === 'setup') reconcilePlaybackVisibility(); }, [ready, mode]);
  useEffect(() => { if (ready) void loadPrivacy(scope); }, [ready, scope, loadPrivacy]);
  useEffect(() => { if (ready) void loadPlaylists(scope); }, [ready, scope, loadPlaylists]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'background') useHiddenMusicStore.getState().lock(); if (state === 'active') checkSleepTimer(); });
    return () => subscription.remove();
  }, []);
  useEffect(() => { if (privacy.ready && privacy.scope === scope) reconcilePlaybackVisibility(); }, [privacy.ready, privacy.scope, privacy.profile.presets, scope]);
  if (!ready) return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}><ActivityIndicator color={colors.tint} /></View>;
  if (!privacy.ready || privacy.scope !== scope) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28, backgroundColor: colors.background }}>{privacy.error ? <><Text style={{ color: colors.text, textAlign: 'center', marginBottom: 16 }}>{privacy.error}</Text><Pressable onPress={() => void privacy.load(scope)}><Text style={{ color: colors.tint }}>숨김 설정 다시 불러오기</Text></Pressable></> : <ActivityIndicator color={colors.tint} />}</View>;
  return <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
    <StatusBar style="auto" />
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'slide_from_right' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="connect" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="hidden-music" options={{ headerShown: true, title: '음악 숨기기', headerBackTitle: '설정', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="player" options={{ presentation: 'transparentModal', animation: 'none', gestureEnabled: false, contentStyle: { backgroundColor: 'transparent' } }} />
    </Stack>
  </ThemeProvider>;
}

export default function RootLayout() {
  return <GestureHandlerRootView style={{ flex: 1 }}><KeyboardProvider><QueryClientProvider client={queryClient}><Navigation /></QueryClientProvider></KeyboardProvider></GestureHandlerRootView>;
}
