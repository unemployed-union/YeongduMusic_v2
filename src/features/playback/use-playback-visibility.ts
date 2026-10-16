import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from 'expo-router';

const foreground = () => AppState.currentState !== 'background' && AppState.currentState !== 'inactive';
const subscribe = (notify: () => void) => {
  const subscription = AppState.addEventListener('change', notify);
  return () => subscription.remove();
};

/** Visual playback work is unnecessary behind another route or a locked screen. */
export function usePlaybackVisibility() {
  const focused = useIsFocused();
  return useSyncExternalStore(subscribe, foreground, foreground) && focused;
}
