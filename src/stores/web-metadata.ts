import { readPreference, writePreference } from '@/services/preferences/storage';
import { createSerialQueue } from '@/services/async/serial-queue';
import { create } from 'zustand';
import { validateMetadataKey } from '@/features/metadata/rules';

const KEY = 'yeongdumusic-web-metadata-v1';
type Preferences = {
  enabled: boolean;
  excluded: Record<string, true>;
  checked: Record<string, string>;
};
type State = Preferences & {
  ready: boolean;
  loading: boolean;
  saving: boolean;
  loadError: boolean;
  error: string | null;
  status: string | null;
  automaticError: string | null;
  retryRevision: number;
  load: (force?: boolean) => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
  setExcluded: (key: string, excluded: boolean) => Promise<void>;
  markChecked: (key: string, fingerprint: string) => Promise<void>;
  retry: () => Promise<void>;
};
export function parseWebMetadataPreferences(raw: string | null): Preferences {
  if (raw === null) return { enabled: false, excluded: {}, checked: {} };
  const value = JSON.parse(raw);
  if (
    value?.version !== 1 ||
    typeof value.enabled !== 'boolean' ||
    !value.excluded ||
    !value.checked
  )
    throw new Error('웹 곡 정보 설정을 읽을 수 없습니다.');
  function entries(input: unknown, excluded: boolean) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new Error('웹 곡 정보 설정을 읽을 수 없습니다.');
    const list = Object.entries(input);
    if (list.length > 10000) throw new Error('웹 곡 정보 설정이 저장 한도를 초과했습니다.');
    for (const [key, field] of list) {
      validateMetadataKey(key);
      if (excluded ? field !== true : typeof field !== 'string' || field.length > 5000)
        throw new Error('웹 곡 정보 설정을 읽을 수 없습니다.');
    }
    return Object.fromEntries(list);
  }
  return {
    enabled: value.enabled,
    excluded: entries(value.excluded, true),
    checked: entries(value.checked, false),
  };
}
export const useWebMetadataStore = create<State>((set, get) => {
  const persistenceQueue = createSerialQueue();
  let loading: Promise<void> | null = null,
    writes = 0;
  async function update(change: (value: Preferences) => Preferences) {
    await get().load();
    if (get().loadError) throw new Error('웹 곡 정보 설정을 다시 불러와 주세요.');
    writes++;
    set({ saving: true, error: null });
    const operation = persistenceQueue.run(async () => {
      const { enabled, excluded, checked } = change(get());
      const raw = JSON.stringify({ version: 1, enabled, excluded, checked });
      parseWebMetadataPreferences(raw);
      await writePreference(KEY, raw);
      set({ enabled, excluded, checked });
    });

    try {
      await operation;
    } catch {
      const error = '웹 곡 정보 설정을 저장하지 못했습니다. 다시 시도해 주세요.';
      set({ error });
      throw new Error(error);
    } finally {
      writes--;
      set({ saving: writes > 0 });
    }
  }
  return {
    enabled: false,
    excluded: {},
    checked: {},
    ready: false,
    loading: false,
    saving: false,
    loadError: false,
    error: null,
    status: null,
    automaticError: null,
    retryRevision: 0,
    load: (force = false) => {
      if (loading) return loading;
      if (get().ready && !force) return Promise.resolve();
      set({ loading: true, error: null });
      loading = persistenceQueue
        .settled()
        .then(async () => {
          const raw = await readPreference(KEY);
          set({ ...parseWebMetadataPreferences(raw), ready: true, loadError: false });
        })
        .catch(() =>
          set({
            ready: true,
            loadError: true,
            error: '웹 곡 정보 설정을 불러오지 못했습니다. 다시 시도해 주세요.',
          }),
        )
        .finally(() => {
          loading = null;
          set({ loading: false });
        });
      return loading;
    },
    setEnabled: (enabled) =>
      update((value) => ({ ...value, enabled })).then(() => {
        set({ automaticError: null });
      }),
    setExcluded: (key, excluded) => {
      validateMetadataKey(key);
      return update((value) => {
        const next = { ...value.excluded };
        if (excluded) next[key] = true;
        else delete next[key];
        const checked = { ...value.checked };
        delete checked[key];
        return { ...value, excluded: next, checked };
      });
    },
    markChecked: (key, fingerprint) =>
      update((value) => ({
        ...value,
        checked: Object.fromEntries([
          ...Object.entries(value.checked)
            .filter(([id]) => id !== key)
            .slice(-9999),
          [key, fingerprint],
        ]),
      })),
    retry: () =>
      update((value) => ({ ...value, checked: {} })).then(() =>
        set({ automaticError: null, retryRevision: get().retryRevision + 1 }),
      ),
  };
});
