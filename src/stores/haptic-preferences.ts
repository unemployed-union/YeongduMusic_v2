import { create } from 'zustand';
import {
  DEFAULT_HAPTIC_PREFERENCES,
  parseHapticPreferences,
  type HapticEventPreference,
  type HapticKind,
  type HapticPreferences,
} from '@/features/haptics/preferences';
import {
  createPreferencePersistence,
  type PreferenceStatus,
} from '@/services/preferences/persistence';

type State = PreferenceStatus & {
  preferences: HapticPreferences;
  load: (force?: boolean) => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
  setEvent: (kind: HapticKind, change: Partial<HapticEventPreference>) => Promise<void>;
  restore: (preferences: HapticPreferences) => Promise<void>;
};

function decodeHaptics(value: unknown): HapticPreferences {
  const stored = value as { version?: unknown; preferences?: unknown } | null;
  if (stored && stored.version !== 1) throw new Error('햅틱 설정 버전을 확인할 수 없습니다.');
  return parseHapticPreferences(stored?.preferences);
}

export const useHapticPreferences = create<State>((set, get) => {
  const persistence = createPreferencePersistence<HapticPreferences>({
    key: 'yeongdumusic-haptics-v1',
    defaultValue: DEFAULT_HAPTIC_PREFERENCES,
    parse: parseHapticPreferences,
    decode: decodeHaptics,
    encode: (preferences) => ({ version: 1, preferences }),
    getStatus: get,
    getValue: () => get().preferences,
    setStatus: (status) => set(status),
    setValue: (preferences, status) => set({ preferences, ...status }),
    messages: {
      load: '햅틱 설정을 불러오지 못했습니다. 다시 불러와 주세요.',
      save: '햅틱 설정을 저장하지 못했습니다. 다시 시도해 주세요.',
      blocked: '햅틱 설정을 먼저 다시 불러와 주세요.',
    },
  });
  return {
    preferences: DEFAULT_HAPTIC_PREFERENCES,
    ...persistence.initial,
    load: persistence.load,
    setEnabled: (enabled) => persistence.save((current) => ({ ...current, enabled })),
    setEvent: (kind, change) =>
      persistence.save((current) => ({
        ...current,
        events: { ...current.events, [kind]: { ...current.events[kind], ...change } },
      })),
    restore: (value) => {
      const preferences = parseHapticPreferences(value);
      return persistence.save(() => preferences);
    },
  };
});
