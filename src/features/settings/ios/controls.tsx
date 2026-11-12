import { playHaptic } from '@/services/haptics';
import { useColors } from '@/theme/tokens';
import { Button, Group, Picker, ProgressView, Text, Toggle } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  font,
  foregroundStyle,
  pickerStyle,
  tag,
  tint,
  disabled as unavailable,
} from '@expo/ui/swift-ui/modifiers';

export function SettingsToggle({
  label,
  value,
  disabled = false,
  busy = false,
  haptics = true,
  onChange,
}: {
  label: string;
  value: boolean;
  disabled?: boolean;
  busy?: boolean;
  haptics?: boolean;
  onChange: (value: boolean) => void;
}) {
  const colors = useColors();
  const blocked = disabled || busy;
  return (
    <Toggle
      label={label}
      isOn={value}
      modifiers={[tint(colors.tint), unavailable(blocked)]}
      onIsOnChange={(next) => {
        if (!blocked && next !== value) {
          if (haptics) {
            playHaptic('selection');
          }
          onChange(next);
        }
      }}
    />
  );
}

export function SettingsPicker<T extends string>({
  label,
  value,
  options,
  disabled = false,
  haptics = true,
  style = 'menu',
  onChange,
}: {
  label: string;
  value: T;
  haptics?: boolean;
  options: readonly { value: T; label: string; disabled?: boolean }[];
  style?: 'menu' | 'segmented';
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <Picker
      label={label}
      selection={value}
      modifiers={[pickerStyle(style), unavailable(disabled)]}
      onSelectionChange={(next) => {
        const option = options.find((item) => item.value === next);
        if (!disabled && option && !option.disabled && next !== value) {
          if (haptics) {
            playHaptic('selection');
          }
          onChange(next);
        }
      }}
    >
      {options.map((option) => (
        <Text key={option.value} modifiers={[tag(option.value), unavailable(!!option.disabled)]}>
          {option.label}
        </Text>
      ))}
    </Picker>
  );
}

export function SettingsNote({ children }: { children: string }) {
  return (
    <Text
      modifiers={[
        font({ textStyle: 'footnote' }),
        foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
      ]}
    >
      {children}
    </Text>
  );
}

export function SettingsFeedback({
  loading = false,
  error,
  disabled = false,
  onRetry,
}: {
  loading?: boolean;
  error?: string | null;
  disabled?: boolean;
  onRetry?: () => void;
}) {
  return (
    <Group>
      {loading && <ProgressView modifiers={[accessibilityLabel('설정 불러오는 중')]} />}
      {error && <Text modifiers={[foregroundStyle('red')]}>{error}</Text>}
      {error && onRetry && (
        <Button
          label="다시 불러오기"
          modifiers={[unavailable(disabled)]}
          onPress={() => {
            if (!disabled) {
              onRetry();
            }
          }}
        />
      )}
    </Group>
  );
}
