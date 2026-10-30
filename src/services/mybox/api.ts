import { CloudRequestError, cloudRequest } from '@/services/cloud-music/request';
import { AUDIO_EXTENSION } from '@/services/music-source';
import { Sha256 } from '@aws-crypto/sha256-js';
import type { Song } from '@/types/music';

const API = 'https://open-api.mybox.naver.com/v1';
export class MyboxError extends CloudRequestError {}
export type MyboxInput = { token: string; folder?: string };
export type MyboxConnection = { id: string; token: string; folder: string };
export type MyboxPublicConnection = Pick<MyboxConnection, 'id' | 'folder'>;
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export function prepareMyboxConnection(
  input: MyboxInput,
  id = 'mbx-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12),
): MyboxConnection {
  if (!input || typeof input.token !== 'string') {
    throw new MyboxError('MYBOX 개인 액세스 토큰을 입력해 주세요.');
  }
  const token = input.token.trim();
  if (!/^mbx_pat_[\x21-\x7e]{8,1016}$/.test(token)) {
    throw new MyboxError('MYBOX에서 발급한 개인 액세스 토큰(mbx_pat_…)을 확인해 주세요.');
  }
  const path = input.folder?.trim() || '/';
  if (
    !path.startsWith('/') ||
    path.length > 1024 ||
    /[\x00-\x1f\\]/.test(path) ||
    path.split('/').some((part) => part === '.' || part === '..')
  ) {
    throw new MyboxError('음악 폴더는 /음악/처럼 전체 경로로 입력해 주세요.');
  }
  if (!/^mbx-[a-z0-9-]{5,80}$/.test(id)) {
    throw new MyboxError('저장된 MYBOX 연결 정보를 확인할 수 없습니다.');
  }
  return { id, token, folder: path.replace(/\/+/g, '/').replace(/\/$/, '') + '/' };
}
export const publicMyboxConnection = ({ id, folder }: MyboxConnection): MyboxPublicConnection => ({
  id,
  folder,
});
function httpError(status: number): MyboxError {
  let detail: string;
  if (status === 401) {
    detail = '토큰이 만료되었거나 유효하지 않습니다. 새 개인 액세스 토큰으로 다시 연결해 주세요.';
  } else if (status === 403 || status === 423) {
    detail = '계정 상태 또는 파일 접근 권한을 확인해 주세요.';
  } else if (status === 404) {
    detail = '음악 파일이나 폴더를 찾지 못했습니다.';
  } else if (status === 429) {
    detail = 'API 사용 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.';
  } else {
    detail = '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  }

  return new MyboxError('MYBOX ' + detail, status);
}
async function request(
  connection: MyboxConnection,
  path: string,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  return cloudRequest(
    'MYBOX',
    async (requestSignal) => {
      const response = await fetch(API + path, {
        headers: { Authorization: 'Bearer ' + connection.token, Accept: 'application/json' },
        signal: requestSignal,
        redirect: 'error',
      });
      if (!response.ok) {
        throw httpError(response.status);
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new MyboxError('MYBOX 응답 형식을 확인할 수 없습니다.');
      }
      if (!record(body)) {
        throw new MyboxError('MYBOX 응답 형식을 확인할 수 없습니다.');
      }
      return body;
    },
    signal,
    (message) => new MyboxError(message),
  );
}
/** Root parent IDs identify the drive independently of a rotating PAT or selected folder. */
export async function identifyMyboxConnection(
  connection: MyboxConnection,
  signal?: AbortSignal,
): Promise<MyboxConnection> {
  const body = await request(connection, '/drive/resources?count=100', signal);
  if (!Array.isArray(body.resources)) {
    throw new MyboxError('MYBOX 계정 정보를 확인할 수 없습니다.');
  }
  const root = body.resources[0];
  // An empty drive has no songs to preserve; retain its locally generated scope.
  if (root === undefined) {
    return connection;
  }
  if (!record(root) || typeof root.parentId !== 'string' || root.parentId.length > 2048) {
    throw new MyboxError('MYBOX 계정 정보를 확인할 수 없습니다.');
  }
  if (root.parentId.length < 16) {
    return connection;
  }
  const hash = new Sha256();
  hash.update(JSON.stringify(['naver-mybox-root', root.parentId]));
  const id =
    'mbx-' + Array.from(await hash.digest(), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return { ...connection, id };
}
export async function myboxDownloadSource(
  connection: MyboxConnection,
  fileId: string,
  signal?: AbortSignal,
): Promise<{ uri: string }> {
  if (!fileId || fileId.length > 2048) {
    throw new MyboxError('MYBOX 파일 정보를 확인할 수 없습니다.');
  }
  const body = await request(
    connection,
    '/drive/files/' + encodeURIComponent(fileId) + '/download',
    signal,
  );
  let url: URL;
  try {
    url = new URL(String(body.downloadUrl));
  } catch {
    throw new MyboxError('MYBOX 다운로드 주소를 확인할 수 없습니다.');
  }
  // The PAT stays on the API host; the one-use storage URL authenticates itself.
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    typeof body.expiresIn !== 'number' ||
    !Number.isFinite(body.expiresIn) ||
    body.expiresIn <= 0
  ) {
    throw new MyboxError('MYBOX 다운로드 주소를 확인할 수 없습니다.');
  }
  return { uri: url.href };
}
export async function listMyboxSongs(
  connection: MyboxConnection,
  signal?: AbortSignal,
  cursor?: string,
) {
  const query = new URLSearchParams({ category: 'audio', count: '200' });
  if (connection.folder !== '/') {
    query.set('parentPath', connection.folder);
  }
  if (cursor) {
    query.set('cursor', cursor);
  }
  const body = await request(connection, '/search/resources/files?' + query, signal);
  if (body.resources !== undefined && !Array.isArray(body.resources)) {
    throw new MyboxError('MYBOX 음악 목록 형식을 확인할 수 없습니다.');
  }
  const resources = (body.resources ?? []) as unknown[];
  const songs: Song[] = [];
  for (const value of resources) {
    if (
      !record(value) ||
      typeof value.resourceId !== 'string' ||
      !value.resourceId ||
      value.resourceId.length > 2048 ||
      typeof value.name !== 'string' ||
      typeof value.parentPath !== 'string' ||
      !value.parentPath.startsWith('/') ||
      typeof value.size !== 'number' ||
      !Number.isSafeInteger(value.size) ||
      value.size < 0
    ) {
      throw new MyboxError('MYBOX 음악 파일 정보를 확인할 수 없습니다.');
    }
    const parent = value.parentPath.replace(/\/$/, '') + '/';
    if (connection.folder !== '/' && !parent.startsWith(connection.folder)) {
      throw new MyboxError('MYBOX가 선택한 음악 폴더 밖의 파일을 반환했습니다.');
    }
    if (!AUDIO_EXTENSION.test(value.name) || value.size <= 0) {
      continue;
    }
    songs.push({
      id: 'mybox:' + connection.id + ':' + encodeURIComponent(value.resourceId),
      source: 'mybox',
      path: parent + value.name,
      title: value.name.replace(AUDIO_EXTENSION, ''),
      artist: '알 수 없는 아티스트',
      album: parent.split('/').filter(Boolean).pop() || 'MYBOX',
      albumSource: 'fallback',
      albumId: 'mybox:' + connection.id + ':album:' + encodeURIComponent(parent),
      duration: 0,
      mybox: {
        connectionId: connection.id,
        fileId: value.resourceId,
        fileName: value.name,
        size: value.size,
        modifiedTime: typeof value.modifiedAt === 'string' ? value.modifiedAt : undefined,
      },
    });
  }
  if (body.responseMetaData !== undefined && !record(body.responseMetaData)) {
    throw new MyboxError('MYBOX 페이지 정보를 확인할 수 없습니다.');
  }
  const next = (body.responseMetaData as Record<string, unknown> | undefined)?.nextCursor;
  if (next !== undefined && next !== null && (typeof next !== 'string' || next.length > 8192)) {
    throw new MyboxError('MYBOX 페이지 정보를 확인할 수 없습니다.');
  }
  return {
    songs,
    next: typeof next === 'string' && next ? next : undefined,
    scanned: resources.length,
  };
}
function pause(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      reject(new MyboxError('MYBOX 요청이 취소되었습니다.'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, 2100);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) {
      abort();
    }
  });
}
export async function loadMyboxSongs(
  connection: MyboxConnection,
  signal?: AbortSignal,
  onProgress?: (scanned: number) => void,
): Promise<Song[]> {
  const songs = new Map<string, Song>();
  const cursors = new Set<string>();
  let cursor: string | undefined;
  let scanned = 0;
  do {
    // Search is limited to 30 requests/minute; no per-file requests during scans.
    if (cursor) {
      await pause(signal);
    }
    const page = await listMyboxSongs(connection, signal, cursor);
    if (signal?.aborted) {
      throw new MyboxError('MYBOX 요청이 취소되었습니다.');
    }
    page.songs.forEach((song) => songs.set(song.id, song));
    scanned += page.scanned;
    onProgress?.(scanned);
    cursor = page.next;
    if (cursor && cursors.has(cursor)) {
      throw new MyboxError('MYBOX 페이지 정보가 반복됩니다. 다시 시도해 주세요.');
    }
    if (cursor) {
      cursors.add(cursor);
    }
  } while (cursor);
  return [...songs.values()];
}
