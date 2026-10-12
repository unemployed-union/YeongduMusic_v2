import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import type { Song } from '@/types/music';
import { useFolderExclusionStore } from '@/stores/folder-exclusions';
import { folderExcluded, localFolderKey, localSongExcluded } from './folders';

export type ImportKind = 'files' | 'device' | 'folder';
export type ImportAsset = { uri: string; name: string; mimeType?: string; duration?: number; stage?: boolean; temporary?: boolean; originFolder?: string };
export function isAudioFile(name: string): boolean { return /\.(mp3|m4a|flac|wav|aac|aiff|aif|ogg|opus|alac)$/i.test(name); }
let stagingSequence = 0;
export type ImportResult = { added: number; duplicates: number; failures: string[]; cancelled?: boolean; excluded?: number };
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
    if (!song || song.source !== 'local' || typeof song.title !== 'string' || typeof song.artist !== 'string' || typeof song.album !== 'string' || !Number.isFinite(song.duration) || song.duration < 0 || !Number.isFinite(song.local?.size) || song.local.size <= 0 || !/^local:[a-f0-9]{32}:\d+$/.test(song.id) || !/^[a-f0-9]{32}-\d+\.(mp3|m4a|flac|wav|aac|aiff|aif|ogg|opus|alac)$/.test(song.local?.fileName ?? '')) throw new Error('저장된 로컬 음악 목록 형식을 확인할 수 없습니다.');
    if (song.local.originalFolders !== undefined && (!Array.isArray(song.local.originalFolders) || song.local.originalFolders.some(folder => typeof folder !== 'string' || !folder || localFolderKey(folder) !== folder))) throw new Error('저장된 원본 폴더 정보를 확인할 수 없습니다.');
    return { ...song, albumSource: song.albumSource ?? 'fallback' };
  });
}
async function save(song: Song) {
  await (await open()).runAsync('INSERT OR REPLACE INTO local_tracks (id, value) VALUES (?, ?)', song.id, JSON.stringify(song));
}
export async function localSource(song: Song): Promise<{ uri: string }> {
  if (song.source !== 'local' || !song.local || !/^[a-f0-9]{32}-\d+\.(mp3|m4a|flac|wav|aac|aiff|aif|ogg|opus|alac)$/.test(song.local.fileName)) throw new Error('로컬 음악 파일 정보가 올바르지 않습니다.');
  await useFolderExclusionStore.getState().load();
  const exclusions = useFolderExclusionStore.getState();
  if (!exclusions.ready) throw new Error(exclusions.error ?? '제외 폴더 설정을 불러오지 못했습니다.');
  const record = await (await open()).getFirstAsync<{ value: string }>('SELECT value FROM local_tracks WHERE id = ?', song.id);
  const latest = record ? JSON.parse(record.value) as Song : song;
  if (localSongExcluded(latest, exclusions.folders)) throw new Error('가져오기 제외 폴더의 음악입니다. 설정에서 제외를 해제해 주세요.');
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
// Downloads and deletions use the same serialization as device imports.
export function storeDownloadedSong(original: Song, uri: string, extension: string, mimeType: string, signal?: AbortSignal): Promise<{ song: Song; duplicate: boolean }> {
  const result = importTail.then(async () => {
    const check = () => { if (signal?.aborted) throw new Error('음악 보관을 취소했습니다.'); };
    check();
    if (original.source === 'local' || !isAudioFile('file.' + extension)) throw new Error('보관할 음악 정보가 올바르지 않습니다.');
    const info = await FileSystem.getInfoAsync(uri, { md5: true });
    if (!info.exists || info.isDirectory || !info.size || !info.md5 || !/^[a-f0-9]{32}$/i.test(info.md5)) throw new Error('내려받은 음악 파일을 확인할 수 없습니다.');
    const digest = info.md5.toLowerCase(), id = 'local:' + digest + ':' + info.size;
    const previous = (await readLocalSongs()).find(song => song.id === id);
    check();
    if (previous) {
      try { await localSource(previous); return { song: previous, duplicate: true }; }
      catch { /* Repair a missing copy below. */ }
    }
    const fileName = previous?.source === 'local' ? previous.local.fileName : digest + '-' + info.size + '.' + extension;
    const folder = directory(), destination = folder + fileName;
    await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
    let created = false;
    try {
      check();
      created = !(await FileSystem.getInfoAsync(destination)).exists;
      await FileSystem.copyAsync({ from: uri, to: destination });
      const copied = await FileSystem.getInfoAsync(destination, { md5: true });
      if (!copied.exists || copied.isDirectory || copied.size !== info.size || copied.md5?.toLowerCase() !== digest) throw new Error('음악 저장을 완료하지 못했습니다. 저장 공간을 확인해 주세요.');
      check();
      // Explicit fields only: never persist source URLs, tokens, account IDs or NAS paths.
      const song: Song = previous ?? {
        id, source: 'local',
        title: original.title, artist: original.artist, album: original.album, albumSource: original.albumSource ?? 'fallback',
        albumArtist: original.albumArtist, discNumber: original.discNumber, year: original.year,
        duration: original.duration, trackNumber: original.trackNumber, palette: original.palette,
        local: { fileName, originalName: original.title + '.' + extension, size: info.size, mimeType, downloadedFrom: original.source === 'drive' ? 'drive' : 'nas' },
      };
      await save(song);
      return { song, duplicate: false };
    } catch (error) {
      if (created) await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => {});
      throw error;
    }
  });
  importTail = result.catch(() => {});
  return result;
}
export function deleteLocalSong(id: string): Promise<void> {
  const result = importTail.then(async () => {
    const song = (await readLocalSongs()).find(song => song.id === id);
    if (!song || song.source !== 'local') throw new Error('저장된 음악을 찾을 수 없습니다.');
    // Filename validation in readLocalSongs keeps deletion within the app-owned directory.
    await FileSystem.deleteAsync(directory() + song.local.fileName, { idempotent: true });
    await (await open()).runAsync('DELETE FROM local_tracks WHERE id = ?', id);
  });
  importTail = result.catch(() => {});
  return result;
}
// Serialize imports: duplicate checks and file/DB publication cannot race.
export function importLocalSongs(kind: ImportKind = 'files', onProgress?: (processed: number) => void): Promise<ImportResult> {
  const result = importTail.then(async () => {
    const folder = directory();
    await useFolderExclusionStore.getState().load();
    const exclusions = useFolderExclusionStore.getState();
    if (!exclusions.ready) throw new Error(exclusions.error ?? '제외 폴더 설정을 불러오지 못했습니다.');
    const result: ImportResult = { added: 0, duplicates: 0, failures: [], excluded: 0 };
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
    // Old records lack folder metadata. Hash matching names once to associate the exact content, never infer from a name alone.
    const legacyNames = new Set([...known.values()].filter(song => song.source === 'local' && !song.local.originalFolders?.length).map(song => song.source === 'local' ? song.local.originalName : ''));
    let processed = 0;
    try {
      for await (const asset of assets) {
        let destination: string | null = null;
        let created = false;
        let temporaryUri: string | null = asset.temporary ? asset.uri : null;
        let inputUri = asset.uri;
        try {
          const originFolder = asset.originFolder ? localFolderKey(asset.originFolder) : undefined;
          if (!originFolder && kind !== 'files' && exclusions.folders.length) throw new Error('원본 폴더를 확인할 수 없어 제외 여부를 판단할 수 없습니다. 폴더 선택으로 다시 가져와 주세요.');
          const excluded = !!originFolder && folderExcluded(originFolder, exclusions.folders);
          if (excluded && !legacyNames.has(asset.name)) { result.excluded!++; continue; }
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
          let previous = known.get(id);
          if (previous?.source === 'local' && originFolder && !previous.local.originalFolders?.includes(originFolder)) {
            previous = { ...previous, local: { ...previous.local, originalFolders: [...(previous.local.originalFolders ?? []), originFolder] } };
            await save(previous); known.set(id, previous);
          }
          if (excluded) { result.excluded!++; continue; }
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
            id, source: 'local', local: { fileName, originalName: asset.name, size: info.size, mimeType: asset.mimeType, originalFolders: originFolder ? [originFolder] : undefined },
            title: asset.name.replace(/\.[^.]+$/, ''), artist: '알 수 없는 아티스트', album: '이 기기 음악', albumSource: 'fallback',
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
