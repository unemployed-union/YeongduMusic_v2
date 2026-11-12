import { Button, Group, HStack, Image, ProgressView, Spacer, Text } from '@expo/ui/swift-ui';
import { disabled, foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { SettingsNativeContent } from './settings-ui';
import { useSystemSettingsLink } from './use-system-settings-link';

export function IosSystemSettingsLink() {
  const state = useSystemSettingsLink();
  return (
    <SettingsNativeContent>
      <Group modifiers={[foregroundStyle({ type: 'hierarchical', style: 'primary' })]}>
        <Button onPress={state.openSettings} modifiers={[disabled(state.busy)]}>
          <HStack>
            <Text>iOS 앱 설정</Text>
            <Spacer />
            {state.busy ? <ProgressView /> : <Image systemName="arrow.up.right" size={13} />}
          </HStack>
        </Button>
        {state.error && <Text modifiers={[foregroundStyle('red')]}>{state.error}</Text>}
        {state.syncError && <Button label="설정 다시 반영하기" onPress={state.retry} />}
      </Group>
    </SettingsNativeContent>
  );
}
