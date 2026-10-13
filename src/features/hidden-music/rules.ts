import { isNasSong } from '@/services/music-source';
import type { Session } from '@/services/synology/api';
import type { HiddenMusicProfile, HiddenPreset } from '@/types/hidden-music';
import type { Page, Song } from '@/types/music';

export function privacyScope(mode: string, session: Pick<Session, 'baseUrl' | 'account'> | null): string | null {
  if (mode === 'mock') return 'demo';
  if (mode !== 'nas' || !session?.account) return null;
  return JSON.stringify([session.baseUrl, session.account]);
}

export function normalizeFolder(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/\/+$/, '');
}

export function hiddenMatcher(presets: readonly HiddenPreset[]): (song: Song) => boolean {
  const active = presets.filter((preset) => preset.enabled);
  const ids = new Set(active.flatMap((preset) => preset.songIds));
  const folders = [...new Set(active.flatMap((preset) => preset.folders).map(normalizeFolder))];
  return (song) => isNasSong(song) && (ids.has(song.id) || !!song.path && folders.some((folder) => normalizeFolder(song.path!).startsWith(folder + '/')));
}

export function visibleSongs(library: Page<Song>, presets: readonly HiddenPreset[]): Page<Song> {
  const hidden = hiddenMatcher(presets);
  const items = library.items.filter((song) => !hidden(song));
  return { items, total: items.length, stale: library.stale };
}

export function foldersForSongs(songs: readonly Song[]): { path: string; count: number }[] {
  const folders = new Map<string, number>();
  for (const song of songs) {
    if (!song.path) continue;
    const path = normalizeFolder(song.path);
    for (let slash = path.indexOf('/', 1); slash !== -1; slash = path.indexOf('/', slash + 1)) {
      const folder = path.slice(0, slash);
      if (folder) folders.set(folder, (folders.get(folder) ?? 0) + 1);
    }
  }
  return [...folders].map(([path, count]) => ({ path, count })).sort((a, b) => a.path.localeCompare(b.path));
}

export function emptyProfile(): HiddenMusicProfile {
  return { version: 1, biometricLock: false, presets: [], hiddenPlaylistIds: [] };
}

// A damaged or incompatible profile must not silently reveal previously hidden songs.
export function parseProfile(json: string): HiddenMusicProfile {
  let value: unknown;
  try { value = JSON.parse(json); }
  catch { throw new Error('저장된 숨김 설정을 읽을 수 없습니다. 다시 시도해 주세요.'); }
  if (!value || typeof value !== 'object') throw new Error('숨김 설정 형식이 올바르지 않습니다.');
  const profile = value as Partial<HiddenMusicProfile>;
  if (profile.version !== 1 || typeof profile.biometricLock !== 'boolean' || !Array.isArray(profile.presets)) throw new Error('숨김 설정 버전을 확인할 수 없습니다.');
  const ids = new Set<string>();
  const presets = profile.presets.map((preset: unknown) => {
    if (!preset || typeof preset !== 'object') throw new Error('숨김 프리셋을 읽을 수 없습니다.');
    const item = preset as Partial<HiddenPreset>;
    const strings = (values: unknown): values is string[] => Array.isArray(values) && values.every((text) => typeof text === 'string' && text.length > 0);
    if (typeof item.id !== 'string' || !item.id || ids.has(item.id) || typeof item.name !== 'string' || !item.name.trim() || typeof item.enabled !== 'boolean' || !strings(item.songIds) || !strings(item.folders)) throw new Error('숨김 프리셋 형식이 올바르지 않습니다.');
    ids.add(item.id);
    return { id: item.id, name: item.name, enabled: item.enabled, songIds: [...new Set(item.songIds)], folders: [...new Set(item.folders)] };
  });
  const hiddenPlaylistIds = profile.hiddenPlaylistIds === undefined ? [] : profile.hiddenPlaylistIds;
  if (!Array.isArray(hiddenPlaylistIds) || !hiddenPlaylistIds.every((id) => typeof id === 'string' && !!id)) throw new Error('숨긴 플레이리스트 설정을 읽을 수 없습니다.');
  if (profile.quickHidePresetId !== undefined && (typeof profile.quickHidePresetId !== 'string' || !profile.quickHidePresetId)) throw new Error('빠른 숨기기 프리셋 설정을 읽을 수 없습니다.');
  return { version: 1, biometricLock: profile.biometricLock, presets, hiddenPlaylistIds: [...new Set(hiddenPlaylistIds)],
    ...(profile.quickHidePresetId && ids.has(profile.quickHidePresetId) ? { quickHidePresetId: profile.quickHidePresetId } : {}) };
}
