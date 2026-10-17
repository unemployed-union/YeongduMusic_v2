import { isNasSong } from '@/services/music-source';
import type { Album, Artist, Page, PageRequest, Song, StreamingQuality } from '@/types/music';

// Explicit combined library scope; the NAS applies signed-in account access.
export const AUDIO_STATION_LIBRARY = 'all' as const;

export type ApiInfo = Record<string, { path: string; minVersion: number; maxVersion: number; requestFormat?: string }>;
type ApiEnvelope = { success?: boolean; data?: unknown; error?: { code?: number } };
export type Session = { baseUrl: string; account?: string; sid: string; token?: string; apis: ApiInfo };

export class SynologyError extends Error {
  constructor(message: string, readonly code?: number) { super(message); this.name = 'SynologyError'; }
}
export class SessionExpiredError extends SynologyError {
  constructor(code?: number) { super('NAS 세션이 만료되었습니다. 다시 로그인해 주세요.', code); this.name = 'SessionExpiredError'; }
}

export type RequestErrorKind = 'cancelled' | 'timeout' | 'network' | 'http' | 'json' | 'response';
export class SynologyRequestError extends SynologyError {
  constructor(readonly kind: RequestErrorKind, message: string, readonly httpStatus?: number) {
    super(message);
    this.name = kind === 'cancelled' ? 'AbortError' : 'SynologyRequestError';
  }
}
export function throwIfRequestCancelled(signal?: AbortSignal | null): void {
  if (signal?.aborted) throw new SynologyRequestError('cancelled', 'NAS 요청이 취소되었습니다.');
}

const required = ['SYNO.API.Auth', 'SYNO.AudioStation.Song', 'SYNO.AudioStation.Album', 'SYNO.AudioStation.Artist', 'SYNO.AudioStation.Stream', 'SYNO.AudioStation.Cover'];
const preferred: Record<string, number> = {
  'SYNO.API.Auth': 6,
  'SYNO.AudioStation.Song': 3,
  'SYNO.AudioStation.Album': 3,
  'SYNO.AudioStation.Artist': 4,
  'SYNO.AudioStation.Stream': 2,
  'SYNO.AudioStation.Cover': 3,
  'SYNO.AudioStation.Lyrics': 2,
};

