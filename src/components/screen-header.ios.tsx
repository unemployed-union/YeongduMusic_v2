import { isValidElement, type ReactNode } from 'react';
import { Stack } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { workspaceLayout } from '@/theme/layout';
import { useColors } from '@/theme/tokens';
import { SettingsButton, useSettingsAction } from './settings-button';

/** Keep the sidebar on iPad; let UIKit own the title and safe area on iPhone. */
export function ScreenHeader({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  bottomSpacing?: number;
}) {
  const colors = useColors();
  const { width, height, fontScale } = useWindowDimensions();
  const tablet = workspaceLayout(width, height, fontScale).expanded;
  const nativeSettings =
    isValidElement<{ onOpen?: () => void }>(action) && action.type === SettingsButton;
  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerShown: !tablet,
          headerTintColor: colors.tint,
          headerTitleStyle: { color: colors.text },
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
        }}
      />
      {!tablet &&
        action &&
        (nativeSettings ? (
          <SettingsToolbarAction onOpen={action.props.onOpen} />
        ) : (
          <Stack.Toolbar placement="right" asChild>
            {action}
          </Stack.Toolbar>
        ))}
      {children}
    </>
  );
}

function SettingsToolbarAction({ onOpen }: { onOpen?: () => void }) {
  const colors = useColors();
  const onPress = useSettingsAction(onOpen);
  return (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Button
        icon="gearshape"
        tintColor={colors.tint}
        accessibilityLabel="설정 열기"
        onPress={onPress}
      >
        설정
      </Stack.Toolbar.Button>
    </Stack.Toolbar>
  );
}
