import { useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { useRawSongLibrary } from '@/features/library/queries';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import type { HiddenPreset } from '@/types/hidden-music';
import { hiddenMatcher } from './rules';

export function usePresetManager() {
  const { profile, busy, error, savePreset, removePreset, togglePreset, setBiometricLock } =
    useHiddenMusicStore();
  const query = useRawSongLibrary();
  const songs = query.data?.items;
  const [draft, setDraft] = useState<HiddenPreset | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const hiddenCount = useMemo(
    () => songs?.filter(hiddenMatcher(profile.presets)).length ?? 0,
    [songs, profile.presets],
  );
  async function run(operation: () => Promise<void>, success?: () => void) {
    setMessage(null);
    try {
      await operation();
      success?.();
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : '변경하지 못했습니다. 다시 시도해 주세요.',
      );
    }
  }
  function remove(preset: HiddenPreset) {
    Alert.alert(
      '프리셋 삭제',
      preset.name + ' 프리셋을 삭제합니다. 이 프리셋으로만 숨긴 음악은 다시 표시됩니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => void run(() => removePreset(preset.id)),
        },
      ],
    );
  }
  return {
    profile,
    busy,
    error,
    savePreset,
    togglePreset,
    setBiometricLock,
    query,
    songs,
    draft,
    setDraft,
    message,
    setMessage,
    hiddenCount,
    run,
    remove,
  };
}
