import { usePlayerBackgroundStore } from '@/stores/player-background';
import type { GradientColors } from './artwork-colors';
import { useMemo } from 'react';
import { useAppearancePreferences } from '@/stores/appearance-preferences';
import { customPlayerBackground } from '@/theme/appearance';

// Selection/extraction follows global playback, rather than the player's screen lifecycle.
export function useArtworkColors(): GradientColors {
  const colors = usePlayerBackgroundStore((state) => state.colors);
  const custom = useAppearancePreferences(state => state.preferences.playerBackground);
  return useMemo(() => custom ? customPlayerBackground(custom) : colors, [custom, colors]);
}
