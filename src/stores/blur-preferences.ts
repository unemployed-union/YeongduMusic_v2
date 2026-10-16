import { Platform } from 'react-native';
import { create } from 'zustand';
import { BLUR_AREAS, DEFAULT_BLUR_PREFERENCES, blurIntensity, parseBlurPreferences, type BlurArea, type BlurPreferences } from '@/features/settings/blur-preferences';

const KEY = 'yeongdumusic-blur-enabled-v1';
type State = BlurPreferences & {
  ready: boolean; loading: boolean; saving: boolean; loadError: boolean; error: string | null;
  load: (force?: boolean) => Promise<void>; setEnabled: (enabled: boolean) => Promise<void>;
  setAreaEnabled: (area: BlurArea, enabled: boolean) => Promise<void>;
  setIntensity: (area: BlurArea, intensity: number) => Promise<void>;
  restore: (preferences: BlurPreferences) => Promise<void>;
};
async function read() {
  const value = Platform.OS === 'web' ? typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY)
    : await (await import('expo-sqlite/kv-store')).default.getItem(KEY);
  return parseBlurPreferences(value === null ? DEFAULT_BLUR_PREFERENCES : JSON.parse(value));
}
async function write(preferences: BlurPreferences) {
  const value = JSON.stringify(preferences);
  if (Platform.OS === 'web') localStorage.setItem(KEY, value);
  else await (await import('expo-sqlite/kv-store')).default.setItem(KEY, value);
}
export const useBlurPreferences = create<State>((set, get) => {
  let loading: Promise<void> | null = null, tail: Promise<void> = Promise.resolve(), writes = 0;
  async function save(update: (current: BlurPreferences) => BlurPreferences) {
    await get().load();
    if (get().loadError) throw new Error('블러 설정을 먼저 다시 불러와 주세요.');
    writes++; set({ saving: true, error: null });
    const operation = tail.then(async () => {
      const preferences = parseBlurPreferences(update(get()));
      await write(preferences); set({ ...preferences, error: null });
    });
    tail = operation.catch(() => {});
    try { await operation; }
    catch { const error = '블러 설정을 저장하지 못했습니다. 다시 시도해 주세요.'; set({ error }); throw new Error(error); }
    finally { writes--; set({ saving: writes > 0 }); }
  }
  function updateArea(area: BlurArea, option: Partial<BlurPreferences['areas'][BlurArea]>) {
    return save(current => {
      if (!BLUR_AREAS.includes(area)) throw new Error('Invalid blur area');
      return { ...current, areas: { ...current.areas, [area]: { ...current.areas[area], ...option } } };
    });
  }
  return {
    ...parseBlurPreferences(DEFAULT_BLUR_PREFERENCES), ready: false, loading: false, saving: false, loadError: false, error: null,
    load: (force = false) => {
      if (loading) return loading;
      if (get().ready && !force) return Promise.resolve();
      set({ loading: true, error: null });
      loading = tail.then(async () => set({ ...await read(), ready: true, loadError: false, error: null }))
        .catch(() => set({ ready: true, loadError: true, error: '블러 설정을 불러오지 못했습니다. 다시 불러와 주세요.' }))
        .finally(() => { loading = null; set({ loading: false }); });
      return loading;
    },
    setEnabled: enabled => save(current => ({ ...current, enabled })),
    setAreaEnabled: (area, enabled) => updateArea(area, { enabled }),
    setIntensity: (area, intensity) => updateArea(area, { intensity }),
    restore: preferences => { const parsed = parseBlurPreferences(preferences); return save(() => parsed); },
  };
});

export const useBlurIntensity = (area: BlurArea) => useBlurPreferences(state => state.ready && !state.loadError ? blurIntensity(state, area) : 0);
