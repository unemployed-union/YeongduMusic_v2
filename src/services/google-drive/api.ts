import { cloudRequest, CloudRequestError } from '@/services/cloud-music/request';
import { AUDIO_EXTENSION } from '@/services/music-source';
import type { Song } from '@/types/music';
export class DriveRequestError extends CloudRequestError {
  constructor(message: string, status?: number) { super(message, status); this.name = 'DriveRequestError'; }
}
export type TokenProvider = (rejectedToken?: string) => Promise<string>;
const ROOT = 'https://www.googleapis.com/drive/v3/files';
const EXTENSION = AUDIO_EXTENSION;
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
export async function driveJson(url: string, token: TokenProvider, signal?: AbortSignal): Promise<unknown> {
  return cloudRequest('Google Drive', async requestSignal => {
    const authToken = async (rejected?: string) => {
      try { return await token(rejected); }
      catch { throw new DriveRequestError('Google 인증 정보를 갱신할 수 없습니다. 설정에서 Google Drive를 다시 연결해 주세요.'); }
    };
    let accessToken = await authToken();
    for (let attempt = 0; attempt < 2; attempt++) {
      if (requestSignal.aborted) throw new DriveRequestError('Google Drive 요청이 취소되었습니다.');
      const response = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken }, signal: requestSignal });
      const text = await response.text();
      if (requestSignal.aborted) throw new DriveRequestError('Google Drive 요청이 취소되었습니다.');
      if (response.status === 401 && attempt === 0) { accessToken = await authToken(accessToken); continue; }
      if (!response.ok) throw new DriveRequestError(response.status === 401 ? 'Google 연결을 다시 로그인해 주세요.'
        : response.status === 403 ? 'Google Drive 접근 권한을 확인해 주세요. Drive API 활성화, 읽기 권한, 테스트 사용자 등록 또는 요청 한도를 확인해 주세요.'
        : response.status === 404 ? 'Google Drive 파일이 삭제되었거나 접근할 수 없습니다.' : 'Google Drive 요청 실패 (HTTP ' + response.status + ')', response.status);
      try { return JSON.parse(text) as unknown; }
      catch { throw new DriveRequestError('Google Drive 응답을 읽을 수 없습니다.'); }
    }
    throw new DriveRequestError('Google 연결을 다시 로그인해 주세요.', 401);
  }, signal, message => new DriveRequestError(message));
}
export type DriveFile = { id: string; name: string };
type AudioFile = DriveFile & { mimeType: string; size?: number; modifiedTime?: string };
export async function readDriveFile(id: string, token: TokenProvider, signal?: AbortSignal): Promise<AudioFile> {
  if (!/^[a-zA-Z0-9_-]{1,256}$/.test(id)) throw new DriveRequestError('Google Drive 음악 파일을 선택해 주세요.');
  const data = await driveJson(ROOT + '/' + encodeURIComponent(id) + '?fields=id,name,mimeType,size,modifiedTime,trashed,capabilities(canDownload)', token, signal);
  if (!record(data) || data.id !== id || typeof data.name !== 'string' || typeof data.mimeType !== 'string') throw new DriveRequestError('예상하지 못한 Google Drive 파일 정보입니다.');
  if (data.trashed === true || record(data.capabilities) && data.capabilities.canDownload === false) throw new DriveRequestError('Google Drive 파일이 삭제되었거나 다운로드 권한이 없습니다.', 404);
  if (data.mimeType === 'application/vnd.google-apps.folder' || data.mimeType === 'application/vnd.google-apps.shortcut' || !data.mimeType.startsWith('audio/') && !EXTENSION.test(data.name)) throw new DriveRequestError('Google Drive에서 지원되는 음악 파일을 선택해 주세요. 폴더 선택은 지원하지 않습니다.');
  const size = typeof data.size === 'string' ? Number(data.size) : undefined;
  if (size !== undefined && (!Number.isSafeInteger(size) || size <= 0)) throw new DriveRequestError('Google Drive 음악 파일 크기를 확인할 수 없습니다.');
  return { id, name: data.name, mimeType: data.mimeType, size, modifiedTime: typeof data.modifiedTime === 'string' ? data.modifiedTime : undefined };
}
/** Only explicit file IDs are read. Choosing a folder never grants its descendants. */
export async function loadDriveSongs(accountId: string, fileIds: string[], token: TokenProvider, signal?: AbortSignal, onUnavailable?: (ids: string[]) => void): Promise<Song[]> {
  const ids = [...new Set(fileIds)];
  if (ids.length > 10000) throw new DriveRequestError('Google Drive 음악은 최대 10,000개까지 선택할 수 있습니다.');
  const songs = new Map<string, Song>(), unavailable: string[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, ids.length) }, async () => {
    while (next < ids.length) {
      if (signal?.aborted) throw new DriveRequestError('Google Drive 요청이 취소되었습니다.');
      const fileId = ids[next++];
      let file: AudioFile;
      try { file = await readDriveFile(fileId, token, signal); }
      catch (error) { if (error instanceof DriveRequestError && error.status === 404) { unavailable.push(fileId); continue; } throw error; }
      const id = 'drive:' + encodeURIComponent(accountId) + ':' + encodeURIComponent(file.id);
      songs.set(file.id, { id, source: 'drive', title: file.name.replace(EXTENSION, ''), artist: '알 수 없는 아티스트', album: 'Google Drive', albumSource: 'fallback', albumId: 'drive:' + encodeURIComponent(accountId), duration: 0,
        drive: { fileId: file.id, accountId, mimeType: file.mimeType, size: file.size, modifiedTime: file.modifiedTime } });
    }
  }));
  if (signal?.aborted) throw new DriveRequestError('Google Drive 요청이 취소되었습니다.');
  if (unavailable.length) onUnavailable?.(unavailable);
  return ids.flatMap(id => { const song = songs.get(id); return song ? [song] : []; });
}
export function driveMediaUrl(fileId: string): string { return ROOT + '/' + encodeURIComponent(fileId) + '?alt=media'; }
