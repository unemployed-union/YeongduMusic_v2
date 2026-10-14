import { Platform } from 'react-native';
import { create } from 'zustand';
import { DEFAULT_HAPTIC_PREFERENCES, parseHapticPreferences, type HapticEventPreference, type HapticKind, type HapticPreferences } from '@/features/haptics/preferences';

const KEY = 'yeongdumusic-haptics-v1';
type State = { preferences: HapticPreferences; ready: boolean; loading: boolean; saving: boolean; loadError: boolean; error: string | null;
  load: (force?: boolean) => Promise<void>; setEnabled: (enabled: boolean) => Promise<void>;
  setEvent: (kind: HapticKind, change: Partial<HapticEventPreference>) => Promise<void>; restore: (preferences: HapticPreferences) => Promise<void> };
export const useHapticPreferences = create<State>((set, get) => {
  let loading: Promise<void> | null = null, tail: Promise<void> = Promise.resolve(), writes = 0;
  async function save(change: (current: HapticPreferences) => HapticPreferences) {
    await get().load();
    if (get().loadError) throw new Error('햅틱 설정을 먼저 다시 불러와 주세요.');
    writes++; set({ saving: true, error: null });
    const operation = tail.then(async () => {
      const preferences = parseHapticPreferences(change(get().preferences)), raw = JSON.stringify({ version: 1, preferences });
      if (Platform.OS === 'web') localStorage.setItem(KEY, raw);
      else await (await import('expo-sqlite/kv-store')).default.setItem(KEY, raw);
      set({ preferences, error: null });
    });
    tail = operation.catch(() => {});
    try { await operation; }
    catch { const error = '햅틱 설정을 저장하지 못했습니다. 다시 시도해 주세요.'; set({ error }); throw new Error(error); }
    finally { writes--; set({ saving: writes > 0 }); }
  }
  return {
    preferences: DEFAULT_HAPTIC_PREFERENCES, ready: false, loading: false, saving: false, loadError: false, error: null,
    load: (force = false) => {
      if (loading) return loading;
      if (get().ready && !force) return Promise.resolve();
      set({ loading: true, error: null });
      loading = tail.then(async () => {
        const raw = Platform.OS === 'web' ? typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY) : await (await import('expo-sqlite/kv-store')).default.getItem(KEY);
        const value = raw === null ? null : JSON.parse(raw);
        if (value && value.version !== 1) throw new Error('햅틱 설정 버전을 확인할 수 없습니다.');
        const preferences = raw === null ? DEFAULT_HAPTIC_PREFERENCES : parseHapticPreferences(value?.preferences);
        set({ preferences, ready: true, loadError: false, error: null });
      }).catch(() => set({ ready: true, loadError: true, error: '햅틱 설정을 불러오지 못했습니다. 다시 불러와 주세요.' }))
        .finally(() => { loading = null; set({ loading: false }); });
      return loading;
    },
    setEnabled: enabled => save(current => ({ ...current, enabled })),
    setEvent: (kind, change) => save(current => ({ ...current, events: { ...current.events, [kind]: { ...current.events[kind], ...change } } })),
    restore: value => { const preferences = parseHapticPreferences(value); return save(() => preferences); },
  };
});
