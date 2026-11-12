import { useAppColorScheme, useColors } from '@/theme/tokens';
import { useState } from 'react';
import { Image, Modal, Platform, View } from 'react-native';
import * as Linking from 'expo-linking';
import {
  Button,
  Form,
  Host,
  Image as SwiftUIImage,
  NavigationStack,
  RNHostView,
  Text,
  Toolbar,
  ToolbarItem,
} from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  disabled,
  foregroundStyle,
  navigationBarTitleDisplayMode,
  navigationTitle,
  textSelection,
} from '@expo/ui/swift-ui/modifiers';
import { CREATOR_MESSAGE, CREATOR_URL } from './creator-info';
import type { CreatorDialogProps } from './creator-dialog';

export function CreatorDialog({
  onClose,
  onPressName,
  nameDisabled = false,
  activationError,
}: CreatorDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const colors = useColors();
  const scheme = useAppColorScheme();
  const systemClose = Number.parseInt(String(Platform.Version), 10) >= 26;
  return (
    <Modal presentationStyle="formSheet" animationType="slide" onRequestClose={onClose}>
      <Host style={{ flex: 1 }} colorScheme={scheme} seedColor={colors.tint}>
        <NavigationStack>
          <Toolbar modifiers={[navigationTitle('제작자'), navigationBarTitleDisplayMode('inline')]}>
            <Form modifiers={[foregroundStyle({ type: 'hierarchical', style: 'primary' })]}>
              <RNHostView matchContents={{ vertical: true }}>
                <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                  <Image
                    source={require('../../../assets/images/creator-profile.png')}
                    accessibilityLabel="무직노조의 GitHub 프로필 사진"
                    resizeMode="contain"
                    style={{ width: 160, height: 160, borderRadius: 18 }}
                  />
                </View>
              </RNHostView>
              <Button
                label="무직노조(unemployed-union)"
                modifiers={[accessibilityLabel('무직노조'), disabled(nameDisabled || !onPressName)]}
                onPress={onPressName}
              />
              {activationError && (
                <Text modifiers={[foregroundStyle('red')]}>{activationError}</Text>
              )}
              <Button
                label="GitHub 프로필 열기"
                onPress={() => {
                  setError(null);
                  void Linking.openURL(CREATOR_URL).catch(() =>
                    setError('GitHub 프로필을 열지 못했습니다. 다시 눌러 주세요.'),
                  );
                }}
              />
              {error && <Text modifiers={[foregroundStyle('red')]}>{error}</Text>}
              <Text modifiers={[textSelection(true)]}>{CREATOR_MESSAGE}</Text>
            </Form>
            <Toolbar.Content>
              <ToolbarItem placement="cancellationAction">
                <Button
                  role={systemClose ? 'close' : 'cancel'}
                  onPress={onClose}
                  modifiers={[accessibilityLabel('제작자 메시지 닫기')]}
                >
                  {systemClose ? undefined : <SwiftUIImage systemName="xmark" />}
                </Button>
              </ToolbarItem>
            </Toolbar.Content>
          </Toolbar>
        </NavigationStack>
      </Host>
    </Modal>
  );
}

export { CREATOR_MESSAGE, CREATOR_URL } from './creator-info';
