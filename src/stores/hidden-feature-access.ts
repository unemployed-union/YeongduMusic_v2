import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const KEY = 'yeongdumusic-hidden-feature-access-v1';
const QUICK_HIDE_KEY = 'yeongdumusic-quick-hide-v1';
const TAP_GAP_MS = 3000;
export type QuickHideMode = 'off' | 'all' | 'preset';
type HiddenFeatureAccess = {
  enabled: boolean; quickHideEnabled: boolean; quickHideMode: QuickHideMode; ready: boolean; busy: boolean; error: string | null;
  load: (force?: boolean) => Promise<void>;
  tapVersion: () => Promise<boolean | null>;
  disable: () => Promise<boolean>;
  setQuickHideEnabled: (enabled: boolean) => Promise<void>;
  setQuickHideMode: (mode: QuickHideMode) => Promise<void>;
  restoreEnabled: (enabled: boolean) => Promise<void>;
  resetTaps: () => void;
};

async function readSetting(key: string) {
  return Platform.OS === 'web' ? (typeof localStorage === 'undefined' ? null : localStorage.getItem(key)) : SecureStore.getItemAsync(key);
}
async function writeSetting(key: string, value: boolean | string) {
  if (Platform.OS === 'web') localStorage.setItem(key, String(value));
  else await SecureStore.setItemAsync(key, String(value));
}

export const useHiddenFeatureAccess = create<HiddenFeatureAccess>((set, get) => {
  let loading: Promise<void> | null = null;
  let taps = 0, lastTap = 0;
  const resetTaps = () => { taps = 0; lastTap = 0; };
  async function saveEnabled(enabled: boolean): Promise<boolean | null> {
    resetTaps();
    set({ busy: true, error: null });
    try {
      await writeSetting(KEY, enabled);
      set({ enabled });
      return enabled;
    } catch { set({ error: '설정을 저장하지 못했습니다. 다시 시도해 주세요.' }); return null; }
    finally { set({ busy: false }); }
  }
  return {
    enabled: false, quickHideEnabled: true, quickHideMode: 'all', ready: false, busy: false, error: null, resetTaps,
    load: (force = false) => {
      if (loading) return loading;
      if (get().busy || get().ready && !force) return Promise.resolve();
      loading = (async () => {
        try {
          const [value, quickHide] = await Promise.all([readSetting(KEY), readSetting(QUICK_HIDE_KEY)]);
          // Keep existing true/false preferences while storing one exclusive mode.
          const quickHideMode = quickHide === 'preset' ? 'preset' : quickHide === 'false' ? 'off' : 'all';
          set({ enabled: value === 'true', quickHideMode, quickHideEnabled: quickHideMode !== 'off', ready: true, error: null });
        } catch { set({ enabled: false, ready: true, error: '설정을 불러오지 못했습니다. 버전을 다시 눌러 주세요.' }); }
        finally { loading = null; }
      })();
      return loading;
    },
    tapVersion: async () => {
      await get().load();
      if (get().busy) return null;
      const now = Date.now();
      if (now - lastTap > TAP_GAP_MS) taps = 0;
      lastTap = now;
      taps++;
      if (taps < (get().enabled ? 5 : 15)) return null;
      return saveEnabled(!get().enabled);
    },
    disable: async () => {
      await get().load();
      if (get().busy) return false;
      return (await saveEnabled(false)) === false;
    },
    setQuickHideEnabled: (enabled) => get().setQuickHideMode(enabled ? 'all' : 'off'),
    restoreEnabled: async (enabled) => {
      await get().load();
      if (get().busy) throw new Error('설정을 저장 중입니다. 잠시 후 다시 시도해 주세요.');
      if (await saveEnabled(enabled) !== enabled) throw new Error(get().error ?? '설정을 저장하지 못했습니다.');
    },
    setQuickHideMode: async (quickHideMode) => {
      await get().load();
      if (get().busy) return;
      set({ busy: true, error: null });
      try {
        await writeSetting(QUICK_HIDE_KEY, quickHideMode === 'preset' ? 'preset' : quickHideMode === 'all');
        set({ quickHideMode, quickHideEnabled: quickHideMode !== 'off' });
      } catch { set({ error: '빠른 숨기기 설정을 저장하지 못했습니다. 다시 시도해 주세요.' }); }
      finally { set({ busy: false }); }
    },
  };
});
