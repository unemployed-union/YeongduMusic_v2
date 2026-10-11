import { Platform } from 'react-native';
import { parseLyrics } from './parse-lyrics';
import type { LyricsDocument } from '@/types/lyrics';
import type { Song } from '@/types/music';

type FailureKind = 'cancelled' | 'timeout' | 'network' | 'http' | 'response' | 'rate-limit';
export class LyricsRequestError extends Error {
  constructor(readonly kind: FailureKind, message: string, readonly status?: number) {
    super(message);
    this.name = kind === 'cancelled' ? 'AbortError' : 'LyricsRequestError';
  }
}
export function checkLyricsCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new LyricsRequestError('cancelled', '가사 요청이 취소되었습니다.');
}

const CLIENT_IDENTITY = 'YeongduMusic/1.0.0 (https://github.com/unemployed-union/YeongduMusic-V2)';

const missing = (): LyricsDocument => ({ provider: 'lrclib', kind: 'missing', lines: [] });
const normalize = (value: string) => value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
let requests: Promise<unknown> = Promise.resolve();
let nextRequestAt = 0;

function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  checkLyricsCancelled(signal);
  return new Promise((resolve, reject) => {
    const onAbort = () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); reject(new LyricsRequestError('cancelled', '가사 요청이 취소되었습니다.')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, milliseconds);
    signal?.addEventListener('abort', onAbort);
  });
}

async function requestLyrics(song: Song, duration: number, signal?: AbortSignal): Promise<LyricsDocument> {
  checkLyricsCancelled(signal);
  if (!song.title.trim() || !song.artist.trim()) return missing();
  const parameters = new URLSearchParams({ track_name: song.title, artist_name: song.artist });
  if (song.album.trim()) parameters.set('album_name', song.album);
  if (Number.isFinite(duration) && duration >= 1 && duration <= 3600) parameters.set('duration', String(duration));
  const controller = new AbortController();
  const deadline = Date.now() + 15000;
  let stopped: LyricsRequestError | null = null;
  let rejectStopped!: (error: LyricsRequestError) => void;
  const interruption = new Promise<never>((_, reject) => { rejectStopped = reject; });
  const stop = (kind: 'cancelled' | 'timeout') => {
    if (stopped) return;
    stopped = new LyricsRequestError(kind, kind === 'timeout' ? '온라인 가사 요청 시간이 초과되었습니다. 다시 시도해 주세요.' : '가사 요청이 취소되었습니다.');
    rejectStopped(stopped);
    controller.abort();
  };
  const onAbort = () => stop('cancelled');
  const timer = setTimeout(() => stop('timeout'), 15000);
  signal?.addEventListener('abort', onAbort);
  const check = () => {
    if (!stopped && signal?.aborted) stop('cancelled');
    if (!stopped && Date.now() >= deadline) stop('timeout');
    if (stopped) throw stopped;
  };
  async function fetchLyrics(): Promise<LyricsDocument> {
    check();
    let response: Response;
    try {
      response = await fetch(`https://lrclib.net/api/get?${parameters}`, {
        signal: controller.signal,
        // Native defaults such as okhttp receive HTTP 520 despite Lrclib-Client.
        // Browsers control User-Agent, so keep the supported alternative there.
        headers: {
          Accept: 'application/json',
          'Lrclib-Client': CLIENT_IDENTITY,
          ...(Platform.OS === 'web' ? {} : { 'User-Agent': CLIENT_IDENTITY }),
        },
      });
    } catch { check(); throw new LyricsRequestError('network', '온라인 가사에 연결할 수 없습니다. 네트워크를 확인해 주세요.'); }
    check();
    if (response.status === 404) return missing();
    if (response.status === 429 || response.status === 503) {
      const retryAfter = response.headers.get('retry-after');
      const seconds = Number(retryAfter);
      const delay = retryAfter && Number.isFinite(seconds) ? seconds * 1000 : retryAfter ? Date.parse(retryAfter) - Date.now() : 30000;
      nextRequestAt = Math.max(nextRequestAt, Date.now() + (Number.isFinite(delay) ? Math.max(1000, delay) : 30000));
      throw new LyricsRequestError('rate-limit', '가사 서버가 잠시 쉬고 있습니다. 잠시 후 다시 시도해 주세요.', response.status);
    }
    if (!response.ok) throw new LyricsRequestError('http', `온라인 가사 서버 오류 (HTTP ${response.status}).`, response.status);
    let body: string;
    try { body = await response.text(); }
    catch { check(); throw new LyricsRequestError('network', '온라인 가사 응답을 받지 못했습니다.'); }
    check();
    if (body.length > 1000000) throw new LyricsRequestError('response', '가사 응답이 너무 큽니다.');
    let raw: unknown;
    try { raw = JSON.parse(body); }
    catch { check(); throw new LyricsRequestError('response', '온라인 가사 응답을 읽을 수 없습니다.'); }
    check();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new LyricsRequestError('response', '온라인 가사 형식이 올바르지 않습니다.');
    const record = raw as Record<string, unknown>;
    if (typeof record.trackName !== 'string' || typeof record.artistName !== 'string' || typeof record.instrumental !== 'boolean' ||
      !(record.syncedLyrics === null || typeof record.syncedLyrics === 'string') || !(record.plainLyrics === null || typeof record.plainLyrics === 'string')) {
      throw new LyricsRequestError('response', '온라인 가사 형식이 올바르지 않습니다.');
    }
    if (normalize(record.trackName) !== normalize(song.title) || normalize(record.artistName) !== normalize(song.artist)) return missing();
    if (parameters.has('duration') && (typeof record.duration !== 'number' || !Number.isFinite(record.duration) || Math.abs(record.duration - duration) > 2)) return missing();
    if (record.instrumental) return { provider: 'lrclib', kind: 'instrumental', lines: [] };
    const synced = parseLyrics(typeof record.syncedLyrics === 'string' ? record.syncedLyrics : '', 'lrclib');
    const result = synced.kind === 'synced' ? synced : parseLyrics(typeof record.plainLyrics === 'string' ? record.plainLyrics : '', 'lrclib');
    check();
    return result;
  }
  try { return await Promise.race([interruption, fetchLyrics()]); }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
}

// Sequential, on-demand requests only; respect the provider's Retry-After.
export function onlineLyrics(song: Song, duration: number, signal?: AbortSignal): Promise<LyricsDocument> {
  const result = requests.then(async () => {
    checkLyricsCancelled(signal);
    const delay = nextRequestAt - Date.now();
    if (delay > 500) throw new LyricsRequestError('rate-limit', '가사 서버가 잠시 쉬고 있습니다. 잠시 후 다시 시도해 주세요.');
    if (delay > 0) await wait(delay, signal);
    checkLyricsCancelled(signal);
    try { return await requestLyrics(song, duration, signal); }
    finally { nextRequestAt = Math.max(nextRequestAt, Date.now() + 250); }
  });
  requests = result.catch(() => {});
  return result;
}
