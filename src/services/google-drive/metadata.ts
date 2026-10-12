import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import { fetch } from 'expo/fetch';
import type { Song } from '@/types/music';
import { DriveRequestError, driveMediaUrl, type TokenProvider } from './api';
import { readEmbeddedTags, type MusicTags } from './read-tags';

let database: Promise<SQLite.SQLiteDatabase> | null = null;
let artworkSequence = 0;
async function open() {
  if (!database) database = SQLite.openDatabaseAsync('music-library.db').then(async db => {
    await db.execAsync('CREATE TABLE IF NOT EXISTS drive_metadata (cache_key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)');
    return db;
  }).catch((error: unknown) => { database = null; throw error; });
  return database;
}
function key(song: Song): string {
  if (song.source !== 'drive') throw new Error('Not a Drive song');
  return JSON.stringify([1, song.id, song.title, song.drive.size, song.drive.modifiedTime]);
}
function artworkDirectory() {
  if (!FileSystem.cacheDirectory) throw new Error('Google Drive 메타데이터 저장소에 접근할 수 없습니다.');
  return FileSystem.cacheDirectory + 'drive-artwork/';
}
function apply(song: Song, fields: MusicTags, artworkUrl?: string): Song {
  if (song.source !== 'drive') return song;
  const updated: Song = { ...song, ...fields, artworkUrl, albumSource: fields.album?.trim() ? 'tag' : 'fallback' };
  // A Drive account must not collapse all albums into the old single Drive album ID.
  updated.albumId = JSON.stringify(['drive', song.drive.accountId, updated.album, updated.albumArtist || updated.artist]);
  return updated;
}
function validFields(value: unknown): value is MusicTags {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).every(([name, field]) =>
    ['title', 'artist', 'album', 'albumArtist'].includes(name) ? typeof field === 'string' && !!field.trim() && field.length <= 1000
      : ['year', 'trackNumber', 'discNumber', 'duration'].includes(name) && typeof field === 'number' && Number.isFinite(field) && field > 0);
}
async function cached(song: Song): Promise<Song | null> {
  const row = await (await open()).getFirstAsync<{ value: string }>('SELECT value FROM drive_metadata WHERE cache_key = ?', key(song));
  if (!row) return null;
  try {
    const entry = JSON.parse(row.value) as { fields: unknown; artwork?: unknown; saved: number };
    if (!validFields(entry.fields) || !Number.isFinite(entry.saved)) return null;
    // Keep unversioned files fresh too, if Drive did not provide modifiedTime.
    if (song.source === 'drive' && !song.drive.modifiedTime && Date.now() - entry.saved > 3600000) return null;
    let uri: string | undefined;
    if (entry.artwork !== undefined) {
      if (typeof entry.artwork !== 'string' || !/^\d+-\d+\.(jpg|png)$/.test(entry.artwork)) return null;
      uri = artworkDirectory() + entry.artwork;
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists || info.isDirectory || !info.size) return null;
    }
    return apply(song, entry.fields, uri);
  } catch { return null; }
}
export async function readDriveRange(fileId: string, size: number, start: number, end: number, token: TokenProvider, signal: AbortSignal): Promise<Uint8Array> {
  let accessToken = await token();
  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal.aborted) throw new Error('Cancelled metadata');
    const response = await fetch(driveMediaUrl(fileId), {
      headers: { Authorization: 'Bearer ' + accessToken, Range: `bytes=${start}-${end}` }, signal,
    });
    if (response.status === 401 && !attempt) { accessToken = await token(accessToken); continue; }
    if (response.status !== 206) throw new DriveRequestError('Google Drive 파일의 부분 읽기에 실패했습니다.', response.status);
    const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range') ?? '');
    const length = end - start + 1;
    if (!match || Number(match[1]) !== start || Number(match[2]) !== end || Number(match[3]) !== size
      || (response.headers.has('content-length') && Number(response.headers.get('content-length')) !== length)) throw new Error('Invalid Drive byte range');
    if (!response.body) throw new Error('Missing Drive range body');
    const reader = response.body.getReader();
    const bytes = new Uint8Array(length);
    let received = 0;
    try {
      while (received < length) {
        const { done, value } = await reader.read();
        if (signal.aborted) throw new Error('Cancelled metadata');
        if (done) break;
        if (received + value.length > length) throw new Error('Oversized Drive byte range');
        bytes.set(value, received); received += value.length;
      }
      if (received !== length) throw new Error('Incomplete Drive byte range');
      return bytes;
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
  throw new Error('Google Drive 인증 정보를 갱신하지 못했습니다.');
}
export function base64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const parts: string[] = [];
  let part = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1] ?? 0, c = bytes[i + 2] ?? 0;
    part += alphabet[a >> 2] + alphabet[((a & 3) << 4) | (b >> 4)]
      + (i + 1 < bytes.length ? alphabet[((b & 15) << 2) | (c >> 6)] : '=')
      + (i + 2 < bytes.length ? alphabet[c & 63] : '=');
    if (part.length >= 8192) { parts.push(part); part = ''; }
  }
  parts.push(part); return parts.join('');
}
async function readSong(song: Song, token: TokenProvider, external: AbortSignal): Promise<Song> {
  if (song.source !== 'drive' || !Number.isSafeInteger(song.drive.size) || song.drive.size! < 16) return song;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  external.addEventListener('abort', cancel, { once: true });
  if (external.aborted) cancel();
  let rejectAbort = () => {};
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(new Error('Google Drive 메타데이터 읽기가 취소되거나 시간이 초과됐습니다.'));
    controller.signal.addEventListener('abort', rejectAbort, { once: true });
  });
  const timer = setTimeout(cancel, 20000);
  const expires = Date.now() + 20000;
  let accessToken: string | undefined;
  const cachedToken: TokenProvider = async rejected => {
    if (!accessToken || rejected) accessToken = await token(rejected);
    return accessToken;
  };
  let created: string | undefined;
  const check = () => {
    if (Date.now() >= expires) controller.abort();
    if (controller.signal.aborted) throw new Error('Cancelled metadata');
  };
  try {
    check();
    const result = await Promise.race([aborted, readEmbeddedTags(song.drive.size!, (start, end) => readDriveRange(song.drive.fileId, song.drive.size!, start, end, cachedToken, controller.signal), controller.signal)]);
    check();
    let artwork: string | undefined;
    if (result.picture) {
      artwork = `${Date.now()}-${++artworkSequence}.${result.picture.mime === 'image/png' ? 'png' : 'jpg'}`;
      const directory = artworkDirectory();
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
      check(); created = directory + artwork;
      await FileSystem.writeAsStringAsync(created, base64(result.picture.bytes), { encoding: FileSystem.EncodingType.Base64 });
    }
    check();
    await (await open()).runAsync('INSERT OR REPLACE INTO drive_metadata (cache_key, value) VALUES (?, ?)', key(song), JSON.stringify({ fields: result.fields, artwork, saved: Date.now() }));
    check();
    return apply(song, result.fields, created);
  } catch (error) {
    if (created) await FileSystem.deleteAsync(created, { idempotent: true }).catch(() => {});
    throw error;
  } finally {
    // Stop a server that ignored a Range request; never download its whole audio file.
    controller.abort(); clearTimeout(timer); external.removeEventListener('abort', cancel); controller.signal.removeEventListener('abort', rejectAbort);
  }
}
export async function enrichDriveSongs(songs: Song[], token: TokenProvider, signal: AbortSignal, publish: (songs: Song[]) => void): Promise<number> {
  if (Platform.OS === 'web') return 0;
  const updated = [...songs];
  let failures = 0;
  // Small batches bound network, memory, and re-renders while allowing early playback.
  for (let offset = 0; offset < songs.length; offset += 2) {
    if (signal.aborted) return failures;
    await Promise.all(songs.slice(offset, offset + 2).map(async (song, index) => {
      try {
        const hit = await cached(song);
        if (signal.aborted) return;
        updated[offset + index] = hit ?? await readSong(song, token, signal);
      } catch { if (!signal.aborted) failures++; }
    }));
    if (signal.aborted) return failures;
    if (offset % 10 === 0 || offset + 2 >= songs.length) publish([...updated]);
  }
  return failures;
}
