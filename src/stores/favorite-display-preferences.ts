import { create } from 'zustand';
import {
  DEFAULT_FAVORITE_DISPLAY,
  parseFavoriteDisplay,
  type FavoriteDisplayPreferences,
} from '@/features/favorites/display-preferences';
import {
  createPreferencePersistence,
  type PreferenceStatus,
} from '@/services/preferences/persistence';

type State = PreferenceStatus & {
  preferences: FavoriteDisplayPreferences;
  load: (force?: boolean) => Promise<void>;
  setOption: (key: keyof FavoriteDisplayPreferences, value: boolean) => Promise<void>;
  restore: (preferences: FavoriteDisplayPreferences) => Promise<void>;
};

export const useFavoriteDisplayPreferences = create<State>((set, get) => {
  const persistence = createPreferencePersistence<FavoriteDisplayPreferences>({
    key: 'yeongdumusic-favorite-display-v1',
    defaultValue: DEFAULT_FAVORITE_DISPLAY,
    parse: parseFavoriteDisplay,
    getStatus: get,
    getValue: () => get().preferences,
    setStatus: (status) => set(status),
    setValue: (preferences, status) => set({ preferences, ...status }),
    messages: {
      load: '좋아요 버튼 표시 설정을 불러오지 못했습니다. 다시 불러와 주세요.',
      save: '좋아요 버튼 표시 설정을 저장하지 못했습니다. 다시 시도해 주세요.',
      blocked: '좋아요 버튼 표시 설정을 먼저 다시 불러와 주세요.',
    },
  });
  return {
    preferences: DEFAULT_FAVORITE_DISPLAY,
    ...persistence.initial,
    load: persistence.load,
    setOption: (key, value) => persistence.save((current) => ({ ...current, [key]: value })),
    restore: (value) => {
      const preferences = parseFavoriteDisplay(value);
      return persistence.save(() => preferences);
    },
  };
});
