import { StyleSheet } from 'react-native';
import { GlassView } from 'expo-glass-effect';
import { useAppColorScheme } from '@/theme/tokens';
import { useLiquidGlass } from '@/theme/liquid-glass';
import type { GlassBackdropProps } from './glass-backdrop';

/** Background only: controls above it retain their existing touch handling. */
export function GlassBackdrop({ style, dark, interactive = false, tintColor }: GlassBackdropProps) {
  const scheme = useAppColorScheme();
  const glass = useLiquidGlass();
  if (!glass.enabled) {
    return null;
  }
  return (
    <GlassView
      pointerEvents="none"
      glassEffectStyle="regular"
      colorScheme={dark ? 'dark' : scheme}
      isInteractive={interactive}
      tintColor={tintColor}
      style={[StyleSheet.absoluteFill, style]}
    />
  );
}
