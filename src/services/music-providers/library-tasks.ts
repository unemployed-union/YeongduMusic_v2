import type { MusicSourceFilter } from '@/types/music';
import { musicProviders } from './registry';

type Task = { key: string; users: number; finished: boolean; controller: AbortController };
const tasks = new Map<string, Task>();

/** Share library requests between mounted pages; release only the last consumer. */
export function acquireProviderLibraries(source: MusicSourceFilter): () => void {
  const acquired: { id: string; task: Task }[] = [];
  for (const provider of musicProviders) {
    const state = provider.getState();
    const selected = source === 'all' || source === provider.id;
    if (
      !selected ||
      provider.catalog !== 'stored' ||
      provider.id === 'local' ||
      !state.ready ||
      !state.connected
    ) {
      continue;
    }
    const key = JSON.stringify([state.scope, state.generation]);
    let task = tasks.get(provider.id);
    if (!task || task.key !== key) {
      task?.controller.abort();
      task = { key, users: 0, finished: false, controller: new AbortController() };
      tasks.set(provider.id, task);
      const current = task;
      void provider
        .refresh(current.controller.signal)
        .catch(() => {})
        .finally(() => {
          current.finished = true;
        });
    }
    task.users++;
    acquired.push({ id: provider.id, task });
  }
  return () => {
    for (const { id, task } of acquired) {
      task.users--;
      const provider = musicProviders.find((item) => item.id === id)!;
      if (
        task.users === 0 &&
        tasks.get(id) === task &&
        (!task.finished || provider.getState().loading)
      ) {
        task.controller.abort();
        provider.cancelLibrary?.();
        if (tasks.get(id) === task) {
          tasks.delete(id);
        }
      }
    }
  };
}
