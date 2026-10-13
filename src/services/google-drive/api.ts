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
export type DriveFolder = { id: string; name: string };
const FOLDER_MIME = 'application/vnd.google-apps.folder';
function parentQuery(id: string) {
  if (!id.trim()) throw new DriveRequestError('Google Drive 음악 폴더를 선택해 주세요.');
  return "'" + id.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "' in parents";
}
async function filePage(query: string, token: TokenProvider, signal?: AbortSignal, pageToken?: string) {
  const url = new URL(ROOT);
  url.searchParams.set('q', query);
  url.searchParams.set('pageSize', '200'); url.searchParams.set('spaces', 'drive'); url.searchParams.set('corpora', 'user'); url.searchParams.set('orderBy', 'name_natural');
  url.searchParams.set('fields', 'nextPageToken,incompleteSearch,files(id,name,mimeType,size,modifiedTime,capabilities(canDownload))');
  if (pageToken) url.searchParams.set('pageToken', pageToken);
  const data = await driveJson(url.toString(), token, signal);
  if (!record(data) || !Array.isArray(data.files) || (data.nextPageToken !== undefined && typeof data.nextPageToken !== 'string')) throw new DriveRequestError('예상하지 못한 Google Drive 목록 응답입니다.');
  if (data.incompleteSearch === true) throw new DriveRequestError('Google Drive 검색이 완료되지 않았습니다. 다시 시도해 주세요.');
  const files = data.files.map((file: unknown) => {
    if (!record(file) || typeof file.id !== 'string' || !file.id || typeof file.name !== 'string' || typeof file.mimeType !== 'string') throw new DriveRequestError('예상하지 못한 Google Drive 파일 정보입니다.');
    return { id: file.id, name: file.name, mimeType: file.mimeType, size: file.size, modifiedTime: file.modifiedTime, capabilities: file.capabilities };
  });
  return { files, nextPageToken: data.nextPageToken as string | undefined };
}
export async function loadDriveFolderPage(parentId: string, token: TokenProvider, signal?: AbortSignal, pageToken?: string) {
  const page = await filePage(parentQuery(parentId) + " and trashed = false and mimeType = '" + FOLDER_MIME + "'", token, signal, pageToken);
  return { folders: page.files.filter(file => file.mimeType === FOLDER_MIME).map(({ id, name }) => ({ id, name })), nextPageToken: page.nextPageToken };
}
export async function readDriveFolder(id: string, token: TokenProvider, signal?: AbortSignal): Promise<DriveFolder> {
  parentQuery(id); // Reject missing IDs before requesting anything.
  const data = await driveJson(ROOT + '/' + encodeURIComponent(id) + '?fields=id,name,mimeType,trashed', token, signal);
  if (!record(data) || data.id !== id || typeof data.name !== 'string' || data.mimeType !== FOLDER_MIME || data.trashed === true) {
    throw new DriveRequestError('Google Drive 음악 폴더가 삭제되었거나 올바른 폴더가 아닙니다. 설정에서 다시 선택해 주세요.');
  }
  return { id, name: data.name };
}
export async function loadDriveSongs(accountId: string, folderIds: string[], token: TokenProvider, signal?: AbortSignal): Promise<Song[]> {
  const folders = [...new Set(folderIds)];
  if (!folders.length) throw new DriveRequestError('Google Drive 음악 폴더를 선택해 주세요.');
  for (const id of folders) await readDriveFolder(id, token, signal);
  const songs = new Map<string, Song>(), visitedFolders = new Set(folders);
  const audioQuery = "mimeType contains 'audio/' or " + ['mp3', 'm4a', 'flac', 'wav', 'aac', 'ogg', 'opus', 'aif', 'aiff', 'alac'].map(ext => "name contains '." + ext + "'").join(' or ');
  // Share visited IDs across all selected subtrees, including overlapping roots.
  // Folder shortcuts are not followed.
  for (let index = 0; index < folders.length; index++) {
    const query = parentQuery(folders[index]) + " and trashed = false and (mimeType = '" + FOLDER_MIME + "' or " + audioQuery + ')';
    const visitedPages = new Set<string>();
    let nextPage: string | undefined;
    do {
      const page = await filePage(query, token, signal, nextPage);
      for (const file of page.files) {
        if (file.mimeType === FOLDER_MIME) {
          if (!visitedFolders.has(file.id)) { visitedFolders.add(file.id); folders.push(file.id); }
          continue;
        }
        if (file.mimeType === 'application/vnd.google-apps.shortcut' || (!file.mimeType.startsWith('audio/') && !EXTENSION.test(file.name)) || (record(file.capabilities) && file.capabilities.canDownload === false)) continue;
        const id = 'drive:' + encodeURIComponent(accountId) + ':' + encodeURIComponent(file.id);
        songs.set(id, { id, source: 'drive', title: file.name.replace(EXTENSION, ''), artist: '알 수 없는 아티스트', album: 'Google Drive', albumSource: 'fallback', albumId: 'drive:' + encodeURIComponent(accountId), duration: 0,
          drive: { fileId: file.id, accountId, mimeType: file.mimeType, size: typeof file.size === 'string' && Number.isFinite(Number(file.size)) ? Number(file.size) : undefined, modifiedTime: typeof file.modifiedTime === 'string' ? file.modifiedTime : undefined } });
      }
      nextPage = page.nextPageToken;
      if (nextPage && visitedPages.has(nextPage)) throw new DriveRequestError('Google Drive 페이지 정보가 반복됩니다. 다시 시도해 주세요.');
      if (nextPage) visitedPages.add(nextPage);
    } while (nextPage);
  }
  return [...songs.values()];
}
export function driveMediaUrl(fileId: string): string { return ROOT + '/' + encodeURIComponent(fileId) + '?alt=media'; }
