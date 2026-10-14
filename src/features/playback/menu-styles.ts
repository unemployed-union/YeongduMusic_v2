import type { TextStyle, ViewStyle } from 'react-native';
import type { AppColors } from '@/theme/tokens';

/** Shared option screens inherit the same readable colors as their menu card. */
export function themedMenuStyles<T extends Record<string, TextStyle | ViewStyle>>(base: T, colors: AppColors): T {
  const overrides: Record<string, TextStyle | ViewStyle> = {
    heading: { color: colors.text }, label: { color: colors.text }, unit: { color: colors.muted },
    description: { color: colors.muted }, input: { color: colors.text, borderColor: colors.separator },
    selected: { color: colors.tint }, accent: { color: colors.tint }, error: { color: colors.tint },
    cancel: { color: colors.tint }, applyText: { color: colors.tint },
    pressed: { backgroundColor: colors.separator }, apply: { backgroundColor: colors.tint + '25' },
  };
  return Object.fromEntries(Object.entries(base).map(([key, value]) => [key, { ...value, ...overrides[key] }])) as T;
}
