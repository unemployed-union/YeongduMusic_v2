import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { ActivityIndicator, Pressable, useColorScheme, View } from 'react-native';
import { Text } from '@/components/text';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useAppBootstrap } from '@/features/startup/use-app-bootstrap';
import { usePlaybackRecovery } from '@/features/startup/use-playback-recovery';
import { useColors } from '@/theme/tokens';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30000, retry: 2 } } });

function Navigation() {
  const { ready, displayReady, privacy, scope, ...recovery } = useAppBootstrap();
  usePlaybackRecovery({ ready, privacyReady: privacy.ready, privacyScope: privacy.scope, scope, ...recovery });
  const colors = useColors();
  const scheme = useColorScheme();
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
      <Stack.Screen name="settings/cloud/s3" options={{ headerShown: true, title: 'S3 호환 저장소', headerBackTitle: '클라우드 연결', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="settings/playback" options={{ headerShown: true, title: '재생 및 화면', headerBackTitle: '설정', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="settings/library" options={{ headerShown: true, title: '보관함 설정', headerBackTitle: '설정', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="settings/backup" options={{ headerShown: true, title: '설정 백업 및 복구', headerBackTitle: '설정', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="settings/playlist-backup" options={{ headerShown: true, title: '플레이리스트 백업 및 복구', headerBackTitle: '뒤로', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="settings/licenses" options={{ headerShown: true, title: '오픈소스 라이선스', headerBackTitle: '설정', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="settings/other" options={{ headerShown: true, title: '기타', headerBackTitle: '설정', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="settings/quick-hide-preset" options={{ headerShown: true, title: '빠른 숨기기 프리셋', headerBackTitle: '기타', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="hidden-music" options={{ headerShown: true, title: '음악 숨기기', headerBackTitle: '기타', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="hidden-playlists" options={{ headerShown: true, title: '플레이리스트 숨기기', headerBackTitle: '기타', headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background } }} />
      <Stack.Screen name="player" options={{ presentation: 'transparentModal', animation: 'none', gestureEnabled: false, contentStyle: { backgroundColor: 'transparent' } }} />
    </Stack>
  </ThemeProvider>;
}

export default function RootLayout() {
  return <GestureHandlerRootView style={{ flex: 1 }}><KeyboardProvider><QueryClientProvider client={queryClient}><Navigation /></QueryClientProvider></KeyboardProvider></GestureHandlerRootView>;
}
