import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { createLibrarySyncTask } from './library-sync-task';
import { LIBRARY_CHANGES_MS } from './library-policy';

type Entry = { users: number; task: ReturnType<typeof createLibrarySyncTask> };
const clients = new WeakMap<QueryClient, Map<string, Entry>>();

/** Server playlist queries share the catalog scheduler without owning song snapshots. */
export function acquireLibraryQuery(client: QueryClient, key: QueryKey): () => void {
  let entries = clients.get(client);
  if (!entries) {
    entries = new Map();
    clients.set(client, entries);
  }
  const signature = JSON.stringify(key);
  let entry = entries.get(signature);
  if (!entry) {
    let observedAt = client.getQueryState(key)?.dataUpdatedAt ?? 0;
    const task = createLibrarySyncTask({
      fullIntervalMs: LIBRARY_CHANGES_MS,
      hydrate: async () => client.getQueryState(key)?.dataUpdatedAt ?? 0,
      refresh: async (signal) => {
        const cancel = () => void client.cancelQueries({ queryKey: key, exact: true });
        signal.addEventListener('abort', cancel, { once: true });
        try {
          if (client.isFetching({ queryKey: key, exact: true })) {
            await client.fetchQuery({ queryKey: key });
          }
          if (signal.aborted) {
            throw new Error('플레이리스트 조회가 취소되었습니다.');
          }
          const updatedAt = client.getQueryState(key)?.dataUpdatedAt ?? 0;
          if (updatedAt <= observedAt) {
            await client.refetchQueries({ queryKey: key, exact: true }, { cancelRefetch: false, throwOnError: true });
          }
          observedAt = client.getQueryState(key)?.dataUpdatedAt ?? 0;
          return observedAt;
        } finally {
          signal.removeEventListener('abort', cancel);
        }
      },
    });
    entry = { users: 0, task };
    entries.set(signature, entry);
  }
  entry.users++;
  const release = entry.task.acquire();
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    release();
    entry.users--;
    if (!entry.users) {
      entry.task.stop();
      entries.delete(signature);
    }
  };
}
