import { File, UploadType } from 'expo-file-system';
import { cloudRequest, CloudRequestError } from '@/services/cloud-music/request';
import type { Session } from '@/services/synology/api';
import { checkCancelled, uploadFile, type FileProgress, type FileTarget } from './file-io';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('NAS 파일 응답을 읽을 수 없습니다.');
  return value as Record<string, unknown>;
}
export function nasFilePath(path: string): string {
  if (!path.startsWith('/') || path.includes('\0') || path.includes('\\') || path.split('/').some(part => part === '.' || part === '..')) throw new Error('NAS 파일 경로를 확인할 수 없습니다.');
  return path.replace(/^\/volume\d+\//, '/');
}
export function nasFileEndpoint(session: Session, api: string, method: string, version: number, values: Record<string, string> = {}): string {
  const info = session.apis[api];
  if (!info || version < info.minVersion || version > info.maxVersion || !/^[\w./-]+$/.test(info.path) || info.path.includes('..') || info.path.startsWith('/')) throw new Error('이 NAS의 File Station 파일 편집 API를 사용할 수 없습니다. File Station 설치와 권한을 확인해 주세요.');
  const params = new URLSearchParams({ api, version: String(version), method, _sid: session.sid, ...values });
  if (session.token) params.set('SynoToken', session.token);
  return session.baseUrl + '/webapi/' + info.path + '?' + params;
}
export function parseNasFileResponse(value: unknown): Record<string, unknown> {
  const envelope = record(value);
  if (envelope.success !== true) {
    const code = record(envelope.error).code;
    throw new CloudRequestError(`NAS 파일 작업 실패 (코드 ${typeof code === 'number' ? code : '알 수 없음'}). File Station 읽기·쓰기 권한과 세션을 확인해 주세요.`);
  }
  return envelope.data ? record(envelope.data) : {};
}
async function call(session: Session, api: string, method: string, version: number, values: Record<string, string>, signal?: AbortSignal) {
  return cloudRequest('NAS 파일', async requestSignal => {
    const response = await fetch(nasFileEndpoint(session, api, method, version, values), { signal: requestSignal, redirect: 'error', cache: 'no-store' });
    if (!response.ok) throw new Error('NAS 파일 HTTP 오류');
    return parseNasFileResponse(await response.json());
  }, signal);
}
async function info(session: Session, path: string, signal?: AbortSignal) {
  const data = await call(session, 'SYNO.FileStation.List', 'getinfo', 2, { path: JSON.stringify([path]), additional: JSON.stringify(['size', 'time', 'real_path']) }, signal);
  if (!Array.isArray(data.files) || data.files.length !== 1) throw new Error('NAS 원본 파일을 찾을 수 없습니다.');
  const file = record(data.files[0]), additional = record(file.additional), time = record(additional.time);
  if (file.path !== path || file.isdir !== false || typeof file.name !== 'string' || !Number.isSafeInteger(additional.size) || Number(additional.size) <= 0 || typeof time.mtime !== 'number' || typeof time.ctime !== 'number') throw new Error('NAS 원본 파일 정보를 확인할 수 없습니다.');
  return { name: file.name, size: Number(additional.size), mtime: time.mtime, ctime: time.ctime, realPath: additional.real_path };
}
export async function prepareNasFile(session: Session, originalPath: string, signal: AbortSignal): Promise<FileTarget> {
  const path = nasFilePath(originalPath), folder = path.slice(0, path.lastIndexOf('/'));
  const original = await info(session, path, signal);
  if (path !== originalPath && original.realPath !== originalPath) throw new Error('Audio Station과 File Station의 원본 경로가 일치하지 않습니다.');
  nasFileEndpoint(session, 'SYNO.FileStation.Upload', 'upload', 2);
  nasFileEndpoint(session, 'SYNO.FileStation.Rename', 'rename', 2);
  await call(session, 'SYNO.FileStation.CheckPermission', 'write', 3, { path: JSON.stringify(folder), filename: JSON.stringify(original.name), overwrite: 'true', create_only: 'false' }, signal);
  const unchanged = async () => {
    const latest = await info(session, path, signal);
    if (latest.size !== original.size || latest.mtime !== original.mtime || latest.ctime !== original.ctime) throw new Error('NAS 원본 파일이 변경되었습니다. 목록을 새로고침한 뒤 다시 수정해 주세요.');
  };
  return { name: original.name, size: original.size,
    download: { uri: nasFileEndpoint(session, 'SYNO.FileStation.Download', 'download', 2, { path: JSON.stringify([path]), mode: 'download' }) },
    unchanged,
    commit: async (output: File, progress: FileProgress) => {
      checkCancelled(signal); await unchanged();
      const suffix = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
      const stagedName = '.yeongdu-new-' + suffix, backupName = original.name + '.' + suffix + '.yeongdu-backup';
      const staged = new File(output.parentDirectory, stagedName);
      await output.copy(staged);
      const result = await uploadFile(staged, nasFileEndpoint(session, 'SYNO.FileStation.Upload', 'upload', 2), {
        uploadType: UploadType.MULTIPART, fieldName: 'file', mimeType: 'application/octet-stream', parameters: { path: folder, create_parents: 'false', overwrite: 'false' }, signal,
      }, progress);
      let response: unknown;
      try { response = JSON.parse(result.body); } catch { throw new Error('NAS 파일 업로드 응답을 읽지 못했습니다. 원본 파일은 교체하지 않았습니다.'); }
      parseNasFileResponse(response);
      if ((await info(session, folder + '/' + stagedName, signal)).size !== output.size) throw new Error('NAS 임시 파일의 크기가 일치하지 않습니다. 원본은 유지했습니다.');
      await unchanged(); checkCancelled(signal);
      const rename = (from: string, name: string) => call(session, 'SYNO.FileStation.Rename', 'rename', 2, { path: JSON.stringify([from]), name: JSON.stringify([name]) });
      // Once publication starts, finish or restore it with the captured session.
      // Keep the pre-edit file on NAS even if the app or network stops mid-publication.
      progress('NAS 원본 백업 및 저장 중');
      try {
        await rename(path, backupName);
        await rename(folder + '/' + stagedName, original.name);
      }
      catch {
        // Rename refuses existing destinations, so an uncertain late result cannot be overwritten.
        const present = await info(session, path).then(() => true, () => null);
        if (present === null) {
          try { await rename(folder + '/' + backupName, original.name); } catch { /* Backup remains on NAS. */ }
        }
        throw new Error(`NAS 저장 결과를 확인하지 못했습니다. File Station에서 원본과 백업 ${backupName}을 확인해 주세요.`);
      }
      return 'NAS 원본에 저장했습니다. 수정 전 파일은 같은 폴더의 ' + backupName + '에 보관했습니다.';
    },
  };
}
