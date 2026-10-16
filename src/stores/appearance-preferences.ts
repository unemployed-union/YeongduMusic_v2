import { Platform } from 'react-native';
import { create } from 'zustand';
import { APPEARANCE_FIELDS, DEFAULT_APPEARANCE, parseAppearance, type AppearanceField, type AppearancePreferences } from '@/theme/appearance';

const KEY = 'yeongdumusic-appearance-v1';
type State = {
  preferences: AppearancePreferences; ready: boolean; loading: boolean; saving: boolean; loadError: boolean; error: string | null;
  load: (force?: boolean) => Promise<void>; setColor: (field: AppearanceField, color: string | null) => Promise<void>;
  restore: (preferences: AppearancePreferences) => Promise<void>;
};
async function read() {
  return Platform.OS === 'web' ? typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY)
    : (await import('expo-sqlite/kv-store')).default.getItem(KEY);
}
async function write(preferences: AppearancePreferences) {
  const value = JSON.stringify(preferences);
  if (Platform.OS === 'web') localStorage.setItem(KEY, value);
  else await (await import('expo-sqlite/kv-store')).default.setItem(KEY, value);
}
export const useAppearancePreferences = create<State>((set, get) => {
  let loading: Promise<void> | null = null, tail: Promise<void> = Promise.resolve(), writes = 0;
  async function save(update: (current: AppearancePreferences) => AppearancePreferences) {
    await get().load();
    if (get().loadError) throw new Error('색상 설정을 먼저 다시 불러와 주세요.');
    writes++; set({ saving: true, error: null });
    const operation = tail.then(async () => {
      const preferences = parseAppearance(update(get().preferences));
      await write(preferences); set({ preferences, error: null });
    });
    tail = operation.catch(() => {});
    try { await operation; }
    catch { const error = '색상 설정을 저장하지 못했습니다. 다시 시도해 주세요.'; set({ error }); throw new Error(error); }
    finally { writes--; set({ saving: writes > 0 }); }
  }
  return {
    preferences: { ...DEFAULT_APPEARANCE }, ready: false, loading: false, saving: false, loadError: false, error: null,
    load: (force = false) => {
      if (loading) return loading;
      if (get().ready && !force) return Promise.resolve();
      set({ loading: true, error: null });
      loading = tail.then(async () => {
        const stored = await read(), preferences = stored === null ? { ...DEFAULT_APPEARANCE } : parseAppearance(JSON.parse(stored));
        set({ preferences, ready: true, loadError: false, error: null });
      }).catch(() => set({ ready: true, loadError: true, error: '색상 설정을 불러오지 못했습니다. 다시 불러와 주세요.' }))
        .finally(() => { loading = null; set({ loading: false }); });
      return loading;
    },
    setColor: (field, color) => save(current => {
      if (!APPEARANCE_FIELDS.includes(field)) throw new Error('Invalid color field');
      return { ...current, [field]: color };
    }),
    restore: preferences => { const parsed = parseAppearance(preferences); return save(() => parsed); },
  };
});
