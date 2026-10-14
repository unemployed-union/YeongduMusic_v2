import { Platform } from 'react-native';
import { CloudRequestError, cloudRequest } from '@/services/cloud-music/request';
import { musicBrainzRequest } from '@/services/metadata/web-search';

export type ArtistPhoto = { uri: string; sourceUrl: string; credit: string; license: string; provider?: string };
type Json = Record<string, unknown>;
const object = (value: unknown): Json => value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown) => typeof value === 'string' && value.length <= 6000 ? value.trim() : '';
const nameKey = (value: string) => {
  const normalized = value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(normalized) ? normalized.replace(/\s/g, '') : normalized;
};
export function artistSearchNames(name: string): string[] {
  const value = name.normalize('NFKC').trim(), match = value.match(/^(.+?)\s*\(([^()]+)\)\s*$/);
  return [...new Set([value, ...(match ? [match[1].trim(), match[2].trim()] : [])].filter(Boolean))];
}
const escapeQuery = (value: string) => value.replace(/([+\-&|!(){}\[\]^"~*?:\\/])/g, '\\$1');
export function searchableArtist(name: string) {
  return !!name.trim() && name.length <= 300 && !['알 수 없는 아티스트', 'unknown artist', 'various artists', '[unknown]', '[no artist]'].some(value => nameKey(value) === nameKey(name));
}
export function artistSearchUrl(name: string) {
  if (!searchableArtist(name)) throw new CloudRequestError('검색할 아티스트 이름을 확인해 주세요.');
  const query = artistSearchNames(name).map(value => `artist:"${escapeQuery(value)}" OR alias:"${escapeQuery(value)}"`).join(' OR ');
  return `https://musicbrainz.org/ws/2/artist?fmt=json&limit=20&query=${encodeURIComponent(query)}`;
}
/** Never pick the highest scoring namesake when multiple exact names/aliases match. */
export function matchingArtistId(value: unknown, name: string): string | null {
  const raw = object(value);
  if (!Array.isArray(raw.artists)) throw new CloudRequestError('아티스트 검색 결과를 확인할 수 없습니다.');
  if (Number(raw.count) > 20) return null;
  const matches = new Set<string>();
  const keys = new Set(artistSearchNames(name).map(nameKey));
  for (const item of raw.artists) {
    const artist = object(item), id = text(artist.id);
    const names = [text(artist.name), ...array(artist.aliases).map(alias => text(object(alias).name))];
    if (/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id) && Number(artist.score) >= 90
      && names.some(candidate => keys.has(nameKey(candidate)))) matches.add(id);
  }
  return matches.size === 1 ? [...matches][0] : null;
}
export function artistWikidataId(value: unknown, artistId: string): string | null {
  const artist = object(value);
  if (artist.id !== artistId || !Array.isArray(artist.relations)) throw new CloudRequestError('아티스트 연결 정보를 확인할 수 없습니다.');
  const ids = new Set<string>();
  for (const raw of artist.relations) {
    const relation = object(raw);
    if (relation.type !== 'wikidata') continue;
    try {
      const url = new URL(text(object(relation.url).resource));
      if (!['https:', 'http:'].includes(url.protocol) || !['www.wikidata.org', 'wikidata.org'].includes(url.hostname) || url.port || url.username || url.password) continue;
      const id = url.pathname.match(/^\/wiki\/(Q[1-9]\d*)$/)?.[1];
      if (id) ids.add(id);
    } catch { /* Ignore invalid external relationships. */ }
  }
  return ids.size === 1 ? [...ids][0] : null;
}
/** Use curated artist-image relationships when no Commons photo is registered. */
export function linkedArtistPhoto(value: unknown, artistId: string): ArtistPhoto | null {
  const artist = object(value);
  if (artist.id !== artistId) return null;
  for (const raw of array(artist.relations)) {
    const relation = object(raw);
    if (relation.type !== 'image') continue;
    let resource = text(object(relation.url).resource);
    try {
      const archived = new URL(resource);
      if (archived.hostname === 'web.archive.org' && archived.protocol === 'https:' && !archived.username && !archived.password && !archived.port) {
        resource = archived.pathname.match(/^\/web\/\d+(?:[a-z_]+)?\/(https:\/\/.+)$/)?.[1] ?? '';
      }
    } catch { continue; }
    const uri = safeUrl(resource, ['i.scdn.co', 'cdn-images.dzcdn.net', 'e-cdns-images.dzcdn.net', 'upload.wikimedia.org', 'thumb.wikimedia.org'], '/');
    if (uri) return { uri, sourceUrl: `https://musicbrainz.org/artist/${artistId}`, credit: 'MusicBrainz에 연결된 아티스트 이미지', license: '출처의 이용 조건 적용', provider: 'MusicBrainz' };
  }
  return null;
}
export function linkedCommonsFile(value: unknown, artistId: string): string | null {
  const artist = object(value);
  if (artist.id !== artistId) return null;
  for (const raw of array(artist.relations)) {
    const relation = object(raw);
    if (relation.type !== 'image') continue;
    const resource = safeUrl(object(relation.url).resource, ['commons.wikimedia.org'], '/wiki/File:');
    if (!resource) continue;
    try {
      const file = decodeURIComponent(new URL(resource).pathname.slice('/wiki/File:'.length)).replace(/_/g, ' ');
      if (file && file.length <= 500 && !/[|\r\n\u0000]/.test(file)) return file;
    } catch { /* Ignore malformed file names. */ }
  }
  return null;
}
export function artistImageFile(value: unknown, entityId: string): string | null {
  const raw = object(value);
  if (raw.error || !raw.entities) throw new CloudRequestError('아티스트 사진 정보를 확인할 수 없습니다.');
  const claims = array(object(object(object(raw.entities)[entityId]).claims).P18).map(object)
    .filter(claim => claim.rank !== 'deprecated' && object(claim.mainsnak).snaktype === 'value');
  const ranked = claims.some(claim => claim.rank === 'preferred') ? claims.filter(claim => claim.rank === 'preferred') : claims;
  for (const claim of ranked) {
    const snak = object(claim.mainsnak), file = text(object(snak.datavalue).value);
    if (snak.datatype === 'commonsMedia' && file && file.length <= 500 && !/[|\r\n\u0000]/.test(file)) return file;
  }
  return null;
}
function plainCredit(value: unknown) {
  return text(object(value).value).replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot|apos|nbsp);/g,
    (_, entity: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[entity] ?? '')
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, entity: string) => {
      const code = entity.startsWith('x') ? parseInt(entity.slice(1), 16) : Number(entity);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    }).trim();
}
function safeUrl(value: unknown, hosts: string[], prefix: string): string | null {
  try {
    const url = new URL(text(value));
    return url.protocol === 'https:' && hosts.includes(url.hostname) && !url.username && !url.password && !url.port && url.pathname.startsWith(prefix) ? url.href : null;
  } catch { return null; }
}
export function parseArtistPhoto(value: unknown): ArtistPhoto | null {
  const raw = object(value);
  if (raw.error || !object(raw.query).pages) throw new CloudRequestError('사진 출처 정보를 확인할 수 없습니다.');
  const pages = object(object(raw.query).pages);
  for (const page of Object.values(pages)) {
    const info = object(array(object(page).imageinfo)[0]), metadata = object(info.extmetadata);
    const uri = safeUrl(info.thumburl, ['upload.wikimedia.org', 'thumb.wikimedia.org'], '/');
    const sourceUrl = safeUrl(info.descriptionurl, ['commons.wikimedia.org'], '/wiki/File:');
    const credit = plainCredit(metadata.Artist), license = plainCredit(metadata.LicenseShortName);
    if (uri && sourceUrl && credit && license && ['image/jpeg', 'image/png', 'image/webp'].includes(text(info.thumbmime || info.mime))) return { uri, sourceUrl, credit, license };
  }
  return null;
}
let blockedUntil = 0;
async function wikimediaRequest(url: string, signal: AbortSignal) {
  if (Date.now() < blockedUntil) throw new CloudRequestError('사진 서버가 혼잡합니다. 잠시 후 다시 시도해 주세요.');
  return cloudRequest('아티스트 사진', async requestSignal => {
    const response = await fetch(url, { signal: requestSignal, headers: { Accept: 'application/json',
      [Platform.OS === 'web' ? 'Api-User-Agent' : 'User-Agent']: 'YeongduMusic/1.0 (https://github.com/unemployed-union/YeongduMusic_v2)' } });
    if (!response.ok) {
      if (response.status === 429 || response.status === 503) {
        const seconds = Number(response.headers.get('Retry-After'));
        blockedUntil = Date.now() + Math.max(60000, Number.isFinite(seconds) ? Math.min(seconds * 1000, 3600000) : 0);
      }
      throw new CloudRequestError('아티스트 사진을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.', response.status);
    }
    return response.json();
  }, signal);
}
// Public names and photo metadata only; bounded, in-memory cache. Errors are retryable.
const cache = new Map<string, { photo: ArtistPhoto | null; expires: number }>();
export async function findArtistPhoto(name: string, signal: AbortSignal, refresh = false): Promise<ArtistPhoto | null> {
  if (!searchableArtist(name)) return null;
  if (signal.aborted) throw new CloudRequestError('아티스트 사진 요청이 취소되었습니다.');
  const key = nameKey(name), cached = cache.get(key);
  if (!refresh && cached && cached.expires > Date.now()) return cached.photo;
  const photo = await cloudRequest('아티스트 사진', async requestSignal => {
    const artistId = await musicBrainzRequest(artistSearchUrl(name), value => matchingArtistId(value, name), requestSignal);
    if (!artistId) return null;
    const artist = await musicBrainzRequest(`https://musicbrainz.org/ws/2/artist/${artistId}?fmt=json&inc=url-rels`, value => value, requestSignal);
    const linked = linkedArtistPhoto(artist, artistId), entityId = artistWikidataId(artist, artistId), commonsFile = linkedCommonsFile(artist, artistId);
    if (!entityId && !commonsFile) return linked;
    try {
      const entity = entityId ? await wikimediaRequest(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${entityId}&props=claims&format=json&origin=*&maxlag=5`, requestSignal) : null;
      const file = entityId ? artistImageFile(entity, entityId) ?? commonsFile : commonsFile;
      if (!file) return linked;
      const image = await wikimediaRequest(`https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&titles=${encodeURIComponent('File:' + file)}&iiprop=url%7Cextmetadata%7Cmime&iiurlwidth=512&iiextmetadatafilter=Artist%7CLicenseShortName&format=json&origin=*&maxlag=5`, requestSignal);
      return parseArtistPhoto(image) ?? linked;
    } catch (error) { if (linked && !requestSignal.aborted) return linked; throw error; }
  }, signal, undefined, 45000);
  if (cache.size >= 80) cache.delete(cache.keys().next().value!);
  cache.set(key, { photo, expires: Date.now() + (photo ? 24 : 2) * 60 * 60 * 1000 });
  return photo;
}
