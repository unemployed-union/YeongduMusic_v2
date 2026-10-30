import { createSerialQueue } from '@/services/async/serial-queue';
import { readPreference, writePreference } from './storage';

export type PreferenceStatus = {
  ready: boolean;
  loading: boolean;
  saving: boolean;
  loadError: boolean;
  error: string | null;
};

interface Options<T> {
  key: string;
  defaultValue: T;
  parse(value: unknown): T;
  decode?(stored: unknown): T;
  encode?(value: T): unknown;
  getStatus(): PreferenceStatus;
  getValue(): T;
  setStatus(status: Partial<PreferenceStatus>): void;
  setValue(value: T, status: Partial<PreferenceStatus>): void;
  messages: { load: string; save: string; blocked: string };
}

/** Share persistence mechanics while keeping each store's schema and actions local. */
export function createPreferencePersistence<T>(options: Options<T>) {
  const queue = createSerialQueue();
  let loading: Promise<void> | null = null;
  let writes = 0;

  const initial: PreferenceStatus = {
    ready: false,
    loading: false,
    saving: false,
    loadError: false,
    error: null,
  };

  function load(force = false): Promise<void> {
    if (loading) {
      return loading;
    }
    if (options.getStatus().ready && !force) {
      return Promise.resolve();
    }

    options.setStatus({ loading: true, error: null });
    loading = queue
      .settled()
      .then(async () => {
        const raw = await readPreference(options.key);
        const value =
          raw === null ? options.defaultValue : (options.decode ?? options.parse)(JSON.parse(raw));
        options.setValue(value, { ready: true, loadError: false, error: null });
      })
      .catch(() => {
        options.setStatus({ ready: true, loadError: true, error: options.messages.load });
      })
      .finally(() => {
        loading = null;
        options.setStatus({ loading: false });
      });
    return loading;
  }

  async function save(update: (current: T) => T): Promise<void> {
    await load();
    if (options.getStatus().loadError) {
      throw new Error(options.messages.blocked);
    }

    writes++;
    options.setStatus({ saving: true, error: null });
    const operation = queue.run(async () => {
      const value = options.parse(update(options.getValue()));
      await writePreference(
        options.key,
        JSON.stringify(options.encode ? options.encode(value) : value),
      );
      options.setValue(value, { error: null });
    });
    try {
      await operation;
    } catch {
      options.setStatus({ error: options.messages.save });
      throw new Error(options.messages.save);
    } finally {
      writes--;
      options.setStatus({ saving: writes > 0 });
    }
  }

  return { initial, load, save };
}
