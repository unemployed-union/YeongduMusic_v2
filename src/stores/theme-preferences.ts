import { Appearance, Platform } from 'react-native';
import { create } from 'zustand';
import { parseThemeMode, type ThemeMode } from '@/theme/mode';

const KEY = 'yeongdumusic-theme-mode-v1';
type State = { mode: ThemeMode; ready: boolean; loading: boolean; saving: boolean; loadError: boolean; error: string | null;
  load: (force?: boolean) => Promise<void>; setMode: (mode: ThemeMode) => Promise<void> };
function applyNative(mode: ThemeMode) {
  if (Platform.OS !== 'web') Appearance.setColorScheme(mode === 'auto' ? 'unspecified' : mode);
}
async function read() {
  return Platform.OS === 'web' ? typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY)
    : (await import('expo-sqlite/kv-store')).default.getItem(KEY);
}
async function write(mode: ThemeMode) {
  if (Platform.OS === 'web') localStorage.setItem(KEY, mode);
  else await (await import('expo-sqlite/kv-store')).default.setItem(KEY, mode);
}
export const useThemePreferences = create<State>((set, get) => {
  let loading: Promise<void> | null = null, tail: Promise<void> = Promise.resolve(), writes = 0;
  return {
    mode: 'auto', ready: false, loading: false, saving: false, loadError: false, error: null,
    load: (force = false) => {
      if (loading) return loading;
      if (get().ready && !force) return Promise.resolve();
      set({ loading: true, error: null });
      loading = tail.then(async () => {
        const stored = await read();
        let mode: ThemeMode = 'auto', error: string | null = null;
        if (stored !== null) {
          try { mode = parseThemeMode(stored); }
          catch { error = '저장된 화면 모드를 확인하지 못해 자동 모드를 사용합니다. 모드를 다시 선택해 주세요.'; }
        }
        applyNative(mode);
        set({ mode, ready: true, loadError: false, error });
      }).catch(() => set({ ready: true, loadError: true, error: '화면 모드를 불러오지 못했습니다. 다시 불러와 주세요.' }))
        .finally(() => { loading = null; set({ loading: false }); });
      return loading;
    },
    setMode: async value => {
      const mode = parseThemeMode(value);
      await get().load();
      if (get().loadError) throw new Error('화면 모드를 먼저 다시 불러와 주세요.');
      writes++; set({ saving: true, error: null });
      const operation = tail.then(async () => {
        const previous = get().mode;
        await write(mode);
        try { applyNative(mode); }
        catch {
          await write(previous); applyNative(previous);
          throw new Error('화면 모드를 적용하지 못했습니다. 다시 시도해 주세요.');
        }
        set({ mode, error: null });
      });
      tail = operation.catch(() => {});
      try { await operation; }
      catch { const error = '화면 모드를 저장하거나 적용하지 못했습니다. 다시 시도해 주세요.'; set({ error }); throw new Error(error); }
      finally { writes--; set({ saving: writes > 0 }); }
    },
  };
});
