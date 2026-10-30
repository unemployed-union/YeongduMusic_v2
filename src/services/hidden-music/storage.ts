import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import { emptyProfile, parseProfile } from '@/features/hidden-music/rules';
import type { HiddenMusicProfile } from '@/types/hidden-music';

let database: Promise<SQLite.SQLiteDatabase> | null = null;
async function open(): Promise<SQLite.SQLiteDatabase> {
  if (!database) {
    database = SQLite.openDatabaseAsync('music-privacy.db')
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

export async function readHiddenProfile(scope: string): Promise<HiddenMusicProfile> {
  if (Platform.OS === 'web') {
    throw new Error('음악 숨김 설정은 iOS·Android 앱에서 사용할 수 있습니다.');
  }
  const row = await (
    await open()
  ).getFirstAsync<{ value: string }>('SELECT value FROM profiles WHERE scope = ?', scope);
  return row ? parseProfile(row.value) : emptyProfile();
}

export async function writeHiddenProfile(
  scope: string,
  profile: HiddenMusicProfile,
): Promise<void> {
  if (Platform.OS === 'web') {
    throw new Error('음악 숨김 설정은 iOS·Android 앱에서 사용할 수 있습니다.');
  }
  // Persist only rules and the UI lock preference, never artwork URLs or NAS tokens.
  await (
    await open()
  ).runAsync(
    'INSERT OR REPLACE INTO profiles (scope, value) VALUES (?, ?)',
    scope,
    JSON.stringify(profile),
  );
}
