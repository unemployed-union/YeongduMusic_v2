import type { AppColors } from './tokens';

export const APPEARANCE_FIELDS = [
  'accent',
  'background',
  'playerBackground',
  'miniAccent',
  'miniBackground',
] as const;
export type AppearanceField = (typeof APPEARANCE_FIELDS)[number];
export type AppearancePreferences = Record<AppearanceField, string | null>;
export const DEFAULT_APPEARANCE: AppearancePreferences = {
  accent: null,
  background: null,
  playerBackground: null,
  miniAccent: null,
  miniBackground: null,
};
export const APPEARANCE_LABELS: Record<AppearanceField, string> = {
  accent: '앱 강조색',
  background: '앱 배경색',
  playerBackground: '재생 화면 배경색',
  miniAccent: '미니 플레이어 강조색',
  miniBackground: '미니 플레이어 배경색',
};
export function parseColor(value: unknown): string {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value.trim())) {
    throw new Error('색상은 #RRGGBB 형식으로 입력해 주세요.');
  }
  return value.trim().toUpperCase();
}
export function parseAppearance(value: unknown): AppearancePreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('색상 설정이 올바르지 않습니다.');
  }
  const raw = value as Record<string, unknown>;
  const result = { ...DEFAULT_APPEARANCE };
  for (const field of APPEARANCE_FIELDS) {
    result[field] = raw[field] === null ? null : parseColor(raw[field]);
  }
  return result;
}
const rgb = (color: string) =>
  [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16));
export function mixColor(from: string, to: string, amount: number): string {
  const a = rgb(from);
  const b = rgb(to);
  return (
    '#' +
    a
      .map((value, index) =>
        Math.round(value + (b[index] - value) * amount)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
      .toUpperCase()
  );
}
function luminance(color: string): number {
  return rgb(color).reduce((sum, channel, index) => {
    const value = channel / 255;
    return (
      sum +
      (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) *
        [0.2126, 0.7152, 0.0722][index]
    );
  }, 0);
}
export function colorContrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function foregroundColor(background: string): string {
  return colorContrast('#FFFFFF', background) >= colorContrast('#000000', background)
    ? '#FFFFFF'
    : '#000000';
}
export function readableAccent(color: string, backgrounds: readonly string[]): string {
  const target = foregroundColor(backgrounds[0]);
  for (let step = 0; step <= 100; step++) {
    const result = mixColor(color, target, step / 100);
    if (backgrounds.every((background) => colorContrast(result, background) >= 4.5)) {
      return result;
    }
  }
  return target;
}
// Stable token identities keep memoized lists from rerendering on every playback tick.
const appCache = new WeakMap<AppearancePreferences, WeakMap<AppColors, AppColors>>();
export function appearanceColors(
  base: AppColors,
  preferences: AppearancePreferences,
  scheme: 'light' | 'dark',
): AppColors {
  if (!preferences.accent && !preferences.background) {
    return base;
  }
  const existing = appCache.get(preferences)?.get(base);
  if (existing) {
    return existing;
  }
  const dark = scheme === 'dark';
  const seed = preferences.background;
  const background = seed
    ? mixColor(dark ? '#0C0D12' : '#FFFFFF', seed, dark ? 0.18 : 0.1)
    : base.background;
  const surface = seed
    ? mixColor(dark ? '#1B1C23' : '#FFFFFF', seed, dark ? 0.12 : 0.035)
    : base.surface;
  const tint = readableAccent(preferences.accent ?? base.tint, [background, surface]);
  const chromeMuted = mixColor(surface, base.text, 0.66);
  const chromeBorder = mixColor(surface, tint, 0.3);
  const result = {
    ...base,
    background,
    surface,
    tint,
    chromeMuted,
    chromeBorder,
    separator: mixColor(surface, base.text, 0.15),
    tab: mixColor(surface, tint, 0.05) + 'B3',
    mini: mixColor(surface, tint, 0.1) + 'B3',
    miniControl: mixColor(surface, tint, 0.2),
  };
  if (!appCache.has(preferences)) {
    appCache.set(preferences, new WeakMap());
  }
  appCache.get(preferences)!.set(base, result);
  return result;
}
export function miniPlayerColors(
  base: AppColors,
  preferences: AppearancePreferences,
  scheme: 'light' | 'dark',
): AppColors {
  if (!preferences.miniAccent && !preferences.miniBackground) {
    return base;
  }
  const surface = preferences.miniBackground
    ? mixColor(
        scheme === 'dark' ? '#101118' : '#FFFFFF',
        preferences.miniBackground,
        scheme === 'dark' ? 0.35 : 0.25,
      )
    : base.surface;
  const tint = readableAccent(preferences.miniAccent ?? base.tint, [surface]);
  return {
    ...base,
    surface,
    tint,
    mini: surface + 'E6',
    miniControl: mixColor(surface, tint, 0.2),
    chromeBorder: mixColor(surface, tint, 0.35),
    chromeMuted: mixColor(surface, base.text, 0.66),
  };
}
export function customPlayerBackground(color: string): readonly [string, string, string] {
  return [mixColor('#0C0D12', color, 0.36), mixColor('#0C0D12', color, 0.23), '#0C0D12'];
}
export function playerAccent(color: string | null, background: readonly string[]) {
  const accent = color ? readableAccent(color, background) : '#FFFFFF';
  return {
    accent,
    onAccent: color ? foregroundColor(accent) : '#2F2841',
    highlight: color ? accent : '#FF9BAE',
    selected: color ? accent : '#FFE4EB',
  };
}
