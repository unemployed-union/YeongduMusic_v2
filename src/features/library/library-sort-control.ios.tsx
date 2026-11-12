import { Button, Host, HStack, Image, Menu, Text } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  buttonStyle,
  controlSize,
  foregroundStyle,
  frame,
  lineLimit,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { useAppColorScheme, useColors } from '@/theme/tokens';
import { SORT_LABELS, SORT_TAB_LABELS, SORT_ORDERS } from './library-sort-options';
import type { LibrarySortControlProps } from './library-sort-control';

/** Short sorting choices belong in a native menu, without another navigation sheet. */
export function LibrarySortControl({ tab, order, onChange }: LibrarySortControlProps) {
  const colors = useColors();
  const scheme = useAppColorScheme();
  const title = SORT_TAB_LABELS[tab] + ' 정렬';
  return (
    <Host matchContents colorScheme={scheme} seedColor={colors.tint} style={{ flexShrink: 1 }}>
      <Menu
        label={
          <HStack spacing={6}>
            <Image systemName="arrow.up.arrow.down" size={18} />
            <Text modifiers={[lineLimit(1)]}>{SORT_LABELS[order]}</Text>
          </HStack>
        }
        modifiers={[
          buttonStyle('bordered'),
          controlSize('regular'),
          frame({ minHeight: 44 }),
          tint(colors.tint),
          foregroundStyle(colors.tint),
          accessibilityLabel(title + ': ' + SORT_LABELS[order]),
        ]}
      >
        {SORT_ORDERS.map((value) => (
          <Button
            key={value}
            label={SORT_LABELS[value]}
            systemImage={value === order ? 'checkmark' : undefined}
            modifiers={[
              accessibilityLabel(SORT_LABELS[value] + (value === order ? ', 선택됨' : '')),
            ]}
            onPress={() => {
              if (value !== order) {
                onChange(value);
              }
            }}
          />
        ))}
      </Menu>
    </Host>
  );
}
