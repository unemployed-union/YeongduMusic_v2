import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import type { Page } from '@/types/music';

let database: Promise<SQLite.SQLiteDatabase> | null = null;
async function open(): Promise<SQLite.SQLiteDatabase> {
  if (!database) {
    database = SQLite.openDatabaseAsync('music-library.db').then(async (db) => {
      await db.execAsync(
        'CREATE TABLE IF NOT EXISTS pages (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at INTEGER NOT NULL)',
      );
      return db;
    });
  }
  return database;
}
export async function cachePage<T>(key: string, page: Page<T>): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }
  const db = await open();
  // Artwork URLs contain the session ID. Never persist them in the SQLite cache.
  const value = JSON.stringify(page, (field, item: unknown) =>
    field === 'artworkUrl' ? undefined : item,
  );
  await db.runAsync(
    'INSERT OR REPLACE INTO pages (key, value, updated_at) VALUES (?, ?, ?)',
    key,
    value,
    Date.now(),
  );
}
export async function cachedPage<T>(key: string): Promise<Page<T> | null> {
  if (Platform.OS === 'web') {
    return null;
  }
  const db = await open();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM pages WHERE key = ?',
    key,
  );
  if (!row) {
    return null;
  }
  return { ...(JSON.parse(row.value) as Page<T>), stale: true };
}
export async function clearLibraryCache(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }
  const db = await open();
  await db.runAsync('DELETE FROM pages');
}
