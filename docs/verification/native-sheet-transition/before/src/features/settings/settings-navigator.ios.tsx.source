import { useColors } from '@/theme/tokens';
import { Stack, router, useNavigation, type NativeStackNavigationOptions } from 'expo-router';
import { View } from 'react-native';
import { SETTINGS_SCREENS } from './settings-screens';

/** One native sheet owns an internal stack; pushing a setting never presents another sheet. */
export function SettingsNavigator() {
  const rootNavigation = useNavigation('/');
  const colors = useColors();

  function closeSettings() {
    const state = rootNavigation.getState();
    if (state && state.index > 0) {
      rootNavigation.dispatch({ type: 'POP', payload: { count: 1 }, target: state.key });
    } else {
      router.replace('/');
    }
  }

  const options: NativeStackNavigationOptions = {
    presentation: 'card',
    animation: 'slide_from_right',
    headerShown: true,
    headerTintColor: colors.tint,
    headerBackButtonDisplayMode: 'minimal',
    // Let iOS coordinate the system bar with the sheet and its scroll edge.
    headerTitleStyle: { color: colors.text },
    headerShadowVisible: false,
    contentStyle: { backgroundColor: 'transparent' },
  };
  const closeItems: NonNullable<NativeStackNavigationOptions['unstable_headerLeftItems']> = () => [
    {
      type: 'button',
      label: '설정 닫기',
      accessibilityLabel: '설정 닫기',
      icon: { type: 'sfSymbol', name: 'xmark' },
      tintColor: colors.tint,
      onPress: closeSettings,
    },
  ];
  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={options}>
        {SETTINGS_SCREENS.map((screen) => (
          <Stack.Screen
            key={screen.name}
            name={screen.name}
            options={{
              title: screen.title,
              headerBackTitle: screen.backTitle,
              headerBackVisible: screen.name !== 'settings/index',
              ...(screen.name === 'settings/index' ? { unstable_headerLeftItems: closeItems } : {}),
            }}
          />
        ))}
      </Stack>
    </View>
  );
}
