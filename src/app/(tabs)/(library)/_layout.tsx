import { Stack } from 'expo-router';
import { useColors } from '@/theme/tokens';
import { Platform, useWindowDimensions } from 'react-native';
import { workspaceLayout } from '@/theme/layout';
import { NativeTabFrame } from '@/components/native-tab-frame';

export const unstable_settings = { anchor: 'index' };

export default function LibraryLayout() {
  const colors = useColors();
  const { width, height, fontScale } = useWindowDimensions();
  const tablet = workspaceLayout(width, height, fontScale).expanded;
  const nativeHeader = Platform.OS === 'ios' && !tablet;
  return (
    <Stack
      activityEnabled={1}
      layout={({ children, state }) => (
        <NativeTabFrame active="library" detail={state.routes[state.index]}>
          {children}
        </NativeTabFrame>
      )}
      screenOptions={{
        headerShown: !tablet,
        headerTintColor: colors.tint,
        headerStyle: { backgroundColor: colors.background },
        contentStyle: { backgroundColor: colors.background },
        headerBackTitle: '보관함',
        animation: tablet ? 'none' : 'slide_from_right',
        ...(tablet && { gestureEnabled: false }),
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: '보관함',
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
      <Stack.Screen name="favorites" options={{ title: '좋아요한 곡' }} />
      <Stack.Screen
        name="album/[id]"
        options={{
          title: '',
          headerTransparent: true,
          headerStyle: { backgroundColor: 'transparent' },
          headerShadowVisible: false,
          scrollEdgeEffects: { top: 'hidden' },
        }}
      />
      <Stack.Screen name="artist/[id]" options={{ title: '아티스트' }} />
    </Stack>
  );
}
