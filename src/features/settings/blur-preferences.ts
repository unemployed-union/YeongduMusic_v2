export const BLUR_AREAS = ['libraryMenu', 'playerMenu', 'miniPlayer', 'tabBar'] as const;
export type BlurArea = typeof BLUR_AREAS[number];
export type BlurPreferences = { enabled: boolean; areas: Record<BlurArea, { enabled: boolean; intensity: number }> };
export const BLUR_LABELS: Record<BlurArea, string> = { libraryMenu: '보관함 메뉴', playerMenu: '재생 화면 메뉴', miniPlayer: '미니 플레이어', tabBar: '하단 메뉴' };
export const DEFAULT_BLUR_PREFERENCES: BlurPreferences = { enabled: true, areas: {
  libraryMenu: { enabled: true, intensity: 32 }, playerMenu: { enabled: true, intensity: 32 },
  miniPlayer: { enabled: true, intensity: 75 }, tabBar: { enabled: true, intensity: 75 },
} };
export function parseBlurPreferences(value: unknown): BlurPreferences {
  if (typeof value === 'boolean') return { ...parseBlurPreferences(DEFAULT_BLUR_PREFERENCES), enabled: value };
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('블러 설정이 올바르지 않습니다.');
  const raw = value as Record<string, unknown>, areas = raw.areas as Record<string, unknown> | undefined;
  if (typeof raw.enabled !== 'boolean' || !areas || typeof areas !== 'object' || Array.isArray(areas)) throw new Error('블러 설정이 올바르지 않습니다.');
  const result: BlurPreferences = { enabled: raw.enabled, areas: {} as BlurPreferences['areas'] };
  for (const area of BLUR_AREAS) {
    const option = areas[area] as Record<string, unknown> | undefined;
    if (!option || typeof option !== 'object' || Array.isArray(option) || typeof option.enabled !== 'boolean'
      || typeof option.intensity !== 'number' || !Number.isInteger(option.intensity) || option.intensity < 1 || option.intensity > 100) throw new Error('블러 설정이 올바르지 않습니다.');
    result.areas[area] = { enabled: option.enabled, intensity: option.intensity };
  }
  return result;
}
export function blurIntensity(preferences: BlurPreferences, area: BlurArea): number {
  return preferences.enabled && preferences.areas[area].enabled ? preferences.areas[area].intensity : 0;
}
