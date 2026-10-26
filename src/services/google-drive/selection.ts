import type { DriveFile } from './api';

const key = (accountId: string) => 'google-drive-files-v1:' + accountId;
export function parseDriveSelection(raw: string | null): DriveFile[] {
  if (raw === null) return [];
  const value = JSON.parse(raw) as { version?: unknown; files?: unknown };
  if (value?.version !== 1 || !Array.isArray(value.files) || value.files.length > 10000 || value.files.some(file => !file || typeof file !== 'object'
    || typeof file.id !== 'string' || !/^[a-zA-Z0-9_-]{1,256}$/.test(file.id) || typeof file.name !== 'string' || file.name.length > 1000)) throw new Error('Google 음악 파일 목록을 확인할 수 없습니다. 다시 선택해 주세요.');
  return [...new Map(value.files.map(file => [file.id, { id: file.id, name: file.name }])).values()];
}
export async function loadDriveSelection(accountId: string): Promise<DriveFile[]> {
  const storage = (await import('expo-sqlite/kv-store')).default;
  return parseDriveSelection(await storage.getItem(key(accountId)));
}
export async function saveDriveSelection(accountId: string, files: DriveFile[], current: () => boolean): Promise<void> {
  const value = JSON.stringify({ version: 1, files: parseDriveSelection(JSON.stringify({ version: 1, files })) });
  const storage = (await import('expo-sqlite/kv-store')).default, name = key(accountId);
  const previous = await storage.getItem(name);
  if (!current()) return;
  await storage.setItem(name, value);
  // Keep rollback inside the caller's write barrier: a canceled save cannot
  // overwrite a newer selection, including a return to the same account.
  if (!current()) {
    if (previous === null) await storage.removeItem(name); else await storage.setItem(name, previous);
  }
}
