import { Stack } from 'expo-router';
import { useColors } from '@/theme/tokens';
import { useSettingsAction } from './settings-button';

export function NativeSettingsToolbar() {
  const colors = useColors();
  const openSettings = useSettingsAction();

  return (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Button
        icon="gearshape"
        tintColor={colors.tint}
        accessibilityLabel="설정 열기"
        onPress={openSettings}
      />
    </Stack.Toolbar>
  );
}
