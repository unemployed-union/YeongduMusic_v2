import { Stack } from 'expo-router';
import { useColors } from '@/theme/tokens';

export const unstable_settings = { initialRouteName: 'playlists/index' };

export default function PlaylistsLayout() {
  const colors = useColors();
  return <Stack screenOptions={{ headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background }, contentStyle: { backgroundColor: colors.background }, headerBackTitle: '플레이리스트', animation: 'slide_from_right' }}>
    <Stack.Screen name="playlists/index" options={{ headerShown: false }} />
    <Stack.Screen name="playlists/[id]" options={{ title: '플레이리스트' }} />
  </Stack>;
}
