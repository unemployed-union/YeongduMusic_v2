import { Stack } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/theme/tokens';
import { workspaceLayout } from '@/theme/layout';
import { SettingsWorkspace } from './settings-workspace';
import { SETTINGS_SCREENS } from './settings-screens';

/** Keep Android headers, transitions, and tablet workspace behavior. */
export function SettingsNavigator() {
  const colors = useColors();
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tablet = workspaceLayout(width - insets.left - insets.right, height, fontScale).expanded;
  return (
    <Stack
      screenLayout={({ children, route }) => (
        <SettingsWorkspace routeName={route.name === 'settings/index' ? 'settings' : route.name}>
          {children}
        </SettingsWorkspace>
      )}
      screenOptions={{
        headerShown: !tablet,
        headerTintColor: colors.tint,
        headerStyle: { backgroundColor: colors.background },
        contentStyle: { backgroundColor: colors.background },
        animation: tablet ? 'none' : 'slide_from_right',
        ...(tablet && { gestureEnabled: false }),
      }}
    >
      {SETTINGS_SCREENS.map((screen) => (
        <Stack.Screen
          key={screen.name}
          name={screen.name}
          options={{ title: screen.title, headerBackTitle: screen.backTitle }}
        />
      ))}
    </Stack>
  );
}
