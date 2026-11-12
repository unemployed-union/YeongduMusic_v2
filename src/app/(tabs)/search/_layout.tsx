import { Stack } from 'expo-router';
import { NativeTabFrame } from '@/components/native-tab-frame';
import { Platform, useWindowDimensions } from 'react-native';
import { workspaceLayout } from '@/theme/layout';
import { useColors } from '@/theme/tokens';

export default function SearchLayout() {
  const colors = useColors();
  const { width, height, fontScale } = useWindowDimensions();
  const nativeHeader = Platform.OS === 'ios' && !workspaceLayout(width, height, fontScale).expanded;
  return (
    <Stack
      layout={({ children }) => <NativeTabFrame active="search">{children}</NativeTabFrame>}
      screenOptions={{
        headerShown: nativeHeader,
        title: '검색',
        headerTintColor: colors.tint,
        headerTitleStyle: { color: colors.text },
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
      }}
    />
  );
}
