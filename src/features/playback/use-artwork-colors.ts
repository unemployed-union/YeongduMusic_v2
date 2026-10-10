import { usePlayerBackgroundStore } from '@/stores/player-background';
import type { GradientColors } from './artwork-colors';

// Selection/extraction follows global playback, rather than the player's screen lifecycle.
export function useArtworkColors(): GradientColors {
  return usePlayerBackgroundStore((state) => state.colors);
}
