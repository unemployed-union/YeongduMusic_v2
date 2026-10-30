import type { ImageColorsResult } from 'react-native-image-colors';

export type GradientColors = readonly [string, string, string];
export const DEFAULT_PLAYER_COLORS: GradientColors = ['#663E66', '#283353', '#13141D'];
export const EXTRACTION_FALLBACK = '#010203';

function channels(color: string): number[] {
  const hex = color.slice(1);
  return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
}

function hex(channels: number[]): string {
  return '#' + channels.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('');
}

function valid(color: string | undefined): color is string {
  return !!color && /^#[0-9a-f]{6}$/i.test(color) && color.toLowerCase() !== EXTRACTION_FALLBACK;
}

function mix(from: string, to: string, progress: number): string {
  const a = channels(from);
  const b = channels(to);
  return hex(a.map((value, index) => value + (b[index] - value) * progress));
}

function darkTone(color: string, amount: number): string {
  let rgb = channels(mix('#101118', color, amount));
  // Bound luminance even for white/yellow artwork so white controls stay readable.
  const luminance = () =>
    rgb.reduce((sum, value, index) => {
      const channel = value / 255;
      const linear = channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      return sum + linear * [0.2126, 0.7152, 0.0722][index];
    }, 0);
  while (luminance() > 0.14) {
    rgb = rgb.map((value) => value * 0.92);
  }
  return hex(rgb);
}

export function createArtworkGradient(primary: string, secondary: string): GradientColors {
  if (!valid(primary) || !valid(secondary)) {
    return DEFAULT_PLAYER_COLORS;
  }
  return [darkTone(primary, 0.64), darkTone(secondary, 0.46), darkTone(primary, 0.16)];
}

export function gradientFromImageColors(result: ImageColorsResult): GradientColors {
  const primary = result.platform === 'ios' ? result.background : result.dominant;
  const secondary =
    result.platform === 'ios'
      ? [result.secondary, result.primary, primary].find(valid)
      : [result.vibrant, result.muted, primary].find(valid);
  return createArtworkGradient(valid(primary) ? primary : (secondary ?? ''), secondary ?? '');
}
