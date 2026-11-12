import { HStack, SecureField, Text, TextField, VStack, useNativeState } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  autocorrectionDisabled,
  fixedSize,
  font,
  frame,
  keyboardType,
  multilineTextAlignment,
  textContentType,
  textInputAutocapitalization,
  disabled as unavailable,
} from '@expo/ui/swift-ui/modifiers';
import { useEffect } from 'react';

/** SwiftUI owns editing; the existing form state still owns validation, saving and secret clearing. */
export function SettingsField({
  label,
  value,
  onChange,
  disabled = false,
  secure = false,
  url = false,
  maxLength,
  keyboard,
  contentType,
  placeholder,
  layout = 'stacked',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  secure?: boolean;
  url?: boolean;
  maxLength?: number;
  keyboard?: Parameters<typeof keyboardType>[0];
  contentType?: Parameters<typeof textContentType>[0];
  placeholder?: string;
  layout?: 'stacked' | 'inline' | 'plain';
}) {
  const text = useNativeState(value);
  useEffect(() => {
    if (text.get() !== value) {
      text.set(value);
    }
  }, [text, value]);
  const Input = secure ? SecureField : TextField;
  const input = (
    <Input
      text={text}
      placeholder={placeholder ?? label}
      maxLength={maxLength}
      modifiers={[
        accessibilityLabel(label),
        unavailable(disabled),
        autocorrectionDisabled(),
        textInputAutocapitalization('never'),
        keyboardType(keyboard ?? (url ? 'url' : 'default')),
        ...(contentType ? [textContentType(contentType)] : []),
        ...(layout === 'inline'
          ? [frame({ maxWidth: Infinity }), multilineTextAlignment('trailing')]
          : []),
      ]}
      onTextChange={(next) => {
        if (!disabled) {
          onChange(next);
        }
      }}
    />
  );
  if (layout === 'plain') {
    return input;
  }
  if (layout === 'inline') {
    return (
      <HStack alignment="firstTextBaseline" spacing={16}>
        <Text modifiers={[fixedSize({ horizontal: true, vertical: false })]}>{label}</Text>
        {input}
      </HStack>
    );
  }
  return (
    <VStack alignment="leading" spacing={6}>
      <Text modifiers={[font({ textStyle: 'footnote' })]}>{label}</Text>
      {input}
    </VStack>
  );
}
