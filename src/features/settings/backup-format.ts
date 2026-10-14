import { parseProfile } from '@/features/hidden-music/rules';
import { parsePlaylists } from '@/features/playlists/rules';
import { localFolderKey } from '@/services/local-music/folders';
import type { HiddenMusicProfile } from '@/types/hidden-music';
import type { PlaylistProfile } from '@/types/playlists';
import type { StreamingQuality } from '@/types/music';
import type { QuickHideMode } from '@/stores/hidden-feature-access';
import { parseMenuLayout, type MenuLayout } from './menu-layout';
import { parseThemeMode, type ThemeMode } from '@/theme/mode';
import { parseDetailPreferences, type LibraryDetailPreferences } from '@/features/library/detail-preferences';
import { parseHapticPreferences, type HapticPreferences } from '@/features/haptics/preferences';

export const MAX_BACKUP_BYTES = 2 * 1024 * 1024;
export type SettingsBackup = {
  format: 'yeongdu-music-settings'; version: 1; exportedAt: string;
  preferences: { hideArtwork: boolean; includeFolderAlbums: boolean; quality: StreamingQuality; excludedFolders: string[]; menus?: MenuLayout; themeMode?: ThemeMode; libraryDetails?: LibraryDetailPreferences; haptics?: HapticPreferences };
  account?: { scope: string; hidden: HiddenMusicProfile; playlists: PlaylistProfile; access: { enabled: boolean; quickHideMode: QuickHideMode } };
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('설정 백업 파일 형식이 올바르지 않습니다.');
  return value as Record<string, unknown>;
}
function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('백업의 설정 값이 올바르지 않습니다.');
  return value;
}
export function checkBackupSize(text: string) {
  let bytes = 0;
  for (const char of text) { const code = char.codePointAt(0)!; bytes += code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4; if (bytes > MAX_BACKUP_BYTES) throw new Error('백업 파일은 2MB 이하만 사용할 수 있습니다.'); }
}
/** Rebuild the supported fields; never import credentials or arbitrary storage keys. */
export function parseSettingsBackup(text: string): SettingsBackup {
  checkBackupSize(text);
  let raw: unknown;
  try { raw = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { throw new Error('백업 파일을 읽을 수 없습니다. JSON 설정 백업을 선택해 주세요.'); }
  const value = object(raw);
  if (value.format !== 'yeongdu-music-settings') throw new Error('이 앱에서 만든 설정 백업 파일을 선택해 주세요.');
  if (value.version !== 1) throw new Error('지원하지 않는 백업 버전입니다. 앱을 업데이트한 후 다시 시도해 주세요.');
  if (typeof value.exportedAt !== 'string' || !Number.isFinite(Date.parse(value.exportedAt))) throw new Error('백업 날짜가 올바르지 않습니다.');
  const preferences = object(value.preferences);
  if (preferences.quality !== 'original' && preferences.quality !== 'mp3') throw new Error('백업의 음질 설정이 올바르지 않습니다.');
  const folders = preferences.excludedFolders;
  if (!Array.isArray(folders) || folders.length > 200 || folders.some(folder => typeof folder !== 'string' || !folder.trim() || folder.length > 4096)) throw new Error('백업의 제외 폴더 설정이 올바르지 않습니다.');
  const result: SettingsBackup = {
    format: 'yeongdu-music-settings', version: 1, exportedAt: value.exportedAt,
    preferences: { hideArtwork: bool(preferences.hideArtwork), includeFolderAlbums: bool(preferences.includeFolderAlbums), quality: preferences.quality, excludedFolders: [...new Set((folders as string[]).map(localFolderKey))] },
  };
  if (preferences.menus !== undefined) result.preferences.menus = parseMenuLayout(preferences.menus);
  if (preferences.themeMode !== undefined) result.preferences.themeMode = parseThemeMode(preferences.themeMode);
  if (preferences.libraryDetails !== undefined) result.preferences.libraryDetails = parseDetailPreferences(preferences.libraryDetails);
  if (preferences.haptics !== undefined) result.preferences.haptics = parseHapticPreferences(preferences.haptics);
  if (value.account !== undefined) {
    const account = object(value.account), access = object(account.access);
    if (typeof account.scope !== 'string' || !account.scope || account.scope.length > 4096) throw new Error('백업의 계정 정보를 확인할 수 없습니다.');
    if (access.quickHideMode !== 'off' && access.quickHideMode !== 'all' && access.quickHideMode !== 'preset') throw new Error('백업의 빠른 숨기기 설정이 올바르지 않습니다.');
    result.account = { scope: account.scope, hidden: parseProfile(JSON.stringify(account.hidden)), playlists: parsePlaylists(JSON.stringify(account.playlists)), access: { enabled: bool(access.enabled), quickHideMode: access.quickHideMode } };
  }
  return result;
}

export function serializeSettingsBackup(backup: SettingsBackup): string {
  const clean = parseSettingsBackup(JSON.stringify(backup));
  const text = JSON.stringify(clean, null, 2);
  checkBackupSize(text);
  return text;
}
