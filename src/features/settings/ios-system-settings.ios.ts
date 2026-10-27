import { useEffect } from 'react';
import { AppState, Settings } from 'react-native';
import { create } from 'zustand';
import { useThemePreferences } from '@/stores/theme-preferences';
import { useStreamingPreferences } from '@/stores/streaming-preferences';
import { useDisplayPreferences } from '@/stores/display-preferences';
import { useHapticPreferences } from '@/stores/haptic-preferences';
import { useBlurPreferences } from '@/stores/blur-preferences';
import { SYSTEM_SETTINGS_KEYS, startSystemSettingsSync, type SystemAppPreferences } from './system-settings-sync';

// The config plugin registers this only in binaries that contain Settings.bundle.
// An OTA update or Expo Go therefore cannot hide the only working settings UI.
export const isIosSystemSettingsAvailable = Settings.get('ym_settings_bundle_version') === 1;
const useStatus = create<{ ready: boolean; error: string | null }>(() => ({ ready: !isIosSystemSettingsAvailable, error: null }));
let activeSync: ReturnType<typeof startSystemSettingsSync> | null = null;
const stores = [useThemePreferences, useStreamingPreferences, useDisplayPreferences, useHapticPreferences, useBlurPreferences];
function snapshot(): SystemAppPreferences {
  const blur = useBlurPreferences.getState();
  return { theme: useThemePreferences.getState().mode, quality: useStreamingPreferences.getState().quality,
    hideArtwork: useDisplayPreferences.getState().hideArtwork, haptics: useHapticPreferences.getState().preferences,
    blur: { enabled: blur.enabled, areas: blur.areas } };
}
async function load() {
  await Promise.all(stores.map(store => {
    const state = store.getState();
    return state.load(!!state.error);
  }));
  if (stores.some(store => !store.getState().ready || store.getState().error)) throw new Error('Preference storage unavailable');
}
async function apply(next: SystemAppPreferences) {
  const current = snapshot();
  const operations: Promise<void>[] = [];
  if (next.theme !== current.theme) operations.push(useThemePreferences.getState().setMode(next.theme));
  if (next.quality !== current.quality) operations.push(useStreamingPreferences.getState().setQuality(next.quality));
  if (next.hideArtwork !== current.hideArtwork) operations.push(useDisplayPreferences.getState().setHideArtwork(next.hideArtwork));
  if (JSON.stringify(next.haptics) !== JSON.stringify(current.haptics)) operations.push(useHapticPreferences.getState().restore(next.haptics));
  if (JSON.stringify(next.blur) !== JSON.stringify(current.blur)) operations.push(useBlurPreferences.getState().restore(next.blur));
  const results = await Promise.allSettled(operations);
  if (results.some(result => result.status === 'rejected')) throw new Error('Preference update failed');
}
export function useIosSystemSettingsReady() {
  const ready = useStatus(state => state.ready);
  useEffect(() => {
    if (!isIosSystemSettingsAvailable) return;
    const sync = startSystemSettingsSync({ load, snapshot, apply,
      read: () => Object.fromEntries(SYSTEM_SETTINGS_KEYS.map(key => [key, Settings.get(key)])),
      write: values => Settings.set(values),
      subscribe: listener => {
        const unsubscribers = stores.map(store => store.subscribe(listener));
        return () => unsubscribers.forEach(unsubscribe => unsubscribe());
      },
      watch: listener => {
        const watch = Settings.watchKeys(SYSTEM_SETTINGS_KEYS, listener);
        const lifecycle = AppState.addEventListener('change', state => { if (state === 'active') listener(); });
        return () => { Settings.clearWatch(watch); lifecycle.remove(); };
      },
      status: (ready, error) => useStatus.setState({ ready, error }),
    });
    activeSync = sync;
    return () => { sync.stop(); if (activeSync === sync) activeSync = null; };
  }, []);
  return ready;
}
export const useIosSystemSettingsStatus = () => useStatus();
export async function refreshIosSystemSettings() { await activeSync?.refresh(); }
