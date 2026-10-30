import { useMemo } from 'react';
import { useAppearancePreferences } from '@/stores/appearance-preferences';
import { miniPlayerColors, playerAccent } from './appearance';
import { useAppColorScheme, useColors } from './tokens';

export function useMiniPlayerColors() {
  const base = useColors();
  const scheme = useAppColorScheme();
  const preferences = useAppearancePreferences((state) => state.preferences);
  return useMemo(() => miniPlayerColors(base, preferences, scheme), [base, preferences, scheme]);
}
export function usePlayerAccent(background: readonly string[]) {
  const accent = useAppearancePreferences((state) => state.preferences.accent);
  return useMemo(() => playerAccent(accent, background), [accent, background]);
}
