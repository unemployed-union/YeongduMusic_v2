import { Host, Picker, Text } from '@expo/ui/swift-ui';
import { controlSize, frame, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { useAppColorScheme, useColors } from '@/theme/tokens';
import { useLiquidGlass } from '@/theme/liquid-glass';
import { MENU_LABELS } from '@/features/settings/menu-layout';
import type { LibrarySegmentsProps } from './library-segments';

/** SwiftUI owns the lifting, stretching selection lens and its drag gesture. */
export function LibrarySegments({ tabs, selected, onSelect, fallback }: LibrarySegmentsProps) {
  const glass = useLiquidGlass();
  const colors = useColors();
  const scheme = useAppColorScheme();
  if (!glass.enabled) {
    return fallback;
  }
  return (
    <Host
      matchContents={{ vertical: true }}
      ignoreSafeArea="all"
      colorScheme={scheme}
      seedColor={colors.tint}
      style={{ marginHorizontal: 22, marginTop: 5, marginBottom: 16 }}
    >
      <Picker
        label="보관함 분류"
        testID="library-native-segments"
        selection={selected}
        onSelectionChange={(next) => {
          if (tabs.includes(next) && next !== selected) {
            onSelect(next);
          }
        }}
        modifiers={[pickerStyle('segmented'), controlSize('large'), frame({ minHeight: 44 })]}
      >
        {tabs.map((tab) => (
          <Text key={tab} modifiers={[tag(tab)]}>
            {MENU_LABELS[tab]}
          </Text>
        ))}
      </Picker>
    </Host>
  );
}
