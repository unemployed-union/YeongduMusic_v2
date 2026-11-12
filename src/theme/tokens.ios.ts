import { useAppearancePreferences } from '@/stores/appearance-preferences';
import { appearanceColors } from './appearance';
import { palette as basePalette, useAppColorScheme } from './tokens.shared';
import type { AppColors } from './tokens.shared';

export { useAppColorScheme } from './tokens.shared';
export type { AppColors } from './tokens.shared';

/** UIKit semantic roles, with stable identities for virtualized lists. */
export const palette = {
  light: {
    ...basePalette.light,
    background: '#FFFFFF',
    surface: '#F2F2F7',
    text: '#000000',
    muted: '#8A8A8E',
    separator: '#C6C6C8',
  },
  dark: {
    ...basePalette.dark,
    background: '#000000',
    surface: '#1C1C1E',
    text: '#FFFFFF',
    muted: '#98989D',
    separator: '#38383A',
  },
};

export function useColors(): AppColors {
  const scheme = useAppColorScheme();
  const preferences = useAppearancePreferences((state) => state.preferences);
  return appearanceColors(palette[scheme], preferences, scheme);
}
