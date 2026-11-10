import type { Page, Song } from '@/types/music';
import { useAuthStore } from '@/stores/auth';
import { musicProvider } from '@/services/music-providers/registry';
import { librarySnapshotKey, readLegacyNasLibrary, readLibrarySnapshot, writeLibrarySnapshot } from '@/services/music-providers/library-snapshots';
import { reuseLibraryItems } from '@/services/music-providers/library-policy';
import { recordLibraryRequest } from '@/services/music-providers/library-statistics';
import { libraryIdentity } from './repository';
import { loadSongLibrary } from './load-song-library';
import { trackLibraryLoad } from './load-progress';

type Context = {
  identity: string;
  page?: Page<Song>;
  validatedAt: number;
  hydrate?: Promise<void>;
  running?: Promise<Page<Song>>;
};
let context: Context | undefined;

export function nasLibraryContext() {
  const auth = useAuthStore.getState();
  const identity = libraryIdentity(auth.mode, auth.session);
  if (context?.identity !== identity) {
    context = { identity, validatedAt: 0 };
  }
  return context;
}

function snapshotKey() {
  return librarySnapshotKey('nas', musicProvider('nas').getState().scope, 'all');
}

export async function hydrateNasLibrary(): Promise<void> {
  const current = nasLibraryContext();
  current.hydrate ??= (async () => {
    const { mode, session } = useAuthStore.getState();
    if (mode === 'mock') {
      return;
    }
    let snapshot = await readLibrarySnapshot(snapshotKey()).catch(() => null);
    if (!snapshot && session) {
      const prefix = 'nas:' + JSON.stringify([session.baseUrl, session.account, 'all', 'provider-v1']);
      snapshot = await readLegacyNasLibrary(prefix).catch(() => null);
    }
    if (snapshot && nasLibraryContext() === current && snapshot.items.every((song) => !song.source || song.source === 'nas')) {
      const provider = musicProvider('nas');
      const items = snapshot.items.map((song) => provider.restore(song)).filter((song): song is Song => !!song);
      if (items.length === snapshot.items.length) {
        current.page = { items, total: items.length, stale: true };
        current.validatedAt = snapshot.validatedAt;
      }
    }
  })();
  return current.hydrate;
}

export async function refreshNasLibrary(signal: AbortSignal, reason = 'initial'): Promise<Page<Song>> {
  const current = nasLibraryContext();
  if (current.running) {
    return current.running;
  }
  const key = snapshotKey();
  const start = Date.now();
  const work = (async () => {
    await useAuthStore.getState().ensureApis();
    if (signal.aborted || current !== nasLibraryContext()) {
      throw new Error('음악 목록 요청이 취소되었습니다.');
    }
    const page = await trackLibraryLoad(current.identity, (report) => loadSongLibrary({
      songs: async (request) => {
        const began = Date.now();
        let success = false;
        try {
          const result = await musicProvider('nas').songs(request);
          success = !result.stale;
          return result;
        } finally {
          recordLibraryRequest({ provider: 'nas', reason, kind: 'Song.list', duration: Date.now() - began, success });
        }
      },
    }, signal, report));
    if (signal.aborted || current !== nasLibraryContext()) {
      throw new Error('음악 목록 요청이 취소되었습니다.');
    }
    if (page.stale) {
      throw new Error('서버 목록 갱신 실패 · 마지막으로 저장된 음악을 사용합니다.');
    }
    const items = reuseLibraryItems(current.page?.items ?? [], page.items);
    const validatedAt = Date.now();
    await writeLibrarySnapshot(key, { version: 1, items, validatedAt }, () => !signal.aborted && current === nasLibraryContext());
    if (signal.aborted || current !== nasLibraryContext()) {
      throw new Error('음악 목록 요청이 취소되었습니다.');
    }
    current.page = { ...page, items };
    current.validatedAt = validatedAt;
    return current.page;
  })();
  current.running = work;
  void work.then(
    () => recordLibraryRequest({ provider: 'nas', reason, kind: 'full', duration: Date.now() - start, success: true }),
    () => recordLibraryRequest({ provider: 'nas', reason, kind: 'full', duration: Date.now() - start, success: false }),
  ).finally(() => { current.running = undefined; });
  return work;
}

export async function readNasLibrary(signal: AbortSignal): Promise<Page<Song>> {
  await hydrateNasLibrary();
  if (signal.aborted) {
    throw new Error('음악 목록 요청이 취소되었습니다.');
  }
  return nasLibraryContext().page ?? refreshNasLibrary(signal);
}
