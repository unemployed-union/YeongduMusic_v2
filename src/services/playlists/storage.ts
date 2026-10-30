import * as SQLite from 'expo-sqlite';
import { emptyPlaylists, parsePlaylists } from '@/features/playlists/rules';
import type { PlaylistProfile } from '@/types/playlists';

let database: Promise<SQLite.SQLiteDatabase> | null = null;
async function open(): Promise<SQLite.SQLiteDatabase> {
  if (!database) {
    database = SQLite.openDatabaseAsync('music-playlists.db')
      .then(async (db) => {
        await db.execAsync(
          'CREATE TABLE IF NOT EXISTS profiles (scope TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)',
        );
        return db;
      })
      .catch((error: unknown) => {
        database = null;
        throw error;
      });
  }
  return database;
}
export async function readPlaylists(scope: string): Promise<PlaylistProfile> {
  const row = await (
    await open()
  ).getFirstAsync<{ value: string }>('SELECT value FROM profiles WHERE scope = ?', scope);
  return row ? parsePlaylists(row.value) : emptyPlaylists();
}
export async function writePlaylists(scope: string, profile: PlaylistProfile): Promise<void> {
  // Only IDs and names: artwork/stream URLs can contain temporary NAS credentials.
  const clean = parsePlaylists(JSON.stringify(profile));
  await (
    await open()
  ).runAsync(
    'INSERT OR REPLACE INTO profiles (scope, value) VALUES (?, ?)',
    scope,
    JSON.stringify(clean),
  );
}
