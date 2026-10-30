export type ThemeMode = 'auto' | 'light' | 'dark';
export function parseThemeMode(value: unknown): ThemeMode {
  if (value === 'auto' || value === 'light' || value === 'dark') {
    return value;
  }
  throw new Error('화면 모드는 다크·화이트·자동 중 하나를 선택해 주세요.');
}
export function resolveThemeMode(
  mode: ThemeMode,
  system: string | null | undefined,
): 'light' | 'dark' {
  if (mode === 'auto') {
    if (system === 'dark') {
      return 'dark';
    } else {
      return 'light';
    }
  } else {
    return mode;
  }
}
