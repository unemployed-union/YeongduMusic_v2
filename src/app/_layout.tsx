import { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, AppState, Pressable, Text, View, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useAuthStore } from '@/stores/auth';
import { useGoogleDriveStore } from '@/stores/google-drive';
import { useLocalMusicStore } from '@/stores/local-music';
import { useDisplayPreferences } from '@/stores/display-preferences';
import { useLibraryPreferences } from '@/stores/library-preferences';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import { usePlaylistStore } from '@/stores/playlists';
import { privacyScope } from '@/features/hidden-music/rules';
import { checkSleepTimer, reconcilePlaybackVisibility, restorePlayback } from '@/services/playback/controller';
import { readRestoredPlayback, startPlaybackPersistence } from '@/services/playback/persistence';
import { usePlaybackStore } from '@/stores/playback';
import { useColors } from '@/theme/tokens';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30000, retry: 2 } } });

function Navigation() {
  const { ready, mode, session, bootstrap } = useAuthStore();
  const colors = useColors();
  const displayReady = useDisplayPreferences((state) => state.ready);
  const loadDisplayPreferences = useDisplayPreferences((state) => state.load);
  useEffect(() => { void loadDisplayPreferences(); }, [loadDisplayPreferences]);
  const loadLibraryPreferences = useLibraryPreferences((state) => state.load);
  useEffect(() => { void loadLibraryPreferences(); }, [loadLibraryPreferences]);
  const scheme = useColorScheme();
  const privacy = useHiddenMusicStore();
  const loadPrivacy = privacy.load;
  const loadPlaylists = usePlaylistStore((state) => state.load);
  const scope = privacyScope(mode, session);
  const driveAccountId = useGoogleDriveStore((state) => state.account?.id);
  const driveReady = useGoogleDriveStore((state) => state.ready);
  const bootstrapDrive = useGoogleDriveStore((state) => state.bootstrap);
  useEffect(() => { void bootstrapDrive(); }, [bootstrapDrive]);
  useEffect(() => { reconcilePlaybackVisibility(song => song.source === 'drive' && song.drive.accountId !== driveAccountId); }, [driveAccountId]);
  const loadLocalMusic = useLocalMusicStore((state) => state.load);
  const allLocalSongs = useLocalMusicStore((state) => state.allSongs);
  const localSongs = useLocalMusicStore((state) => state.songs);
  const localReady = useLocalMusicStore((state) => state.ready);
  const persistenceStop = useRef<(() => void) | null>(null);
  const recoveryAttempted = useRef(false);
  const excludedLocalIds = useMemo(() => {
    const visibleIds = new Set(localSongs.map(song => song.id));
    return new Set(allLocalSongs.filter(song => !visibleIds.has(song.id)).map(song => song.id));
  }, [allLocalSongs, localSongs]);
  useEffect(() => { reconcilePlaybackVisibility(song => song.source === 'local' && excludedLocalIds.has(song.id)); }, [excludedLocalIds]);
  useEffect(() => { void loadLocalMusic(); }, [loadLocalMusic]);
  useEffect(() => { void bootstrap(); }, [bootstrap]);
  useEffect(() => { if (ready && mode === 'setup') reconcilePlaybackVisibility(); }, [ready, mode]);
  useEffect(() => {
    const current = useHiddenMusicStore.getState();
    // Android recreates the React tree after dismissing the activity. Reloading
    // the same profile temporarily clears ready and can stop the live player.
    if (ready && !(current.ready && current.scope === scope)) void loadPrivacy(scope);
  }, [ready, scope, loadPrivacy]);
  useEffect(() => { if (ready) void loadPlaylists(scope); }, [ready, scope, loadPlaylists]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'background') useHiddenMusicStore.getState().lock(); if (state === 'active') checkSleepTimer(); });
    return () => subscription.remove();
  }, []);
  useEffect(() => { if (privacy.ready && privacy.scope === scope) reconcilePlaybackVisibility(); }, [privacy.ready, privacy.scope, privacy.profile.presets, scope]);
  useEffect(() => {
    if (!ready || !privacy.ready || privacy.scope !== scope || !localReady || !driveReady || recoveryAttempted.current) return;
    let cancelled = false;
    void (async () => {
      try {
        const playback = usePlaybackStore.getState();
        if (playback.queue[playback.index]) {
          router.navigate(playback.playing ? '/player' : '/(tabs)/(library)');
          return;
        }
        const saved = await readRestoredPlayback();
        if (cancelled || !saved || usePlaybackStore.getState().queue.length) return;
        const restored = await restorePlayback(saved.queue, saved.index, saved.position, saved.playing, saved.shuffle, saved.repeat);
        if (restored && !cancelled) router.navigate(usePlaybackStore.getState().playing ? '/player' : '/(tabs)/(library)');
      } catch { /* Playback recovery must not block the library. */ }
      finally {
        if (!cancelled) {
          recoveryAttempted.current = true;
          if (!persistenceStop.current) persistenceStop.current = startPlaybackPersistence();
        }
      }
    })();
    return () => { cancelled = true; };
  }, [ready, privacy.ready, privacy.scope, scope, localReady, driveReady, driveAccountId]);
  useEffect(() => () => { persistenceStop.current?.(); persistenceStop.current = null; }, []);
  if (!ready || !displayReady) return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}><ActivityIndicator color={colors.tint} /></View>;
  if (!privacy.ready || privacy.scope !== scope) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28, backgroundColor: colors.background }}>{privacy.error ? <><Text style={{ color: colors.text, textAlign: 'center', marginBottom: 16 }}>{privacy.error}</Text><Pressable onPress={() => void privacy.load(scope)}><Text style={{ color: colors.tint }}>숨김 설정 다시 불러오기</Text></Pressable></> : <ActivityIndicator color={colors.tint} />}</View>;
  return <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
    <StatusBar style="auto" />
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'slide_from_right' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="connect" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="settings" options={{ headerShown: true, title: '설정', headerBackTitle: '뒤로', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="settings/cloud" options={{ headerShown: true, title: '클라우드 연결', headerBackTitle: '설정', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="settings/cloud/synology" options={{ headerShown: true, title: 'Synology', headerBackTitle: '클라우드 연결', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="settings/cloud/google-drive" options={{ headerShown: true, title: 'Google Drive', headerBackTitle: '클라우드 연결', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="settings/playback" options={{ headerShown: true, title: '재생 및 화면', headerBackTitle: '설정', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="settings/library" options={{ headerShown: true, title: '보관함 설정', headerBackTitle: '설정', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="settings/licenses" options={{ headerShown: true, title: '오픈소스 라이선스', headerBackTitle: '설정', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="settings/other" options={{ headerShown: true, title: '기타', headerBackTitle: '설정', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="hidden-music" options={{ headerShown: true, title: '음악 숨기기', headerBackTitle: '기타', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="hidden-playlists" options={{ headerShown: true, title: '플레이리스트 숨기기', headerBackTitle: '기타', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="player" options={{ presentation: 'transparentModal', animation: 'none', gestureEnabled: false, contentStyle: { backgroundColor: 'transparent' } }} />
    </Stack>
  </ThemeProvider>;
}

export default function RootLayout() {
  return <GestureHandlerRootView style={{ flex: 1 }}><KeyboardProvider><QueryClientProvider client={queryClient}><Navigation /></QueryClientProvider></KeyboardProvider></GestureHandlerRootView>;
}
