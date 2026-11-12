import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import { useHiddenFeatureAccess } from '@/stores/hidden-feature-access';
import { useHiddenMusicStore } from '@/stores/hidden-music';

/** Keep version activation and creator gestures independent across native and RN rows. */
export function useVersionSettings(onToast: (message: string) => void) {
  const { ready, busy, error, load, tapVersion, tapCreatorName, resetTaps } =
    useHiddenFeatureAccess();
  const [creatorOpen, setCreatorOpen] = useState(false);
  const creatorTaps = useRef({ count: 0, lastTap: 0 });
  useEffect(() => {
    void load();
  }, [load]);
  useFocusEffect(
    useCallback(
      () => () => {
        resetTaps();
        creatorTaps.current = { count: 0, lastTap: 0 };
        setCreatorOpen(false);
      },
      [resetTaps],
    ),
  );
  const configuredVersion: unknown = Constants.expoConfig?.extra?.buildVersion;
  const version =
    typeof configuredVersion === 'string'
      ? configuredVersion
      : (Constants.expoConfig?.version ?? '알 수 없음');
  async function activateVersion() {
    const enabled = await tapVersion();
    announceAccessChange(enabled);
  }
  function announceAccessChange(enabled: boolean | null) {
    if (enabled === null) {
      return;
    }
    if (!enabled) {
      useHiddenMusicStore.getState().lock();
    }
    onToast(enabled ? '숨김 설정 열림' : '숨김 설정 닫힘');
  }
  async function activateCreatorName() {
    if (Platform.OS !== 'ios' || !creatorOpen) {
      return;
    }
    const enabled = await tapCreatorName();
    if (enabled !== null) {
      closeCreator();
      announceAccessChange(enabled);
    }
  }
  function tapCreator() {
    if (creatorOpen) {
      return;
    }
    const now = Date.now();
    const previous = creatorTaps.current;
    const count = now - previous.lastTap > 3000 ? 1 : previous.count + 1;
    creatorTaps.current = { count, lastTap: now };
    const requiredTaps = Platform.OS === 'ios' ? 5 : 7;
    if (count === requiredTaps) {
      creatorTaps.current = { count: 0, lastTap: 0 };
      if (Platform.OS === 'ios') {
        resetTaps();
      }
      setCreatorOpen(true);
    }
  }
  function closeCreator() {
    creatorTaps.current = { count: 0, lastTap: 0 };
    if (Platform.OS === 'ios') {
      resetTaps();
    }
    setCreatorOpen(false);
  }
  return {
    ready,
    busy,
    error,
    version,
    creatorOpen,
    activateVersion,
    activateCreatorName,
    tapCreator,
    closeCreator,
  };
}
