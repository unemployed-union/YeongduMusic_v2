import { create } from 'zustand';
import {
  createPreferencePersistence,
  type PreferenceStatus,
} from '@/services/preferences/persistence';

type State = PreferenceStatus & {
  playOnSeek: boolean;
  load: (force?: boolean) => Promise<void>;
  setPlayOnSeek: (enabled: boolean) => Promise<void>;
};

export const usePlaybackPreferences = create<State>((set, get) => {
  const persistence = createPreferencePersistence<boolean>({
    key: 'yeongdumusic-play-on-seek-v1',
    defaultValue: false,
    parse: (value) => {
      if (typeof value !== 'boolean') {
        throw new Error('재생 동작 설정이 올바르지 않습니다.');
      }
      return value;
    },
    getStatus: get,
    getValue: () => get().playOnSeek,
    setStatus: (status) => set(status),
    setValue: (playOnSeek, status) => set({ playOnSeek, ...status }),
    messages: {
      load: '재생 동작 설정을 불러오지 못했습니다. 다시 불러와 주세요.',
      save: '재생 동작 설정을 저장하지 못했습니다. 다시 시도해 주세요.',
      blocked: '재생 동작 설정을 먼저 다시 불러와 주세요.',
    },
  });
  return {
    playOnSeek: false,
    ...persistence.initial,
    load: persistence.load,
    setPlayOnSeek: (enabled) => persistence.save(() => enabled),
  };
});
