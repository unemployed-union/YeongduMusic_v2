import { Button, Group, HStack, RNHostView, Spacer, Text } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  buttonStyle,
  disabled,
  foregroundStyle,
} from '@expo/ui/swift-ui/modifiers';
import { View } from 'react-native';
import { CreatorDialog } from './creator-dialog';
import { SettingsNativeContent } from './settings-ui';
import { useVersionSettings } from './use-version-settings';

export function VersionSettings({ onToast }: { onToast: (message: string) => void }) {
  const state = useVersionSettings(onToast);
  return (
    <SettingsNativeContent>
      <Group modifiers={[foregroundStyle({ type: 'hierarchical', style: 'primary' })]}>
        <HStack spacing={16}>
          <Button
            label="버전"
            modifiers={[
              buttonStyle('borderless'),
              disabled(!state.ready || state.busy),
              accessibilityLabel(`버전 ${state.version}`),
            ]}
            onPress={state.tapCreator}
          />
          <Spacer />
          <Button
            label={state.version}
            modifiers={[buttonStyle('borderless'), accessibilityLabel(`앱 버전 ${state.version}`)]}
            onPress={state.tapCreator}
          />
        </HStack>
        {state.error && <Text modifiers={[foregroundStyle('red')]}>{state.error}</Text>}
        {state.creatorOpen && (
          <RNHostView matchContents={{ vertical: true }}>
            <View>
              <CreatorDialog
                onClose={state.closeCreator}
                onPressName={() => void state.activateCreatorName()}
                nameDisabled={!state.ready || state.busy}
                activationError={state.error}
              />
            </View>
          </RNHostView>
        )}
      </Group>
    </SettingsNativeContent>
  );
}
