import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import type { Song } from '@/types/music';

export type ImportKind = 'files' | 'device' | 'folder';
export type ImportAsset = { uri: string; name: string; mimeType?: string; duration?: number; stage?: boolean; temporary?: boolean };
export function isAudioFile(name: string): boolean { return /\.(mp3|m4a|flac|wav|aac|aiff|aif|ogg|opus)$/i.test(name); }
let stagingSequence = 0;
export type ImportResult = { added: number; duplicates: number; failures: string[]; cancelled?: boolean };
let database: Promise<SQLite.SQLiteDatabase> | null = null;
let importTail: Promise<unknown> = Promise.resolve();
function directory(): string {
  if (Platform.OS === 'web' || !FileSystem.documentDirectory) throw new Error('로컬 음악 가져오기는 iOS·Android 앱에서 사용할 수 있습니다.');
  return FileSystem.documentDirectory + 'local-music/';
}
async function open() {
  if (!database) database = SQLite.openDatabaseAsync('music-library.db').then(async (db) => {
    await db.execAsync('CREATE TABLE IF NOT EXISTS local_tracks (id TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)');
    return db;
  }).catch((error: unknown) => { database = null; throw error; });
  return database;
}
export async function readLocalSongs(): Promise<Song[]> {
  if (Platform.OS === 'web') return [];
  const rows = await (await open()).getAllAsync<{ value: string }>('SELECT value FROM local_tracks ORDER BY rowid');
  return rows.map((row) => {
    const song = JSON.parse(row.value) as Song;
    if (!song || song.source !== 'local' || typeof song.title !== 'string' || typeof song.artist !== 'string' || typeof song.album !== 'string' || !Number.isFinite(song.duration) || song.duration < 0 || !Number.isFinite(song.local?.size) || song.local.size <= 0 || !/^local:[a-f0-9]{32}:\d+$/.test(song.id) || !/^[a-f0-9]{32}-\d+\.(mp3|m4a|flac|wav|aac|aiff|aif|ogg|opus)$/.test(song.local?.fileName ?? '')) throw new Error('저장된 로컬 음악 목록 형식을 확인할 수 없습니다.');
    return song;
  });
}
async function save(song: Song) {
  await (await open()).runAsync('INSERT OR REPLACE INTO local_tracks (id, value) VALUES (?, ?)', song.id, JSON.stringify(song));
}
export async function localSource(song: Song): Promise<{ uri: string }> {
  if (song.source !== 'local' || !song.local || !/^[a-f0-9]{32}-\d+\.(mp3|m4a|flac|wav|aac|aiff|aif|ogg|opus)$/.test(song.local.fileName)) throw new Error('로컬 음악 파일 정보가 올바르지 않습니다.');
  const uri = directory() + song.local.fileName;
  let info: FileSystem.FileInfo;
  try { info = await FileSystem.getInfoAsync(uri); }
  catch { throw new Error('음악 파일에 접근할 수 없습니다. 파일을 다시 가져와 주세요.'); }
  if (!info.exists || info.isDirectory || info.size <= 0 || info.size !== song.local.size) throw new Error('음악 파일이 없거나 비어 있습니다. 원본 파일을 다시 가져와 주세요.');
  return { uri };
}
export async function saveLocalDuration(id: string, duration: number): Promise<void> {
  if (!Number.isFinite(duration) || duration <= 0) return;
  const db = await open();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM local_tracks WHERE id = ?', id);
  if (!row) return;
  const song = JSON.parse(row.value) as Song;
  if (song.source === 'local' && Math.abs(song.duration - duration) > 0.5) await save({ ...song, duration });
}
// Serialize imports: duplicate checks and file/DB publication cannot race.
export function importLocalSongs(kind: ImportKind = 'files', onProgress?: (processed: number) => void): Promise<ImportResult> {
  const result = importTail.then(async () => {
    const folder = directory();
    const result: ImportResult = { added: 0, duplicates: 0, failures: [] };
    let assets: AsyncIterable<ImportAsset> | ImportAsset[] | null;
    if (kind === 'files') {
      const selection = await DocumentPicker.getDocumentAsync({ type: ['audio/*', 'application/ogg'], multiple: true, copyToCacheDirectory: true });
      if (selection.canceled) return { ...result, cancelled: true };
      assets = selection.assets.map((asset) => ({ ...asset, temporary: true }));
    } else {
      const scanner = await import('./scan');
      assets = kind === 'device' ? scanner.deviceAssets(result.failures) : await scanner.folderAssets(result.failures);
      if (!assets) return { ...result, cancelled: true };
    }
    await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
    const known = new Map((await readLocalSongs()).map((song) => [song.id, song]));
    let processed = 0;
    try {
      for await (const asset of assets) {
        let destination: string | null = null;
        let created = false;
        let temporaryUri: string | null = asset.temporary ? asset.uri : null;
        let inputUri = asset.uri;
        try {
          const extension = asset.name.split('.').pop()?.toLowerCase();
          if (!extension || !isAudioFile(asset.name)) throw new Error('지원 대상 오디오 확장자가 아닙니다.');
          if (asset.stage) {
            if (!FileSystem.cacheDirectory) throw new Error('임시 저장 공간에 접근할 수 없습니다.');
            temporaryUri = FileSystem.cacheDirectory + 'local-import-' + Date.now() + '-' + (++stagingSequence) + '.' + extension;
            // Stage one file at a time. Hash only the app copy, not a provider stream with unreliable size.
            const { File } = await import('expo-file-system');
            await new File(asset.uri).copy(new File(temporaryUri));
            inputUri = temporaryUri;
          }
          const info = await FileSystem.getInfoAsync(inputUri, { md5: true });
          if (!info.exists || info.isDirectory || !info.size || !info.md5 || !/^[a-f0-9]{32}$/i.test(info.md5)) throw new Error('파일을 읽을 수 없거나 비어 있습니다.');
          const digest = info.md5.toLowerCase();
          const id = 'local:' + digest + ':' + info.size;
          const previous = known.get(id);
          if (previous) {
            try { await localSource(previous); result.duplicates++; continue; } catch { /* Restore the missing app copy below. */ }
          }
          const fileName = previous?.source === 'local' ? previous.local.fileName : digest + '-' + info.size + '.' + extension;
          destination = folder + fileName;
          const existing = await FileSystem.getInfoAsync(destination);
          if (!existing.exists || existing.isDirectory || existing.size !== info.size) {
            created = !existing.exists;
            await FileSystem.copyAsync({ from: inputUri, to: destination });
          }
          const copied = await FileSystem.getInfoAsync(destination, { md5: true });
          if (!copied.exists || copied.isDirectory || copied.size !== info.size || copied.md5?.toLowerCase() !== digest) throw new Error('파일 복사를 완료하지 못했습니다. 저장 공간을 확인해 주세요.');
          const song: Song = previous ?? {
            id, source: 'local', local: { fileName, originalName: asset.name, size: info.size, mimeType: asset.mimeType },
            title: asset.name.replace(/\.[^.]+$/, ''), artist: '알 수 없는 아티스트', album: '이 기기 음악',
            albumId: 'local:device', duration: Number.isFinite(asset.duration) && (asset.duration ?? 0) > 0 ? asset.duration! : 0,
          };
          await save(song);
          known.set(id, song); result.added++;
        } catch (error) {
          if (created && destination) await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => {});
          result.failures.push(asset.name + ' · ' + (error instanceof Error ? error.message : '가져오지 못했습니다.'));
        } finally {
          // Delete only the temporary picker copy; never touch the selected original.
          if (FileSystem.cacheDirectory && temporaryUri?.startsWith(FileSystem.cacheDirectory)) await FileSystem.deleteAsync(temporaryUri, { idempotent: true }).catch(() => {});
          onProgress?.(++processed);
        }
      }
    } catch (error) {
      // Retain songs already imported if enumeration later fails.
      if (kind === 'files') throw error;
      result.failures.push(error instanceof Error ? error.message : '음악 목록을 읽지 못했습니다.');
    }
    return result;
  });
  importTail = result.catch(() => {});
  return result;
}