export function normalizeAddress(input: string, allowHttp = false): string {
  const trimmed = input.trim().replace(/\/+$/, '');
  let url: URL;
  try { url = new URL(trimmed); } catch { throw new SynologyError('NAS 주소를 https://호스트:포트 형식으로 입력해 주세요.'); }
  if ((url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw new SynologyError('HTTPS 주소가 필요합니다. HTTP를 사용하려면 연결 화면에서 직접 허용해 주세요.');
  }
  return trimmed;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SynologyRequestError('response', 'NAS 응답 형식을 확인할 수 없습니다.');
  return value as Record<string, unknown>;
}
function string(value: unknown, fallback = ''): string { return typeof value === 'string' ? value : fallback; }
function number(value: unknown, fallback = 0): number { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function parseEnvelope(value: unknown): unknown {
  const envelope = object(value) as ApiEnvelope;
  if (typeof envelope.success !== 'boolean') throw new SynologyRequestError('response', 'NAS 응답에 올바른 success 값이 없습니다.');
  if (envelope.success !== true) {
    const code = envelope.error?.code;
    if (typeof code !== 'number' || !Number.isInteger(code)) throw new SynologyRequestError('response', 'NAS 실패 응답에 올바른 오류 코드가 없습니다.');
    if (code === 106 || code === 107 || code === 119) throw new SessionExpiredError(code);
    if (code === 105) throw new SynologyError('이 계정에 Audio Station 접근 권한이 없습니다.', code);
    throw new SynologyError(code ? `NAS 요청 실패 (오류 코드 ${code}).` : 'NAS 요청이 실패했습니다.', code);
  }
  return envelope.data;
}
function apiPath(path: string): string {
  if (!path || path.startsWith('/') || path.includes('..') || path.includes('?') || !/^[\w./-]+$/.test(path)) {
    throw new SynologyError('NAS가 유효하지 않은 API 경로를 반환했습니다.');
  }
  return path;
}
function version(info: ApiInfo[string], api: string): number {
  const chosen = Math.min(preferred[api] ?? info.maxVersion, info.maxVersion);
  if (chosen < info.minVersion) throw new SynologyError(`${api}의 지원 버전이 이 앱과 호환되지 않습니다.`);
  return chosen;
}
async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  throwIfRequestCancelled(init?.signal);
  const controller = new AbortController();
  const deadline = Date.now() + 15000;
  let stopped: SynologyRequestError | null = null;
  let rejectStopped!: (error: SynologyRequestError) => void;
  const interruption = new Promise<never>((_, reject) => { rejectStopped = reject; });
  function stop(kind: 'cancelled' | 'timeout'): void {
    if (stopped) return;
    stopped = new SynologyRequestError(kind, kind === 'timeout' ? 'NAS 요청 시간이 초과되었습니다 (15초). 다시 시도해 주세요.' : 'NAS 요청이 취소되었습니다.');
    rejectStopped(stopped);
    controller.abort();
  }
  const onAbort = () => stop('cancelled');
  const timer = setTimeout(() => stop('timeout'), 15000);
  init?.signal?.addEventListener('abort', onAbort);
  function checkInterrupted(): void {
    if (!stopped && init?.signal?.aborted) stop('cancelled');
    // A synchronous JSON parse can delay timer callbacks; reject its late result.
    if (!stopped && Date.now() >= deadline) stop('timeout');
    if (stopped) throw stopped;
  }
  async function request(): Promise<unknown> {
    checkInterrupted();
    const headers = new Headers(init?.headers);
    headers.set('Cache-Control', 'no-cache');
    headers.set('Pragma', 'no-cache');
    let response: Response;
    try { response = await fetch(url, { ...init, headers, cache: 'no-store', signal: controller.signal }); }
    catch { checkInterrupted(); throw new SynologyRequestError('network', 'NAS에 연결할 수 없습니다. 주소, 인증서와 네트워크를 확인해 주세요.'); }
    checkInterrupted();
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (contentType.includes('text/html')) {
      throw new SynologyRequestError(response.ok ? 'response' : 'http', `NAS API 대신 HTML 페이지가 반환되었습니다 (HTTP ${response.status}). Tunnel 경로와 접근 설정을 확인해 주세요.`, response.status);
    }
    if (!response.ok) throw new SynologyRequestError('http', `NAS HTTP 오류 ${response.status}.`, response.status);
    let text: string;
    try { text = await response.text(); }
    catch { checkInterrupted(); throw new SynologyRequestError('network', 'NAS 응답을 수신하지 못했습니다. 네트워크를 확인해 주세요.'); }
    checkInterrupted();
    let value: unknown;
    try { value = JSON.parse(text); }
    catch { checkInterrupted(); throw new SynologyRequestError('json', 'NAS가 JSON이 아닌 응답을 반환했습니다.'); }
    checkInterrupted();
    return value;
  }
  try { return await Promise.race([interruption, request()]); }
  finally {
    clearTimeout(timer);
    init?.signal?.removeEventListener('abort', onAbort);
  }
}

export async function discover(baseUrl: string, signal?: AbortSignal): Promise<ApiInfo> {
  const params = new URLSearchParams({ api: 'SYNO.API.Info', version: '1', method: 'query', query: 'all' });
  const data = object(parseEnvelope(await fetchJson(`${baseUrl}/webapi/entry.cgi?${params}`, { signal })));
  const result: ApiInfo = {};
  for (const [name, raw] of Object.entries(data)) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Record<string, unknown>;
    if (typeof entry.path !== 'string' || !Number.isInteger(entry.minVersion) || !Number.isInteger(entry.maxVersion)) continue;
    result[name] = { path: apiPath(entry.path), minVersion: Number(entry.minVersion), maxVersion: Number(entry.maxVersion), requestFormat: string(entry.requestFormat) };
  }
  for (const name of required) {
    if (!result[name]) throw new SynologyError(`${name} API를 찾을 수 없습니다. Audio Station 설치와 권한을 확인해 주세요.`);
    version(result[name], name);
  }
  return result;
}

