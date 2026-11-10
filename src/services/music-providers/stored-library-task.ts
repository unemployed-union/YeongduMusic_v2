import type { MusicProvider } from './contracts';
import type { Song } from '@/types/music';
import { createLibrarySyncTask } from './library-sync-task';
import { librarySnapshotKey, readLibrarySnapshot, writeLibrarySnapshot } from './library-snapshots';
import { reuseLibraryItems } from './library-policy';
import { recordLibraryRequest } from './library-statistics';
import { createDeletionTracker, removeDeletedFutureSongs } from './catalog-deletions';

const tasks = new Map<string, { key: string; task: ReturnType<typeof createLibrarySyncTask> }>();

export function providerLibraryKey(provider: MusicProvider): string {
  const state = provider.getState();
  let selection: unknown = null;
  if (provider.id === 'drive' && Array.isArray(state.selection)) {
    selection = state.selection.map((file: { id: string }) => file.id);
  } else if (provider.id === 'jellyfin') {
    selection = state.selection ?? null;
  }
  return librarySnapshotKey(provider.id, state.scope, selection);
}

export function storedLibraryTask(provider: MusicProvider) {
  const key = providerLibraryKey(provider);
  const generation = provider.getState().generation;
  const runtimeKey = JSON.stringify([key, generation]);
  const previous = tasks.get(provider.id);
  if (previous?.key === runtimeKey) {
    return previous.task;
  }
  previous?.task.stop();
  let previousSongs: readonly Song[] = [];
  const deletions = createDeletionTracker();
  const current = () => provider.getState().generation === generation && providerLibraryKey(provider) === key;
  const save = async (validatedAt: number, signal: AbortSignal) => {
    if (!current()) {
      throw new Error('음악 목록의 계정 또는 선택 범위가 변경되었습니다.');
    }
    const catalog = provider.getState().songs.filter((song) => song.source !== 'drive' || !song.drive.documentUri);
    const songs = reuseLibraryItems(previousSongs, [...catalog]);
    await writeLibrarySnapshot(key, { version: 1, items: songs, validatedAt, metadata: provider.cache?.metadata?.() }, () => current() && !signal.aborted);
    if (!current()) {
      throw new Error('음악 목록의 계정 또는 선택 범위가 변경되었습니다.');
    }
    provider.cache?.restore(songs, false);
    return songs;
  };
  let fullAt = 0;
  const task = createLibrarySyncTask({
    hydrate: async () => {
      const snapshot = await readLibrarySnapshot(key).catch(() => null);
      const live = provider.getState();
      if (current() && live.validatedAt && (!snapshot || live.validatedAt >= snapshot.validatedAt)) {
        previousSongs = live.songs.filter((song) => song.source !== 'drive' || !song.drive.documentUri);
        deletions.baseline(previousSongs);
        fullAt = live.validatedAt;
        await writeLibrarySnapshot(key, { version: 1, items: [...previousSongs].filter((song) => song.source !== 'drive' || !song.drive.documentUri),
          validatedAt: fullAt, metadata: provider.cache?.metadata?.() }, current).catch(() => {});
        return fullAt;
      }
      if (snapshot && current()) {
        provider.cache?.restore(snapshot.items, true);
        provider.cache?.restoreMetadata?.(snapshot.metadata);
        previousSongs = provider.getState().songs.filter((song) => song.source !== 'drive' || !song.drive.documentUri);
        deletions.baseline(previousSongs);
        fullAt = snapshot.validatedAt;
      }
      return fullAt;
    },
    refresh: async (signal, reason) => {
      const started = Date.now();
      const before = provider.getState().songs;
      const metadata = provider.cache?.metadata?.();
      try {
        await provider.refresh(signal);
        if (signal.aborted || !current()) {
          throw new Error('음악 목록 요청이 취소되었습니다.');
        }
        const validatedAt = Date.now();
        const songs = await save(validatedAt, signal);
        const ids = new Set(songs.map((song) => song.id));
        const deleted = provider.id === 'drive'
          ? new Set(previousSongs.filter((song) => !ids.has(song.id)).map((song) => song.id))
          : deletions.compare(songs);
        await removeDeletedFutureSongs(provider, deleted);
        previousSongs = songs;
        fullAt = validatedAt;
        recordLibraryRequest({ provider: provider.id, reason, kind: 'full', duration: Date.now() - started, success: true });
        return validatedAt;
      } catch (error) {
        if (current() && !signal.aborted) {
          provider.cache?.restore([...before], true);
          provider.cache?.restoreMetadata?.(metadata);
          provider.cache?.fail?.(error instanceof Error ? error.message : '목록 갱신에 실패했습니다. 다시 시도해 주세요.');
        }
        recordLibraryRequest({ provider: provider.id, reason, kind: 'full', duration: Date.now() - started, success: false });
        throw error;
      }
    },
    revalidate: provider.sync ? async (signal) => {
      const started = Date.now();
      const before = provider.getState().songs;
      const metadata = provider.cache?.metadata?.();
      try {
        const result = await provider.sync!.revalidate({ signal });
        if (signal.aborted || !current()) {
          throw new Error('음악 목록 요청이 취소되었습니다.');
        }
        if (result !== 'full-required') {
          const songs = await save(fullAt, signal);
          const ids = new Set(songs.map((song) => song.id));
          await removeDeletedFutureSongs(provider, new Set(previousSongs.filter((song) => !ids.has(song.id)).map((song) => song.id)));
          previousSongs = songs;
          deletions.baseline(songs);
        }
        recordLibraryRequest({ provider: provider.id, reason: 'catalog', kind: 'changes', duration: Date.now() - started, success: true });
        return result;
      } catch (error) {
        if (current() && !signal.aborted) {
          provider.cache?.restore([...before], true);
          provider.cache?.restoreMetadata?.(metadata);
          provider.cache?.fail?.(error instanceof Error ? error.message : '목록 갱신에 실패했습니다. 다시 시도해 주세요.');
        }
        throw error;
      }
    } : undefined,
    cancel: () => {
      if (current()) {
        provider.cancelLibrary?.();
      }
    },
  });
  tasks.set(provider.id, { key: runtimeKey, task });
  return task;
}

export function refreshStoredLibrary(provider: MusicProvider): Promise<void> {
  return storedLibraryTask(provider).refresh();
}

export function markStoredLibraryDirty(id: string): void {
  tasks.get(id)?.task.dirty();
}
