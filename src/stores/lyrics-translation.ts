import { readPreference, writePreference } from '@/services/preferences/storage';
import { createSerialQueue } from '@/services/async/serial-queue';
import { create } from 'zustand';
import {
  DEFAULT_TRANSLATION_OPTIONS,
  parseTranslationOptions,
  type TranslationOptions,
} from '@/features/lyrics/translation-options';

const KEY = 'yeongdumusic-lyrics-translation-v1';
type State = {
  options: TranslationOptions;
  enabled: boolean;
  ready: boolean;
  loading: boolean;
  saving: boolean;
  loadError: boolean;
  error: string | null;
  load: (force?: boolean) => Promise<void>;
  save: (options: TranslationOptions) => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
};
export const useLyricsTranslationStore = create<State>((set, get) => {
  const persistenceQueue = createSerialQueue();
  let loading: Promise<void> | null = null;
  let writes = 0;
  async function persist(
    change: (state: State) => { options: TranslationOptions; enabled: boolean },
  ) {
    await get().load();
    if (get().loadError) {
      throw new Error(get().error ?? '가사 번역 설정을 다시 불러와 주세요.');
    }
    writes++;
    set({ saving: true, error: null });
    const operation = persistenceQueue.run(async () => {
      const { options, enabled } = change(get());
      const raw = JSON.stringify({ version: 1, options, enabled });
      await writePreference(KEY, raw);
      set({ options, enabled, error: null });
    });

    try {
      await operation;
    } catch {
      const error = '가사 번역 설정을 저장하지 못했습니다. 다시 시도해 주세요.';
      set({ error });
      throw new Error(error);
    } finally {
      writes--;
      set({ saving: writes > 0 });
    }
  }
  return {
    options: DEFAULT_TRANSLATION_OPTIONS,
    enabled: true,
    ready: false,
    loading: false,
    saving: false,
    loadError: false,
    error: null,
    load: (force = false) => {
      if (loading) {
        return loading;
      }
      if (get().ready && !force) {
        return Promise.resolve();
      }
      set({ loading: true, error: null });
      loading = persistenceQueue
        .settled()
        .then(async () => {
          const raw = await readPreference(KEY);
          const value = raw === null ? null : JSON.parse(raw);
          if (value && value.version !== 1) {
            throw new Error('설정 버전을 확인할 수 없습니다.');
          }
          if (value?.enabled !== undefined && typeof value.enabled !== 'boolean') {
            throw new Error('번역 사용 설정을 확인할 수 없습니다.');
          }
          set({
            options:
              raw === null ? DEFAULT_TRANSLATION_OPTIONS : parseTranslationOptions(value?.options),
            enabled: value?.enabled ?? true,
            ready: true,
            loadError: false,
          });
        })
        .catch(() =>
          set({
            ready: true,
            loadError: true,
            error: '가사 번역 설정을 불러오지 못했습니다. 다시 불러와 주세요.',
          }),
        )
        .finally(() => {
          loading = null;
          set({ loading: false });
        });
      return loading;
    },
    save: (options) => {
      const valid = parseTranslationOptions(options);
      return persist((state) => ({ options: valid, enabled: state.enabled }));
    },
    setEnabled: (enabled) => persist((state) => ({ options: state.options, enabled })),
  };
});