export async function login(baseUrlInput: string, account: string, password: string, otp?: string, allowHttp = false, signal?: AbortSignal): Promise<Session> {
  const baseUrl = normalizeAddress(baseUrlInput, allowHttp);
  const apis = await discover(baseUrl, signal);
  const info = apis['SYNO.API.Auth'];
  const body = new URLSearchParams({ api: 'SYNO.API.Auth', version: String(version(info, 'SYNO.API.Auth')), method: 'login', account, passwd: password, session: 'AudioStation', format: 'sid', enable_syno_token: 'yes' });
  if (otp?.trim()) body.set('otp_code', otp.trim());
  let data: Record<string, unknown>;
  try {
    data = object(parseEnvelope(await fetchJson(`${baseUrl}/webapi/${apiPath(info.path)}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString(), signal })));
  } catch (error) {
    if (error instanceof SynologyError) {
      const messages: Record<number, string> = { 400: '계정 또는 비밀번호가 올바르지 않습니다.', 401: '비활성화된 계정입니다.', 402: '이 계정에 접근 권한이 없습니다.', 403: '2단계 인증 코드가 필요합니다.', 404: '2단계 인증 코드가 올바르지 않습니다.', 406: '2단계 인증 코드를 입력해 주세요.', 407: 'NAS가 현재 IP의 로그인을 차단했습니다.', 408: '비밀번호가 만료되어 NAS에서 변경해야 합니다.', 409: '비밀번호가 만료되었습니다.', 410: 'NAS에서 비밀번호를 변경해야 합니다.' };
      if (error.code && messages[error.code]) throw new SynologyError(messages[error.code], error.code);
    }
    throw error;
  }
  if (typeof data.sid !== 'string' || !data.sid) throw new SynologyRequestError('response', '로그인 응답에 세션 ID가 없습니다.');
  return { baseUrl, account: account.trim(), sid: data.sid, token: string(data.synotoken) || undefined, apis };
}

export class SynologyClient {
  constructor(readonly session: Session) {}
  private endpoint(api: string, method: string, params: Record<string, string | number> = {}, suffix = ''): string {
    const info = this.session.apis[api];
    if (!info) throw new SynologyError(`${api} API가 이 NAS에서 지원되지 않습니다.`);
    const query = new URLSearchParams({ api, version: String(version(info, api)), method, _sid: this.session.sid });
    if (this.session.token) query.set('SynoToken', this.session.token);
    for (const [key, value] of Object.entries(params)) query.set(key, info.requestFormat === 'JSON' ? JSON.stringify(value) : String(value));
    return `${this.session.baseUrl}/webapi/${apiPath(info.path)}${suffix}?${query}`;
  }
  private async call(api: string, method: string, params?: Record<string, string | number>, signal?: AbortSignal): Promise<Record<string, unknown>> {
    return object(parseEnvelope(await fetchJson(this.endpoint(api, method, params), { signal })));
  }
  async checkSession(signal?: AbortSignal): Promise<void> {
    await Promise.all([
      this.songs({ offset: 0, limit: 1, signal }),
      this.albums({ offset: 0, limit: 1, signal }),
      this.artists({ offset: 0, limit: 1, signal }),
    ]);
  }
  async logout(signal?: AbortSignal): Promise<void> { await this.call('SYNO.API.Auth', 'logout', { session: 'AudioStation' }, signal); }
  async lyrics(songId: string, signal?: AbortSignal): Promise<string> {
    // NAS diagnostic verified Lyrics v1-2, getlyrics(id, library=all),
    // data.lyrics:string. Path and compatible version come from API discovery.
    const data = await this.call('SYNO.AudioStation.Lyrics', 'getlyrics', { id: songId, library: AUDIO_STATION_LIBRARY }, signal);
    if (typeof data.lyrics !== 'string') throw new SynologyRequestError('response', 'NAS 가사 응답 형식을 확인할 수 없습니다.');
    return data.lyrics;
  }
  private collection(data: Record<string, unknown>, key: string): { records: Record<string, unknown>[]; total: number } {
    const raw = data[key];
    if (!Array.isArray(raw)) throw new SynologyRequestError('response', `Audio Station 응답에 ${key} 목록이 없습니다. NAS 버전과 응답 형식을 확인해 주세요.`);
    return { records: raw.map(object), total: number(data.total, raw.length) };
  }
  coverUrl(songId: string): string {
    return this.endpoint('SYNO.AudioStation.Cover', 'getsongcover', { id: songId, size: 320, library: AUDIO_STATION_LIBRARY });
  }
  async songs({ offset, limit, signal }: PageRequest, extra: Record<string, string> = {}): Promise<Page<Song>> {
    const result = this.collection(await this.call('SYNO.AudioStation.Song', 'list', { offset, limit, additional: 'song_tag,song_audio', ...extra, library: AUDIO_STATION_LIBRARY }, signal), 'songs');
    return { total: result.total, items: result.records.map((item) => this.song(item)) };
  }
  private song(item: Record<string, unknown>): Song {
    const id = string(item.id);
    if (!id) throw new SynologyRequestError('response', '곡 응답에 ID가 없습니다.');
    const tag = item.additional && typeof item.additional === 'object' ? (item.additional as Record<string, unknown>).song_tag : undefined;
    const tags = tag && typeof tag === 'object' ? tag as Record<string, unknown> : {};
    const additional = item.additional as Record<string, unknown> | undefined;
    const audio = additional?.song_audio && typeof additional.song_audio === 'object' ? additional.song_audio as Record<string, unknown> : {};
    const codec = string(audio.codec).trim().slice(0, 64);
    const encoding = { ...(codec ? { audioCodec: codec } : {}), ...(typeof audio.lossless === 'boolean' ? { lossless: audio.lossless } : {}) };
    const artist = [string(item.artist), string(tags.artist)].find(value => value.trim()) ?? '알 수 없는 아티스트';
    const taggedAlbum = string(tags.album).trim();
    const album = taggedAlbum || string(item.album).trim() || '알 수 없는 앨범';
    return { id: (id.startsWith('local:') || id.startsWith('drive:') || id.startsWith('s3:')) ? 'nas:' + id : id, nasId: (id.startsWith('local:') || id.startsWith('drive:') || id.startsWith('s3:')) ? id : undefined, source: 'nas', ...encoding, path: string(item.path) || undefined, title: string(item.title, '제목 없음'), artist, album, albumSource: taggedAlbum ? 'tag' : 'fallback', albumArtist: string(tags.album_artist) || undefined, discNumber: number(tags.disc) || undefined, year: number(tags.year) || undefined, duration: number(item.duration), trackNumber: number(item.track, number(tags.track)) || undefined, artworkUrl: this.coverUrl(id) };
  }
  async albums({ offset, limit, signal }: PageRequest): Promise<Page<Album>> {
    const result = this.collection(await this.call('SYNO.AudioStation.Album', 'list', { offset, limit, library: AUDIO_STATION_LIBRARY }, signal), 'albums');
    return { total: result.total, items: result.records.map((item) => ({ id: string(item.id, string(item.name)), title: string(item.name, string(item.title, '제목 없음')), artist: string(item.artist, '알 수 없는 아티스트'), year: number(item.year) || undefined, songCount: number(item.song_count) || undefined, artworkUrl: typeof item.cover === 'string' ? item.cover : undefined })) };
  }
  async artists({ offset, limit, signal }: PageRequest): Promise<Page<Artist>> {
    const result = this.collection(await this.call('SYNO.AudioStation.Artist', 'list', { offset, limit, library: AUDIO_STATION_LIBRARY }, signal), 'artists');
    return { total: result.total, items: result.records.map((item) => ({ id: string(item.id, string(item.name)), name: string(item.name, '이름 없음'), albumCount: number(item.album_count) || undefined })) };
  }
  streamSource(song: Song, quality: StreamingQuality = 'original'): { uri: string } {
    if (!isNasSong(song)) throw new Error('로컬 음악과 클라우드 음악은 NAS 스트리밍 API를 사용하지 않습니다.');
    if (quality === 'mp3') {
      if ((this.session.apis['SYNO.AudioStation.Stream']?.maxVersion ?? 0) < 2) throw new SynologyError('MP3 변환에는 Stream API v2가 필요합니다. 원본 음질을 선택해 주세요.');
      // Official Audio Station 6.5.7 app/audio-core.js uses transcode,
      // format=mp3, position=0 and /0.mp3 for Stream v2. Use discovered path/version.
      // No unverified bitrate or resampling parameters; the NAS chooses its default.
      return { uri: this.endpoint('SYNO.AudioStation.Stream', 'transcode', { id: song.nasId ?? song.id, library: AUDIO_STATION_LIBRARY, format: 'mp3', position: 0 }, '/0.mp3') };
    }
    return { uri: this.endpoint('SYNO.AudioStation.Stream', 'stream', { id: song.nasId ?? song.id, library: AUDIO_STATION_LIBRARY }) };
  }
}
