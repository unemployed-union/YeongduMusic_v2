import { Platform } from 'react-native';
import type { MusicProviderId, Song } from '@/types/music';
import { cachedPage, openLibraryCache, libraryCacheWrites } from './cache';

export type LibrarySnapshot = {
  version: 1;
  items: Song[];
  validatedAt: number;
  metadata?: { cursor?: string; changesDisabled?: boolean; pendingIds?: string[] };
};

export function librarySnapshotKey(id: MusicProviderId, scope: string, selection: unknown = null): string {
  return JSON.stringify([1, id, scope, selection]);
}

function serialize(value: LibrarySnapshot): string {
  return JSON.stringify(value, (key, item: unknown) => {
    if (key === 'artworkUrl') {
      return typeof item === 'string' && /^(file:|jellyfin-artwork:)/.test(item) ? item : undefined;
    }
    if (/^(token|sid|_sid|accessToken|refreshToken|password|secret|authorization|headers|uri|url|metadataOriginal|artworkOriginal)$/i.test(key)) {
      return undefined;
    }
    return item;
  });
}

function validCachedSong(song: Song): boolean {
  if (!song || typeof song.id !== 'string' || !song.id || typeof song.title !== 'string' ||
      typeof song.album !== 'string' || typeof song.artist !== 'string' || !Number.isFinite(song.duration)) {
    return false;
  }
  switch (song.source) {
    case undefined:
    case 'nas':
      return true;
    case 'drive':
      return !!song.drive && typeof song.drive.fileId === 'string' && typeof song.drive.accountId === 'string';
    case 's3':
      return !!song.s3 && typeof song.s3.connectionId === 'string' && typeof song.s3.key === 'string';
    case 'mybox':
      return !!song.mybox && typeof song.mybox.connectionId === 'string' && typeof song.mybox.fileId === 'string' && typeof song.path === 'string';
    case 'jellyfin':
      return !!song.ref && typeof song.ref.accountScope === 'string' && typeof song.ref.remoteId === 'string';
    default:
      return false;
  }
}

export function parseLibrarySnapshot(raw: string): LibrarySnapshot {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') {
    throw new Error('음악 목록 캐시 형식이 올바르지 않습니다.');
  }
  const snapshot = value as LibrarySnapshot;
  const metadata = snapshot.metadata;
  if (metadata && (typeof metadata !== 'object' || Array.isArray(metadata) || (metadata.cursor !== undefined && (typeof metadata.cursor !== 'string' || metadata.cursor.length > 4096)) ||
      (metadata.changesDisabled !== undefined && typeof metadata.changesDisabled !== 'boolean') ||
      (metadata.pendingIds !== undefined && (!Array.isArray(metadata.pendingIds) || metadata.pendingIds.length > 10000 || metadata.pendingIds.some((id) => typeof id !== 'string'))))) {
    throw new Error('음악 목록의 변경 기준을 확인할 수 없습니다.');
  }
  if (snapshot.version !== 1 || !Array.isArray(snapshot.items) ||
      !Number.isFinite(snapshot.validatedAt) || snapshot.validatedAt < 0 ||
      !snapshot.items.every(validCachedSong) ||
      new Set(snapshot.items.map((song) => song.id)).size !== snapshot.items.length) {
    throw new Error('음악 목록 캐시를 확인할 수 없습니다.');
  }
  return snapshot;
}

export async function readLibrarySnapshot(key: string): Promise<LibrarySnapshot | null> {
  if (Platform.OS === 'web') {
    return null;
  }
  const db = await openLibraryCache();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM library_snapshots WHERE key = ?', key);
  return row ? parseLibrarySnapshot(row.value) : null;
}

export async function writeLibrarySnapshot(key: string, snapshot: LibrarySnapshot, current = () => true): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }
  const db = await openLibraryCache();
  // One row contains both the complete catalog and its cursor: no half-committed checkpoints.
  const value = serialize(snapshot);
  await libraryCacheWrites.run(() => db.withExclusiveTransactionAsync(async (transaction) => {
    if (!current()) {
      throw new Error('음악 목록 저장이 취소되었습니다.');
    }
    await transaction.runAsync('INSERT OR REPLACE INTO library_snapshots (key, value) VALUES (?, ?)', key, value);
    if (!current()) {
      throw new Error('음악 목록 저장이 취소되었습니다.');
    }
  }));
}

export async function readLegacyNasLibrary(prefix: string): Promise<LibrarySnapshot | null> {
  const items: Song[] = [];
  const ids = new Set<string>();
  let total: number | undefined;
  do {
    const page = await cachedPage<Song>(`${prefix}:songs::${items.length}:100`);
    if (!page || !Number.isSafeInteger(page.total) || page.total < 0 ||
        (total !== undefined && total !== page.total) ||
        page.items.length !== Math.min(100, page.total - items.length)) {
      return null;
    }
    total = page.total;
    for (const song of page.items) {
      if (!validCachedSong(song) || ids.has(song.id) || (song.source && song.source !== 'nas')) {
        return null;
      }
      ids.add(song.id);
      items.push(song);
    }
  } while (items.length < total);
  return { version: 1, items, validatedAt: 0 };
}

