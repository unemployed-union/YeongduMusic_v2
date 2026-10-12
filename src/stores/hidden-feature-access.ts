import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const KEY = 'yeongdumusic-hidden-feature-access-v1';
const TAP_GAP_MS = 3000;
type HiddenFeatureAccess = {
  enabled: boolean; ready: boolean; busy: boolean; error: string | null;
  load: () => Promise<void>;
  tapVersion: () => Promise<boolean | null>;
  resetTaps: () => void;
};

export const useHiddenFeatureAccess = create<HiddenFeatureAccess>((set, get) => {
  let loading: Promise<void> | null = null;
  let taps = 0, lastTap = 0;
  const resetTaps = () => { taps = 0; lastTap = 0; };
  return {
    enabled: false, ready: false, busy: false, error: null, resetTaps,
    load: () => {
      if (loading) return loading;
      if (get().ready) return Promise.resolve();
      loading = (async () => {
        try {
          const value = Platform.OS === 'web'
            ? (typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY))
            : await SecureStore.getItemAsync(KEY);
          set({ enabled: value === 'true', ready: true, error: null });
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
      resetTaps();
      const enabled = !get().enabled;
      set({ busy: true, error: null });
      try {
        if (Platform.OS === 'web') localStorage.setItem(KEY, String(enabled));
        else await SecureStore.setItemAsync(KEY, String(enabled));
        set({ enabled });
        return enabled;
      } catch { set({ error: '설정을 저장하지 못했습니다. 다시 시도해 주세요.' }); return null; }
      finally { set({ busy: false }); }
    },
  };
});
