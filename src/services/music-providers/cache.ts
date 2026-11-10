import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import type { Page } from '@/types/music';
import { createSerialQueue } from '@/services/async/serial-queue';

export const libraryCacheWrites = createSerialQueue();

let database: Promise<SQLite.SQLiteDatabase> | null = null;
export async function openLibraryCache(): Promise<SQLite.SQLiteDatabase> {
  if (!database) {
    database = SQLite.openDatabaseAsync('music-library.db').then(async (db) => {
      await db.execAsync(
        'CREATE TABLE IF NOT EXISTS pages (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at INTEGER NOT NULL);' +
        'CREATE TABLE IF NOT EXISTS library_snapshots (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)',
      );
      return db;
    }).catch((error: unknown) => {
      database = null;
      throw error;
    });
  }
  return database;
}
export async function cachePage<T>(key: string, page: Page<T>): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }
  const db = await openLibraryCache();
  // Artwork URLs contain the session ID. Never persist them in the SQLite cache.
  const value = JSON.stringify(page, (field, item: unknown) =>
    field === 'artworkUrl' && !(typeof item === 'string' && item.startsWith('jellyfin-artwork:'))
      ? undefined
      : item,
  );
  await libraryCacheWrites.run(() => db.runAsync(
    'INSERT OR REPLACE INTO pages (key, value, updated_at) VALUES (?, ?, ?)',
    key,
    value,
    Date.now(),
  ));
}
export async function cachedPage<T>(key: string): Promise<Page<T> | null> {
  if (Platform.OS === 'web') {
    return null;
  }
  const db = await openLibraryCache();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM pages WHERE key = ?',
    key,
  );
  if (!row) {
    return null;
  }
  return { ...(JSON.parse(row.value) as Page<T>), stale: true };
}
export async function clearLibraryCache(prefix?: string): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }
  const db = await openLibraryCache();
  await libraryCacheWrites.run(async () => {
    if (prefix) {
      await db.runAsync('DELETE FROM pages WHERE substr(key, 1, ?) = ?', prefix.length, prefix);
      if (prefix === 'nas:') {
        const snapshotPrefix = '[1,"nas",';
        await db.runAsync('DELETE FROM library_snapshots WHERE substr(key, 1, ?) = ?', snapshotPrefix.length, snapshotPrefix);
      }
    } else {
      await db.runAsync('DELETE FROM pages');
      await db.runAsync('DELETE FROM library_snapshots');
    }
  });
}
