import { metadataKey, validateMetadataKey } from '@/features/metadata/rules';
import { albumId, hasAlbumTag, songsForAlbum } from '@/features/library/album-library';
import type { Page, Song } from '@/types/music';

export type ArtworkPatches = Record<string, string>;
export function validateArtwork(value: string): void {
  if (/^art-[a-f0-9]{32}\.(jpg|png|webp)$/.test(value)) return;
  if (value.length <= 2800000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return;
  throw new Error('앨범아트 저장 정보를 확인할 수 없습니다.');
}
export function artworkUri(value: string, baseUri: string): string {
  validateArtwork(value);
  return value.startsWith('data:') ? value : baseUri + value;
}
export function parseArtworkStorage(raw: string | null): ArtworkPatches {
  if (raw === null) return {};
  const value = JSON.parse(raw);
  if (value?.version !== 1 || !value.patches || typeof value.patches !== 'object' || Array.isArray(value.patches)) throw new Error('앨범아트 설정을 읽을 수 없습니다.');
  const entries = Object.entries(value.patches);
  if (entries.length > 10000) throw new Error('앨범아트 저장 한도를 초과했습니다.');
  for (const [key, image] of entries) { validateMetadataKey(key); if (typeof image !== 'string') throw new Error('앨범아트 설정을 읽을 수 없습니다.'); validateArtwork(image); }
  return Object.fromEntries(entries) as ArtworkPatches;
}
export function applySongArtwork(song: Song, value: string | undefined, baseUri: string): Song {
  if (!value && !song.artworkOriginal) return song;
  const original = song.artworkOriginal ?? { artworkUrl: song.artworkUrl, palette: song.palette };
  const uri = value ? artworkUri(value, baseUri) : original.artworkUrl;
  const palette = value ? undefined : original.palette;
  if (song.artworkUrl === uri && song.palette === palette && !!song.artworkOriginal === !!value) return song;
  return { ...song, artworkUrl: uri, palette, artworkOriginal: value ? original : undefined };
}
export function applyArtworkLibrary(page: Page<Song>, patches: ArtworkPatches, scope: string | null, baseUri: string): Page<Song> {
  let changed = false;
  const items = page.items.map(song => { const key = metadataKey(song, scope); const next = applySongArtwork(song, key ? patches[key] : undefined, baseUri); changed ||= next !== song; return next; });
  return changed ? { ...page, items } : page;
}
/** Only the current visible library participates; unrelated unknown/folder albums are never bulk edited. */
export function artworkTargets(song: Song, visible: readonly Song[], scope: string | null, entireAlbum: boolean): string[] {
  const same = entireAlbum && hasAlbumTag(song) ? visible.filter(item => hasAlbumTag(item) && albumId(item) === albumId(song)) : [];
  return [...new Set([song, ...same].map(item => metadataKey(item, scope)).filter((key): key is string => !!key))];
}
/** An explicit album-screen selection may include folder albums, but never another album. */
export function albumArtworkTargets(song: Song, visible: readonly Song[], scope: string | null, groupId = albumId(song)): string[] {
  const targets = songsForAlbum({ items: [...visible], total: visible.length }, { id: groupId }).items;
  return [...new Set(targets.map(item => metadataKey(item, scope)).filter((key): key is string => !!key))];
}
