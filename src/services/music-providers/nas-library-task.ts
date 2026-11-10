import type { QueryClient } from '@tanstack/react-query';
import { musicProvider } from './registry';
import { createLibrarySyncTask } from './library-sync-task';
import { hydrateNasLibrary, nasLibraryContext, refreshNasLibrary } from '@/features/library/nas-library-cache';
import { createDeletionTracker, removeDeletedFutureSongs } from './catalog-deletions';

let active: { identity: string; task: ReturnType<typeof createLibrarySyncTask> } | undefined;

function nasTask(client: QueryClient, identity: string) {
  if (active?.identity === identity) {
    return active.task;
  }
  active?.task.stop();
  let observedAt = 0;
  const key = ['song-library', identity];
  const deletions = createDeletionTracker();
  const task = createLibrarySyncTask({
    hydrate: async () => {
      await hydrateNasLibrary();
      const context = nasLibraryContext();
      observedAt = context.validatedAt;
      deletions.baseline(context.page?.items ?? []);
      return observedAt;
    },
    cancel: () => {
      void Promise.resolve().then(() => client.cancelQueries({
        queryKey: key,
        exact: true,
        predicate: (query) => !query.isActive(),
      }));
    },
    refresh: async (signal, reason) => {
      if (client.isFetching({ queryKey: key, exact: true })) {
        await client.fetchQuery({ queryKey: key });
      }
      const context = nasLibraryContext();
      if (context.identity !== identity || signal.aborted) {
        throw new Error('음악 목록 요청이 취소되었습니다.');
      }
      if (context.validatedAt > observedAt) {
        observedAt = context.validatedAt;
        return observedAt;
      }
      const page = await client.fetchQuery({ queryKey: key, staleTime: 0, retry: false,
        queryFn: () => refreshNasLibrary(signal, reason) });
      await removeDeletedFutureSongs(musicProvider('nas'), deletions.compare(page.items));
      observedAt = context.validatedAt;
      return observedAt;
    },
  });
  active = { identity, task };
  return task;
}

export function acquireNasLibrary(client: QueryClient, identity: string): () => void {
  return nasTask(client, identity).acquire();
}

export function refreshNasTask(client: QueryClient, identity: string): Promise<void> {
  return nasTask(client, identity).refresh();
}

export function markNasLibraryDirty(): void {
  active?.task.dirty();
}
