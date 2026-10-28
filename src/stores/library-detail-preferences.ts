import { create } from 'zustand';
import {
  DEFAULT_DETAIL_PREFERENCES,
  parseDetailPreferences,
  type LibraryDetailPreferences,
} from '@/features/library/detail-preferences';
import {
  createPreferencePersistence,
  type PreferenceStatus,
} from '@/services/preferences/persistence';

type State = PreferenceStatus & {
  preferences: LibraryDetailPreferences;
  load: (force?: boolean) => Promise<void>;
  setOption: (key: keyof LibraryDetailPreferences, value: boolean) => Promise<void>;
  restore: (preferences: LibraryDetailPreferences) => Promise<void>;
};

export const useLibraryDetailPreferences = create<State>((set, get) => {
  const persistence = createPreferencePersistence<LibraryDetailPreferences>({
    key: 'yeongdumusic-library-details-v1',
    defaultValue: DEFAULT_DETAIL_PREFERENCES,
    parse: parseDetailPreferences,
    getStatus: get,
    getValue: () => get().preferences,
    setStatus: (status) => set(status),
    setValue: (preferences, status) => set({ preferences, ...status }),
    messages: {
      load: '상세 화면 설정을 불러오지 못했습니다. 다시 불러와 주세요.',
      save: '상세 화면 설정을 저장하지 못했습니다. 다시 시도해 주세요.',
      blocked: '상세 화면 설정을 먼저 다시 불러와 주세요.',
    },
  });
  return {
    preferences: DEFAULT_DETAIL_PREFERENCES,
    ...persistence.initial,
    load: persistence.load,
    setOption: (key, value) => persistence.save((current) => ({ ...current, [key]: value })),
    restore: (value) => {
      const preferences = parseDetailPreferences(value);
      return persistence.save(() => preferences);
    },
  };
});
