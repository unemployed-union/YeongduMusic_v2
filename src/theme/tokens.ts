import { useColorScheme } from 'react-native';

export const palette = {
  light: { background: '#F8F8FA', surface: '#FFFFFF', text: '#17171B', muted: '#797980', separator: '#E5E5EA', tint: '#E53D67', tab: 'rgba(255,249,252,0.28)', mini: 'rgba(255,237,245,0.34)', chromeBorder: '#EECFD9', chromeMuted: '#886C79', miniControl: '#FFDAE6' },
  dark: { background: '#0C0D12', surface: '#1B1C23', text: '#F7F7FA', muted: '#9B9BA5', separator: '#31313A', tint: '#FF5C80', tab: 'rgba(29,22,34,0.32)', mini: 'rgba(55,32,52,0.40)', chromeBorder: '#624057', chromeMuted: '#BA9BAC', miniControl: '#67334E' },
};
export type AppColors = typeof palette.light;
export function useColors(): AppColors {
  return palette[useColorScheme() === 'dark' ? 'dark' : 'light'];
}
