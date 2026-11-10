import { driveJson, type TokenProvider } from './api';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Google Drive 변경 응답을 확인할 수 없습니다.');
  }
  return value as Record<string, unknown>;
}

export async function startDriveChanges(token: TokenProvider, signal: AbortSignal): Promise<string> {
  const value = object(await driveJson('https://www.googleapis.com/drive/v3/changes/startPageToken?supportsAllDrives=true', token, signal));
  if (typeof value.startPageToken !== 'string' || !value.startPageToken) {
    throw new Error('Google Drive 변경 기준을 확인할 수 없습니다.');
  }
  return value.startPageToken;
}

export async function readDriveChanges(
  cursor: string,
  selected: ReadonlySet<string>,
  token: TokenProvider,
  signal: AbortSignal,
) {
  const changed = new Set<string>();
  const removed = new Set<string>();
  const visited = new Set<string>();
  let page = cursor;
  while (true) {
    if (signal.aborted || visited.has(page) || visited.size >= 100) {
      throw new Error('Google Drive 변경 조회가 취소되었거나 너무 큽니다.');
    }
    visited.add(page);
    const params = new URLSearchParams({ pageToken: page, pageSize: '1000', spaces: 'drive',
      includeRemoved: 'true', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true',
      fields: 'nextPageToken,newStartPageToken,changes(fileId,removed,file(trashed))' });
    const value = object(await driveJson('https://www.googleapis.com/drive/v3/changes?' + params, token, signal));
    if (!Array.isArray(value.changes)) {
      throw new Error('Google Drive 변경 목록을 확인할 수 없습니다.');
    }
    for (const raw of value.changes) {
      const change = object(raw);
      if (typeof change.fileId !== 'string' || !selected.has(change.fileId)) {
        continue;
      }
      const trashed = change.file && typeof change.file === 'object' && 'trashed' in change.file && change.file.trashed === true;
      if (change.removed === true || trashed) {
        removed.add(change.fileId);
        changed.delete(change.fileId);
      } else {
        changed.add(change.fileId);
        removed.delete(change.fileId);
      }
    }
    if (typeof value.nextPageToken === 'string' && value.nextPageToken) {
      page = value.nextPageToken;
    } else if (typeof value.newStartPageToken === 'string' && value.newStartPageToken) {
      return { cursor: value.newStartPageToken, changed, removed };
    } else {
      throw new Error('Google Drive의 다음 변경 기준이 없습니다.');
    }
  }
}
