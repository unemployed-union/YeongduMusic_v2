import { Platform } from 'react-native';
import { create } from 'zustand';
import { normalizeLyricOffset } from '@/features/lyrics/timing';

type Entry = {
  offsetMs: number;
  ready: boolean;
  loading: boolean;
  saving: boolean;
  loadError: boolean;
  error: string | null;
};
export const EMPTY_LYRIC_TIMING: Entry = {
  offsetMs: 0,
  ready: false,
  loading: false,
  saving: false,
  loadError: false,
  error: null,
};
const storageKey = (key: string) => `yeongdumusic-lyrics-timing-v1:${key}`;
type State = {
  entries: Record<string, Entry>;
  load: (key: string, force?: boolean) => Promise<void>;
  adjust: (key: string, deltaMs: number) => Promise<void>;
  reset: (key: string) => Promise<void>;
};

export const useLyricsTimingStore = create<State>((set, get) => {
  const loads = new Map<string, Promise<void>>();
  const tails = new Map<string, Promise<void>>();
  const writes = new Map<string, number>();
  const entry = (key: string) => get().entries[key] ?? EMPTY_LYRIC_TIMING;
  const patch = (key: string, change: Partial<Entry>) =>
    set((state) => ({
      entries: {
        ...state.entries,
        [key]: { ...(state.entries[key] ?? EMPTY_LYRIC_TIMING), ...change },
      },
    }));
  async function persist(key: string, change: (current: number) => number) {
    await get().load(key);
    if (entry(key).loadError) {
      throw new Error('가사 타이밍 설정을 다시 불러와 주세요.');
    }
    writes.set(key, (writes.get(key) ?? 0) + 1);
    patch(key, { saving: true, error: null });
    const operation = (tails.get(key) ?? Promise.resolve()).then(async () => {
      const offsetMs = normalizeLyricOffset(change(entry(key).offsetMs));
      const raw = JSON.stringify({ version: 1, offsetMs });
      if (Platform.OS === 'web') {
        localStorage.setItem(storageKey(key), raw);
      } else {
        await (await import('expo-sqlite/kv-store')).default.setItem(storageKey(key), raw);
      }
      patch(key, { offsetMs, error: null });
    });
    const tail = operation.catch(() => {});
    tails.set(key, tail);
    try {
      await operation;
    } catch {
      const error = '가사 타이밍을 저장하지 못했습니다. 다시 시도해 주세요.';
      patch(key, { error });
      throw new Error(error);
    } finally {
      const remaining = (writes.get(key) ?? 1) - 1;
      if (remaining) {
        writes.set(key, remaining);
      } else {
        writes.delete(key);
      }
      patch(key, { saving: remaining > 0 });
      if (tails.get(key) === tail) {
        tails.delete(key);
      }
    }
  }
  return {
    entries: {},
    load: (key, force = false) => {
      const pending = loads.get(key);
      if (pending) {
        return pending;
      }
      if (entry(key).ready && !force) {
        return Promise.resolve();
      }
      patch(key, { loading: true, error: null });
      const operation = (tails.get(key) ?? Promise.resolve())
        .then(async () => {
          let raw: string | null;
          if (Platform.OS === 'web') {
            if (typeof localStorage === 'undefined') {
              raw = null;
            } else {
              raw = localStorage.getItem(storageKey(key));
            }
          } else {
            raw = await (await import('expo-sqlite/kv-store')).default.getItem(storageKey(key));
          }

          let offsetMs = 0;
          if (raw !== null) {
            const value = JSON.parse(raw);
            if (
              value?.version !== 1 ||
              typeof value.offsetMs !== 'number' ||
              normalizeLyricOffset(value.offsetMs) !== value.offsetMs
            ) {
              throw new Error('가사 타이밍 설정을 확인할 수 없습니다.');
            }
            offsetMs = value.offsetMs;
          }
          patch(key, { offsetMs, ready: true, loadError: false });
        })
        .catch(() =>
          patch(key, {
            ready: true,
            loadError: true,
            error: '가사 타이밍을 불러오지 못했습니다. 다시 불러와 주세요.',
          }),
        )
        .finally(() => {
          loads.delete(key);
          patch(key, { loading: false });
        });
      loads.set(key, operation);
      return operation;
    },
    adjust: (key, deltaMs) => persist(key, (current) => current + deltaMs),
    reset: (key) => persist(key, () => 0),
  };
});
