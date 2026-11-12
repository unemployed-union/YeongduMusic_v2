import { useCallback, useEffect } from 'react';
import { useFocusEffect } from 'expo-router';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import { useHiddenFeatureAccess } from '@/stores/hidden-feature-access';

export function useHiddenSettingsGate() {
  const { scope, ready, profile, unlocked, busy, error, unlock, lock, load } =
    useHiddenMusicStore();
  const { ready: accessReady, enabled: accessEnabled, load: loadAccess } = useHiddenFeatureAccess();
  useEffect(() => {
    void loadAccess();
  }, [loadAccess]);
  useFocusEffect(useCallback(() => () => lock(), [lock]));
  return { scope, ready, profile, unlocked, busy, error, unlock, load, accessReady, accessEnabled };
}
