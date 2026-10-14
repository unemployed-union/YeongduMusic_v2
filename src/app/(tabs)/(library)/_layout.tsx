import { Stack } from 'expo-router';
import { useColors } from '@/theme/tokens';

export const unstable_settings = { initialRouteName: 'index' };

export default function LibraryLayout() {
  const colors = useColors();
  return <Stack screenOptions={{ headerTintColor: colors.tint, headerStyle: { backgroundColor: colors.background }, contentStyle: { backgroundColor: colors.background }, headerBackTitle: '보관함', animation: 'slide_from_right' }}>
    <Stack.Screen name="index" options={{ headerShown: false }} />
    <Stack.Screen name="album/[id]" options={{ title: '', headerTransparent: true, headerStyle: { backgroundColor: 'transparent' }, headerShadowVisible: false, scrollEdgeEffects: { top: 'hidden' } }} />
    <Stack.Screen name="artist/[id]" options={{ title: '아티스트' }} />
  </Stack>;
}
