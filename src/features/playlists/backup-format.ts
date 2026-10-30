import { checkBackupSize } from '@/features/settings/backup-format';
import { parsePlaylists } from './rules';
import type { PlaylistProfile, PlaylistPreset } from '@/types/playlists';

export type PlaylistBackup = {
  format: 'yeongdu-music-playlists';
  version: 1;
  exportedAt: string;
  scope: string;
  playlists: PlaylistProfile;
  hiddenPlaylistIds: string[];
};

export function parsePlaylistBackup(text: string): PlaylistBackup {
  checkBackupSize(text);
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('백업 파일을 읽을 수 없습니다. JSON 플레이리스트 백업을 선택해 주세요.');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('플레이리스트 백업 파일 형식이 올바르지 않습니다.');
  }
  const value = raw as Record<string, unknown>;
  if (value.format !== 'yeongdu-music-playlists') {
    throw new Error('이 앱에서 만든 플레이리스트 백업 파일을 선택해 주세요.');
  }
  if (value.version !== 1) {
    throw new Error('지원하지 않는 백업 버전입니다. 앱을 업데이트한 후 다시 시도해 주세요.');
  }
  if (typeof value.exportedAt !== 'string' || !Number.isFinite(Date.parse(value.exportedAt))) {
    throw new Error('백업 날짜가 올바르지 않습니다.');
  }
  if (typeof value.scope !== 'string' || !value.scope || value.scope.length > 4096) {
    throw new Error('백업의 계정 정보를 확인할 수 없습니다.');
  }
  const playlists = parsePlaylists(JSON.stringify(value.playlists));
  const ids = new Set(playlists.presets.map((preset) => preset.id));
  if (
    !Array.isArray(value.hiddenPlaylistIds) ||
    value.hiddenPlaylistIds.some((id) => typeof id !== 'string' || !ids.has(id))
  ) {
    throw new Error('백업의 플레이리스트 숨김 정보가 올바르지 않습니다.');
  }
  return {
    format: 'yeongdu-music-playlists',
    version: 1,
    exportedAt: value.exportedAt,
    scope: value.scope,
    playlists,
    hiddenPlaylistIds: [...new Set(value.hiddenPlaylistIds as string[])],
  };
}

export function serializePlaylistBackup(backup: PlaylistBackup): string {
  const text = JSON.stringify(backup, null, 2);
  checkBackupSize(text);
  return text;
}

/** Keep current order and unrelated lists; restore saved order inside each list. */
export function mergePlaylistBackup(
  current: PlaylistProfile,
  incoming: PlaylistProfile,
): PlaylistProfile {
  const importedIds = new Set(incoming.presets.map((preset) => preset.id));
  const names = new Set(
    current.presets.filter((preset) => !importedIds.has(preset.id)).map((preset) => preset.name),
  );
  const imported = new Map<string, PlaylistPreset>();
  for (const preset of incoming.presets) {
    let name = preset.name;
    let number = 2;
    while (names.has(name)) {
      const suffix = ` (복구 ${number++})`;
      name = preset.name.slice(0, 60 - suffix.length) + suffix;
    }
    names.add(name);
    imported.set(preset.id, { ...preset, name, songIds: [...preset.songIds] });
  }
  const existingIds = new Set(current.presets.map((preset) => preset.id));
  return {
    version: 1,
    presets: [
      ...current.presets.map((preset) => imported.get(preset.id) ?? preset),
      ...incoming.presets
        .filter((preset) => !existingIds.has(preset.id))
        .map((preset) => imported.get(preset.id)!),
    ],
  };
}
