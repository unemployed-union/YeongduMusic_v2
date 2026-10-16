import { useColorScheme } from 'react-native';
import { useThemePreferences } from '@/stores/theme-preferences';
import { resolveThemeMode } from './mode';
import { useAppearancePreferences } from '@/stores/appearance-preferences';
import { appearanceColors } from './appearance';

export const palette = {
  light: { rowPressed: '#00000006', rowSelected: '#0000000D', background: '#F8F8FA', surface: '#FFFFFF', text: '#17171B', muted: '#797980', separator: '#E5E5EA', tint: '#E53D67', tab: 'rgba(255,249,252,0.28)', mini: 'rgba(255,237,245,0.34)', chromeBorder: '#EECFD9', chromeMuted: '#886C79', miniControl: '#FFDAE6', switchThumbOff: '#FFFFFF', switchThumbOn: '#FFFFFF', switchThumbDisabled: '#C7C7CC' },
  dark: { rowPressed: '#FFFFFF0A', rowSelected: '#FFFFFF14', background: '#0C0D12', surface: '#1B1C23', text: '#F7F7FA', muted: '#9B9BA5', separator: '#31313A', tint: '#FF5C80', tab: 'rgba(29,22,34,0.32)', mini: 'rgba(55,32,52,0.40)', chromeBorder: '#624057', chromeMuted: '#BA9BAC', miniControl: '#67334E', switchThumbOff: '#9B9BA5', switchThumbOn: '#E9EBF2', switchThumbDisabled: '#646773' },
};
export type AppColors = typeof palette.light;
export function useAppColorScheme(): 'light' | 'dark' {
  const system = useColorScheme();
  const mode = useThemePreferences(state => state.mode);
  return resolveThemeMode(mode, system);
}
export function useColors(): AppColors {
  const scheme = useAppColorScheme();
  const preferences = useAppearancePreferences(state => state.preferences);
  return appearanceColors(palette[scheme], preferences, scheme);
}
