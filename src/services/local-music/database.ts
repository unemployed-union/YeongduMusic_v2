import * as SQLite from 'expo-sqlite';
import type { Song } from '@/types/music';

let database: Promise<SQLite.SQLiteDatabase> | null = null;
export async function openLocalDatabase() {
  if (!database) {
    database = SQLite.openDatabaseAsync('music-library.db')
      .then(async (db) => {
        await db.execAsync(
          'CREATE TABLE IF NOT EXISTS local_tracks (id TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)',
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
export async function saveLocalSong(song: Song) {
  const db = await openLocalDatabase();
  const serializedSong = JSON.stringify(song);

  await db.runAsync(
    'INSERT OR REPLACE INTO local_tracks (id, value) VALUES (?, ?)',
    song.id,
    serializedSong,
  );
}
