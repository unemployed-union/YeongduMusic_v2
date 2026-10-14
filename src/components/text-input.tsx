import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput as NativeTextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@/theme/tokens';

export type TextInputHandle = NativeTextInput;
const layoutKeys = ['flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf', 'width', 'minWidth', 'maxWidth', 'height', 'minHeight', 'maxHeight',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical', 'marginStart', 'marginEnd', 'position', 'top', 'bottom', 'left', 'right'] as const;

/** Keep field refs and submit behavior while offering the same clear control on every platform. */
export const TextInput = forwardRef<NativeTextInput, TextInputProps>(function TextInput({ style, value, defaultValue, onChangeText, editable, readOnly, accessibilityLabel, ...props }, ref) {
  const colors = useColors(), input = useRef<NativeTextInput>(null), [draft, setDraft] = useState(defaultValue ?? '');
  useImperativeHandle(ref, () => input.current!, []);
  const resolved = StyleSheet.flatten(style) ?? {}, layout: ViewStyle = {};
  for (const key of layoutKeys) if (resolved[key] !== undefined) Object.assign(layout, { [key]: resolved[key] });
  const field = { ...resolved };
  for (const key of layoutKeys) delete field[key];
  const canClear = editable !== false && !readOnly && (value ?? draft).length > 0;
  const color = typeof resolved.color === 'string' ? resolved.color : colors.muted;
  const padding = resolved.paddingRight ?? resolved.paddingHorizontal ?? resolved.padding ?? 0;
  const rightPadding = Math.max(44, typeof padding === 'number' ? padding + 38 : 44);
  function change(text: string) { setDraft(text); onChangeText?.(text); }
  function clear() {
    if (!canClear) return;
    if (value === undefined) input.current?.clear();
    change(''); input.current?.focus();
  }
  return <View style={[{ minHeight: 44 }, layout]}>
    <NativeTextInput {...props} ref={input} value={value} defaultValue={defaultValue} editable={editable} readOnly={readOnly} accessibilityLabel={accessibilityLabel}
      clearButtonMode="never" onChangeText={change} style={[field, { flex: 1, paddingRight: canClear ? rightPadding : padding }]} />
    {canClear && <Pressable accessibilityRole="button" accessibilityLabel={`${accessibilityLabel || props.placeholder || '입력 내용'} 전체 지우기`}
      onPress={clear} style={styles.clear} hitSlop={2}><Ionicons name="close-circle" size={20} color={color} /></Pressable>}
  </View>;
});
const styles = StyleSheet.create({ clear: { position: 'absolute', top: 0, bottom: 0, right: 1, width: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' } });
