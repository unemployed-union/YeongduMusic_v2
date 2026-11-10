export type LibraryLoadProgress = { loaded: number; total: number | null };
export type ActiveLibraryLoad = LibraryLoadProgress & { key: string; request: number };

let snapshot: readonly ActiveLibraryLoad[] = [];
let revision = 0;
const listeners = new Set<() => void>();

export function libraryLoadSnapshot(): readonly ActiveLibraryLoad[] {
  return snapshot;
}

export function subscribeLibraryLoads(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publish(next: readonly ActiveLibraryLoad[]) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

/** Progress is transient and independent of Query data and song-list selectors. */
export async function trackLibraryLoad<T>(
  key: string,
  load: (report: (progress: LibraryLoadProgress) => void) => Promise<T>,
): Promise<T> {
  const request = ++revision;
  publish([
    ...snapshot.filter((item) => item.key !== key),
    { key, request, loaded: 0, total: null },
  ]);
  try {
    return await load((progress) => {
      const current = snapshot.find((item) => item.key === key);
      if (!current || current.request !== request) {
        return;
      }
      if (current.loaded === progress.loaded && current.total === progress.total) {
        return;
      }
      publish(snapshot.map((item) => item === current ? { ...current, ...progress } : item));
    });
  } finally {
    if (snapshot.some((item) => item.key === key && item.request === request)) {
      publish(snapshot.filter((item) => item.key !== key));
    }
  }
}
