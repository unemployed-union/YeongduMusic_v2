import { Stack } from 'expo-router';
import { useColors } from '@/theme/tokens';
import { Platform, useWindowDimensions } from 'react-native';
import { workspaceLayout } from '@/theme/layout';
import { NativeTabFrame } from '@/components/native-tab-frame';

export const unstable_settings = { anchor: 'playlists/index' };

export default function PlaylistsLayout() {
  const colors = useColors();
  const { width, height, fontScale } = useWindowDimensions();
  const tablet = workspaceLayout(width, height, fontScale).expanded;
  const nativeHeader = Platform.OS === 'ios' && !tablet;
  return (
    <Stack
      layout={({ children, state }) => (
        <NativeTabFrame active="playlists" detail={state.routes[state.index]}>
          {children}
        </NativeTabFrame>
      )}
      screenOptions={{
        headerShown: !tablet,
        headerTintColor: colors.tint,
        headerStyle: { backgroundColor: colors.background },
        contentStyle: { backgroundColor: colors.background },
        headerBackTitle: '플레이리스트',
        animation: tablet ? 'none' : 'slide_from_right',
        ...(tablet && { gestureEnabled: false }),
      }}
    >
      <Stack.Screen
        name="playlists/index"
        options={{
          title: '플레이리스트',
          headerShown: nativeHeader,
          headerTransparent: nativeHeader,
          ...(nativeHeader && { headerStyle: { backgroundColor: 'transparent' } }),
          headerLargeTitleEnabled: nativeHeader,
          headerTitleStyle: { color: colors.text },
          headerLargeTitleStyle: { color: colors.text },
          headerShadowVisible: false,
          headerLargeTitleShadowVisible: false,
          scrollEdgeEffects: { top: 'hidden' },
        }}
      />
      <Stack.Screen name="playlists/[id]" options={{ title: '플레이리스트' }} />
    </Stack>
  );
}
