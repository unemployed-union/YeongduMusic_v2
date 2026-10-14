import { CloudRequestError, cloudRequest } from '@/services/cloud-music/request';
import { parseMetadata } from '@/features/metadata/rules';
import { missingMetadataText, type MetadataCandidate } from '@/features/metadata/web-rules';

type Json = Record<string, unknown>;
const object = (value: unknown): Json => value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown) => typeof value === 'string' && value.length <= 300 ? value.trim() : '';
const number = (value: unknown): number | undefined => (typeof value === 'string' && /^\d{1,4}$/.test(value) || typeof value === 'number')
  && Number.isInteger(Number(value)) && Number(value) > 0 && Number(value) <= 9999 ? Number(value) : undefined;
const mbid = (value: unknown): string => typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value) ? value : '';
function artistCredit(value: unknown): string {
  return array(value).map(item => typeof item === 'string' ? item : text(object(item).name) || text(object(object(item).artist).name))
    .map((name, index) => { const phrase = object(array(value)[index]).joinphrase;
      return name + (typeof phrase === 'string' && phrase.length <= 100 ? phrase : ''); }).join('').trim();
}
export function parseWebMetadata(value: unknown): MetadataCandidate[] {
  if (!Array.isArray(object(value).recordings)) throw new CloudRequestError('웹 곡 정보의 형식이 올바르지 않습니다.');
  const candidates: MetadataCandidate[] = [];
  for (const raw of array(object(value).recordings).slice(0, 20)) {
    const recording = object(raw), recordingId = mbid(recording.id), title = text(recording.title), artist = artistCredit(recording['artist-credit']);
    if (!recordingId || !title || !artist || artist.length > 300 || recording.video === true) continue;
    const duration = typeof recording.length === 'number' && Number.isFinite(recording.length) && recording.length > 0 ? recording.length / 1000 : undefined;
    const score = Number(recording.score) || 0;
    const releases = array(recording.releases).slice(0, 30);
    for (const [index, rawRelease] of (releases.length ? releases : [{}]).entries()) {
      const release = object(rawRelease), album = text(release.title), albumArtist = artistCredit(release['artist-credit']);
      if (albumArtist.length > 300) continue;
      const year = number(text(release.date).match(/^\d{4}/)?.[0]);
      const media = array(release.media).map(object);
      // A search response can contain only the matched track(s), not the full release.
      const tracks = media.flatMap(medium => array(medium.tracks ?? medium.track).map(track => ({ medium, track: object(track) })))
        .filter(({ track }) => !object(track.recording).id || object(track.recording).id === recordingId);
      const trackNumber = tracks.length === 1 ? number(tracks[0].track.number ?? tracks[0].track.position) : undefined;
      const discNumber = tracks.length === 1 ? number(tracks[0].medium.position) : undefined;
      const fields = parseMetadata({ title, artist, album, albumArtist: albumArtist || undefined, year, trackNumber, discNumber });
      candidates.push({ id: `${recordingId}:${mbid(release.id) || index}:${trackNumber ?? ''}`, recordingId, fields, duration, score });
    }
  }
  const unique = new Map<string, MetadataCandidate>();
  for (const candidate of candidates) {
    const key = JSON.stringify([candidate.recordingId, candidate.fields]);
    if (!unique.has(key)) unique.set(key, candidate);
  }
  return [...unique.values()].sort((a, b) => b.score - a.score);
}
const escapeQuery = (value: string) => value.replace(/([+\-&|!(){}\[\]^"~*?:\\/])/g, '\\$1');
export function metadataSearchUrl(title: string, artist: string): string {
  if (!title.trim() || title.length > 300 || artist.length > 300) throw new CloudRequestError('검색할 제목과 아티스트는 300자 이내로 입력해 주세요.');
  const query = `recording:"${escapeQuery(title.trim())}"${missingMetadataText(artist) ? '' : ` AND artist:"${escapeQuery(artist.trim())}"`}`;
  return `https://musicbrainz.org/ws/2/recording?fmt=json&limit=20&query=${encodeURIComponent(query)}`;
}
let tail: Promise<unknown> = Promise.resolve(), lastRequest = 0, blockedUntil = 0;
function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(new CloudRequestError('웹 곡 정보 요청이 취소되었습니다.')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, Math.max(0, ms));
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}
/** Manual and automatic requests share the MusicBrainz one-request-per-second queue. */
export function musicBrainzRequest<T>(url: string, parse: (value: unknown) => T, signal?: AbortSignal): Promise<T> {
  if (!url.startsWith('https://musicbrainz.org/ws/2/')) throw new CloudRequestError('음악 검색 주소를 확인할 수 없습니다.');
  const operation = tail.then(async () => {
    if (Date.now() < blockedUntil) throw new CloudRequestError('웹 곡 정보 서버가 혼잡합니다. 잠시 후 다시 시도해 주세요.');
    await wait(lastRequest + 1100 - Date.now(), signal);
    if (signal?.aborted) throw new CloudRequestError('웹 곡 정보 요청이 취소되었습니다.');
    lastRequest = Date.now();
    return cloudRequest('웹 곡 정보', async requestSignal => {
      const response = await fetch(url, { signal: requestSignal, headers: { Accept: 'application/json',
        'User-Agent': 'YeongduMusic/1.0 (https://github.com/unemployed-union/YeongduMusic_v2)' } });
      if (!response.ok) {
        if (response.status === 429 || response.status === 503) {
          const retry = Number(response.headers.get('Retry-After'));
          blockedUntil = Date.now() + Math.max(60000, Number.isFinite(retry) ? Math.min(retry * 1000, 3600000) : 0);
        }
        throw new CloudRequestError('웹 곡 정보를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.', response.status);
      }
      return parse(await response.json());
    }, signal);
  });
  tail = operation.catch(() => {});
  return operation;
}
export function searchWebMetadata(title: string, artist: string, signal?: AbortSignal): Promise<MetadataCandidate[]> {
  return musicBrainzRequest(metadataSearchUrl(title, artist), parseWebMetadata, signal);
}
