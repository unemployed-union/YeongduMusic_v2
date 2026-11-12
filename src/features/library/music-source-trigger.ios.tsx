import { Button, Host, HStack, Image, ProgressView, Text } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  buttonStyle,
  controlSize,
  foregroundStyle,
  lineLimit,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { useAppColorScheme, useColors } from '@/theme/tokens';
import { SOURCE_SYMBOLS } from './music-source-menu-model';
import type { MusicSourceTriggerProps } from './music-source-trigger';

export function MusicSourceTrigger({ selected, label, busy, onPress }: MusicSourceTriggerProps) {
  const colors = useColors();
  const scheme = useAppColorScheme();
  return (
    <Host matchContents colorScheme={scheme} seedColor={colors.tint} style={{ flexShrink: 1 }}>
      <Button
        onPress={onPress}
        modifiers={[
          buttonStyle('bordered'),
          controlSize('regular'),
          tint(colors.tint),
          foregroundStyle(colors.tint),
          accessibilityLabel('음악 소스 및 가져오기 메뉴'),
        ]}
      >
        <HStack spacing={6}>
          <Image systemName={SOURCE_SYMBOLS[selected]} size={18} />
          <Text modifiers={[lineLimit(1)]}>{label}</Text>
          <Image systemName="chevron.down" size={12} />
          {busy && <ProgressView />}
        </HStack>
      </Button>
    </Host>
  );
}
