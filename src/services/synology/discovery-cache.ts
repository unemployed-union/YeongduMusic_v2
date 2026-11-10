import { readPreference, writePreference } from '@/services/preferences/storage';
import { parseApiInfo, type ApiInfo } from './api';

const key = (baseUrl: string) => 'yeongdumusic-nas-api-v1:' + encodeURIComponent(baseUrl);

/** Only API paths and versions; account credentials remain in SecureStore. */
export async function readCachedNasApis(baseUrl: string): Promise<ApiInfo | null> {
  const raw = await readPreference(key(baseUrl));
  if (!raw) {
    return null;
  }
  const saved: unknown = JSON.parse(raw);
  if (!saved || typeof saved !== 'object' || !('version' in saved) || saved.version !== 1 ||
      !('savedAt' in saved) || typeof saved.savedAt !== 'number' ||
      Date.now() - saved.savedAt < 0 || Date.now() - saved.savedAt > 24 * 60 * 60_000 || !('apis' in saved)) {
    return null;
  }
  return parseApiInfo(saved.apis);
}

export async function cacheNasApis(baseUrl: string, apis: ApiInfo): Promise<void> {
  const selected = Object.fromEntries(Object.entries(apis).filter(([name]) => name === 'SYNO.API.Auth' ||
    name.startsWith('SYNO.AudioStation.') || name.startsWith('SYNO.FileStation.')));
  await writePreference(key(baseUrl), JSON.stringify({ version: 1, savedAt: Date.now(), apis: parseApiInfo(selected) }));
}
