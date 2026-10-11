import type { PlaylistProfile, PlaylistPreset } from '@/types/playlists';
import type { Song } from '@/types/music';

export const emptyPlaylists = (): PlaylistProfile => ({ version: 1, presets: [] });
export function playlistName(name: string): string {
  const clean = name.trim();
  if (!clean || clean.length > 60) throw new Error('플레이리스트 이름을 1~60자로 입력해 주세요.');
  return clean;
}
export function parsePlaylists(json: string): PlaylistProfile {
  const fail = () => new Error('저장된 플레이리스트를 읽을 수 없습니다. 다시 시도해 주세요.');
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw fail(); }
  if (!value || typeof value !== 'object') throw fail();
  const profile = value as Partial<PlaylistProfile>;
  if (profile.version !== 1 || !Array.isArray(profile.presets)) throw fail();
  const ids = new Set<string>();
  const presets = profile.presets.map((value: unknown) => {
    if (!value || typeof value !== 'object') throw fail();
    const item = value as Partial<PlaylistPreset>;
    if (typeof item.id !== 'string' || !item.id || ids.has(item.id) || typeof item.name !== 'string' || !Array.isArray(item.songIds) || !item.songIds.every((id) => typeof id === 'string' && !!id)) throw fail();
    ids.add(item.id);
    return { id: item.id, name: playlistName(item.name), songIds: [...new Set(item.songIds)] };
  });
  return { version: 1, presets };
}
// Resolve fresh metadata/URLs from the already filtered library; preserve saved order.
export function playlistSongs(preset: PlaylistPreset, library: readonly Song[]): Song[] {
  const byId = new Map(library.map((song) => [song.id, song]));
  return preset.songIds.flatMap((id) => { const song = byId.get(id); return song ? [song] : []; });
}
