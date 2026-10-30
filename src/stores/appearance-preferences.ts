import { create } from 'zustand';
import {
  APPEARANCE_FIELDS,
  DEFAULT_APPEARANCE,
  parseAppearance,
  type AppearanceField,
  type AppearancePreferences,
} from '@/theme/appearance';
import {
  createPreferencePersistence,
  type PreferenceStatus,
} from '@/services/preferences/persistence';

type State = PreferenceStatus & {
  preferences: AppearancePreferences;
  load: (force?: boolean) => Promise<void>;
  setColor: (field: AppearanceField, color: string | null) => Promise<void>;
  restore: (preferences: AppearancePreferences) => Promise<void>;
};

export const useAppearancePreferences = create<State>((set, get) => {
  const persistence = createPreferencePersistence<AppearancePreferences>({
    key: 'yeongdumusic-appearance-v1',
    defaultValue: { ...DEFAULT_APPEARANCE },
    parse: parseAppearance,
    getStatus: get,
    getValue: () => get().preferences,
    setStatus: (status) => set(status),
    setValue: (preferences, status) => set({ preferences, ...status }),
    messages: {
      load: '색상 설정을 불러오지 못했습니다. 다시 불러와 주세요.',
      save: '색상 설정을 저장하지 못했습니다. 다시 시도해 주세요.',
      blocked: '색상 설정을 먼저 다시 불러와 주세요.',
    },
  });
  return {
    preferences: { ...DEFAULT_APPEARANCE },
    ...persistence.initial,
    load: persistence.load,
    setColor: (field, color) =>
      persistence.save((current) => {
        if (!APPEARANCE_FIELDS.includes(field)) {
          throw new Error('Invalid color field');
        }
        return { ...current, [field]: color };
      }),
    restore: (value) => {
      const preferences = parseAppearance(value);
      return persistence.save(() => preferences);
    },
  };
});
