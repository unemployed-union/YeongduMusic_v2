import { useAppColorScheme, useColors } from '@/theme/tokens';
import {
  BottomSheet,
  Button,
  Group,
  Host,
  NavigationStack,
  Toolbar,
  ToolbarItem,
} from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  foregroundStyle,
  navigationBarTitleDisplayMode,
  navigationTitle,
  presentationDetents,
  presentationDragIndicator,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { Platform } from 'react-native';
import type { ReactNode } from 'react';

export type LibrarySheetProps = {
  title: string;
  children: ReactNode;
  visible?: boolean;
  onClose(): void;
  onDismiss?: () => void;
};

/** SwiftUI owns the sheet, navigation bar, resizing and scrolling coordination. */
export function LibrarySheet({
  title,
  children,
  visible = true,
  onClose,
  onDismiss,
}: LibrarySheetProps) {
  const colors = useColors();
  const scheme = useAppColorScheme();
  const systemClose = Number.parseInt(String(Platform.Version), 10) >= 26;
  return (
    <Host
      style={{ position: 'absolute', width: 0, height: 0 }}
      colorScheme={scheme}
      seedColor={colors.tint}
    >
      <BottomSheet
        isPresented={visible}
        onIsPresentedChange={(presented) => {
          if (!presented) {
            onClose();
          }
        }}
        onDismiss={onDismiss}
      >
        <Group
          modifiers={[
            presentationDetents(['medium', 'large']),
            presentationDragIndicator('visible'),
          ]}
        >
          <NavigationStack>
            <Toolbar modifiers={[navigationTitle(title), navigationBarTitleDisplayMode('inline')]}>
              {children}
              <Toolbar.Content>
                <ToolbarItem placement="cancellationAction">
                  <Button
                    role={systemClose ? 'close' : 'cancel'}
                    label={systemClose ? undefined : '닫기'}
                    onPress={onClose}
                    modifiers={[
                      accessibilityLabel(title + ' 닫기'),
                      foregroundStyle({ type: 'hierarchical', style: 'primary' }),
                      tint(colors.tint),
                    ]}
                  />
                </ToolbarItem>
              </Toolbar.Content>
            </Toolbar>
          </NavigationStack>
        </Group>
      </BottomSheet>
    </Host>
  );
}
