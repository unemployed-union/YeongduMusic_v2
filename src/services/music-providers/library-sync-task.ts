import { LIBRARY_CHANGES_MS, LIBRARY_REVALIDATE_MS, retryLibraryDelay } from './library-policy';

type Ports = {
  hydrate(): Promise<number>;
  refresh(signal: AbortSignal, reason: 'manual' | 'write' | 'due'): Promise<number>;
  revalidate?(signal: AbortSignal): Promise<'unchanged' | 'updated' | 'full-required'>;
  cancel?(): void;
  now?(): number;
  fullIntervalMs?: number;
};

/** One scheduler per account/selection, shared by all visible consumers. */
export function createLibrarySyncTask(ports: Ports) {
  const now = ports.now ?? Date.now;
  const fullInterval = ports.fullIntervalMs ?? LIBRARY_REVALIDATE_MS;
  let users = 0;
  let lastFull = 0;
  let lastCheck = 0;
  let failures = 0;
  let retryAt = 0;
  let blocked = false;
  let dirtyRevision = 0;
  let validatedRevision = 0;
  let hydrated: Promise<void> | undefined;
  let running: Promise<void> | undefined;
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function hydrate() {
    hydrated ??= ports.hydrate().then((validatedAt) => {
      lastFull = Math.min(validatedAt, now());
      lastCheck = lastFull;
    });
    return hydrated;
  }

  function schedule() {
    clearTimeout(timer);
    if (!users || blocked || running) {
      return;
    }
    const next = dirtyRevision !== validatedRevision ? now() : Math.min(
      lastFull ? lastFull + fullInterval : now(),
      ports.revalidate && lastCheck ? lastCheck + LIBRARY_CHANGES_MS : Infinity,
    );
    timer = setTimeout(() => void run().catch(() => {}), Math.max(1000, Math.max(next, retryAt) - now()));
  }

  function run(force = false): Promise<void> {
    if (running) {
      return running;
    }
    const request = new AbortController();
    controller = request;
    const work = (async () => {
      await hydrate();
      if (request.signal.aborted || (!force && (!users || blocked || now() < retryAt))) {
        return;
      }
      const requestedRevision = dirtyRevision;
      const fullDue = force || requestedRevision !== validatedRevision || !lastFull || now() - lastFull >= fullInterval;
      const checkDue = !!ports.revalidate && now() - lastCheck >= LIBRARY_CHANGES_MS;
      if (!fullDue && !checkDue) {
        return;
      }
      try {
        if (fullDue) {
          let reason: 'manual' | 'write' | 'due' = 'due';
          if (force) {
            reason = 'manual';
          } else if (requestedRevision !== validatedRevision) {
            reason = 'write';
          }
          const validatedAt = await ports.refresh(request.signal, reason);
          if (request.signal.aborted) {
            return;
          }
          lastFull = validatedAt;
          validatedRevision = requestedRevision;
        } else if (ports.revalidate) {
          const result = await ports.revalidate(request.signal);
          if (result === 'full-required') {
            const validatedAt = await ports.refresh(request.signal, 'due');
            if (request.signal.aborted) {
              return;
            }
            lastFull = validatedAt;
          }
        }
        if (!request.signal.aborted) {
          lastCheck = now();
          failures = 0;
          retryAt = 0;
          blocked = false;
        }
      } catch (error) {
        if (!request.signal.aborted) {
          failures++;
          retryAt = now() + retryLibraryDelay(failures);
          let status: unknown = null;
          if (error && typeof error === 'object') {
            if ('status' in error) {
              status = error.status;
            } else if ('httpStatus' in error) {
              status = error.httpStatus;
            }
          }
          const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
          blocked = status === 401 || status === 403 ||
            code === 105 ||
            (error instanceof Error && error.name === 'SessionExpiredError');
        }
        throw error;
      }
    })();
    running = work;
    void work.finally(() => {
      if (running === work) {
        running = undefined;
        controller = undefined;
        schedule();
      }
    }).catch(() => {});
    return work;
  }

  return {
    acquire() {
      users++;
      void run().catch(() => {});
      let released = false;
      return () => {
        if (released) {
          return;
        }
        released = true;
        users--;
        if (!users) {
          clearTimeout(timer);
          controller?.abort();
          ports.cancel?.();
          running = undefined;
          controller = undefined;
        }
      };
    },
    refresh: () => run(true),
    dirty() {
      dirtyRevision++;
      schedule();
    },
    stop() {
      users = 0;
      clearTimeout(timer);
      controller?.abort();
      ports.cancel?.();
    },
  };
}
