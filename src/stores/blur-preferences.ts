import { create } from 'zustand';
import {
  BLUR_AREAS,
  DEFAULT_BLUR_PREFERENCES,
  blurIntensity,
  parseBlurPreferences,
  type BlurArea,
  type BlurPreferences,
} from '@/features/settings/blur-preferences';
import {
  createPreferencePersistence,
  type PreferenceStatus,
} from '@/services/preferences/persistence';

type State = BlurPreferences &
  PreferenceStatus & {
    load: (force?: boolean) => Promise<void>;
    setEnabled: (enabled: boolean) => Promise<void>;
    setAreaEnabled: (area: BlurArea, enabled: boolean) => Promise<void>;
    setIntensity: (area: BlurArea, intensity: number) => Promise<void>;
    restore: (preferences: BlurPreferences) => Promise<void>;
  };

export const useBlurPreferences = create<State>((set, get) => {
  const defaults = parseBlurPreferences(DEFAULT_BLUR_PREFERENCES);
  const persistence = createPreferencePersistence<BlurPreferences>({
    key: 'yeongdumusic-blur-enabled-v1',
    defaultValue: defaults,
    parse: parseBlurPreferences,
    getStatus: get,
    getValue: () => ({ enabled: get().enabled, areas: get().areas }),
    setStatus: (status) => set(status),
    setValue: (value, status) => set({ ...value, ...status }),
    messages: {
      load: '블러 설정을 불러오지 못했습니다. 다시 불러와 주세요.',
      save: '블러 설정을 저장하지 못했습니다. 다시 시도해 주세요.',
      blocked: '블러 설정을 먼저 다시 불러와 주세요.',
    },
  });

  function updateArea(area: BlurArea, option: Partial<BlurPreferences['areas'][BlurArea]>) {
    return persistence.save((current) => {
      if (!BLUR_AREAS.includes(area)) {
        throw new Error('Invalid blur area');
      }
      return {
        ...current,
        areas: { ...current.areas, [area]: { ...current.areas[area], ...option } },
      };
    });
  }

  return {
    ...defaults,
    ...persistence.initial,
    load: persistence.load,
    setEnabled: (enabled) => persistence.save((current) => ({ ...current, enabled })),
    setAreaEnabled: (area, enabled) => updateArea(area, { enabled }),
    setIntensity: (area, intensity) => updateArea(area, { intensity }),
    restore: (value) => {
      const parsed = parseBlurPreferences(value);
      return persistence.save(() => parsed);
    },
  };
});

export const useBlurIntensity = (area: BlurArea) =>
  useBlurPreferences((state) => (state.ready && !state.loadError ? blurIntensity(state, area) : 0));
