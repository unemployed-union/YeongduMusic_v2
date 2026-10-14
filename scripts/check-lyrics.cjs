/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(process.argv[2] ?? path.join(__dirname, '..'));
const staged = process.argv[3] && path.resolve(process.argv[3]);
const ts = require(path.join(root, 'node_modules/typescript'));
function load(file, modules = {}, globals = {}) {
  modules = { ...require('./test-cloud-fixtures.cjs').cloudFixtures(globals, modules), ...modules };
  const source = staged && fs.existsSync(path.join(staged, file)) ? path.join(staged, file) : path.join(root, file);
  const code = ts.transpileModule(fs.readFileSync(source, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', ...Object.keys(globals), code)((name) => {
    assert(name in modules, `Unexpected module: ${name}`); return modules[name];
  }, exports, ...Object.values(globals));
  return exports;
}
const parser = load('src/services/lyrics/parse-lyrics.ts');
const song = { id: 'private-song-id', path: '/private/song.mp3', title: 'Test Song', artist: 'Test Artist', album: 'Test Album', duration: 120, artworkUrl: 'https://private.invalid/art?token=hidden' };
const record = (extra = {}) => ({ trackName: song.title, artistName: song.artist, albumName: song.album, duration: 120, instrumental: false, syncedLyrics: '[00:01.20]First line\n[00:04.00]Second line', plainLyrics: 'First line\nSecond line', ...extra });
const response = (raw = record(), status = 200, headers = {}, read) => ({ status, ok: status >= 200 && status < 300, headers: new Headers(headers), text: read ?? (async () => JSON.stringify(raw)) });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
async function flush() { for (let index = 0; index < 15; index++) await Promise.resolve(); }
function runtime(file = 'src/services/lyrics/lrclib.ts', modules = { './parse-lyrics': parser }, platform = 'android') {
  let now = 0, timerId = 0, handler = async () => response();
  const timers = new Map(), calls = [];
  class Clock extends Date { static now() { return now; } }
  const globals = {
    Date: Clock,
    setTimeout: (callback, delay) => { timers.set(++timerId, { callback, at: now + delay }); return timerId; },
    clearTimeout: (id) => timers.delete(id),
    fetch: (url, init) => { calls.push({ url, init }); return handler(url, init); },
  };
  const exports = load(file, file === 'src/services/lyrics/lrclib.ts' ? { ...modules, 'react-native': { Platform: { OS: platform } } } : modules, globals);
  return {
    exports, calls, timers, setFetch: (next) => { handler = next; },
    async tick(milliseconds) {
      const until = now + milliseconds;
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at; timers.delete(next[0]); next[1].callback(); await flush();
      }
      now = until; await flush();
    },
  };
}

async function main() {
  let playback = { position: 0, playing: true, buffering: false };
  let nativePosition = 0, highlighted = -1, poll = null, cleanup, updates = 0, timerStarts = 0;
  const subscribers = new Set();
  const emitPlayback = patch => { const previous = playback; playback = { ...playback, ...patch }; subscribers.forEach(callback => callback(playback, previous)); };
  const clockHook = load('src/features/lyrics/use-active-lyric-index.ts', {
    react: {
      useState: (initial) => { highlighted = initial(); return [highlighted, value => { highlighted = value; updates++; }]; },
      useRef: current => ({ current }),
      useEffect: (effect) => { cleanup = effect(); },
    },
    '@/services/lyrics/parse-lyrics': parser,
    '@/services/playback/controller': { getPlaybackPosition: () => nativePosition },
    '@/stores/playback': { usePlaybackStore: Object.assign(() => { throw Error('Lyric clock must not subscribe React to playback positions'); }, {
      getState: () => playback, subscribe: callback => { subscribers.add(callback); return () => subscribers.delete(callback); },
    }) },
  }, {
    setInterval: (callback, delay) => { assert.equal(delay, 100); timerStarts++; poll = callback; return 1; },
    clearInterval: () => { poll = null; },
  });
  const timedLines = parser.parseLyrics('[00:01]First\n[00:02]Second', 'nas').lines;
  const renderClock = (synced = true, offsetMs = 0) => { cleanup?.(); clockHook.useActiveLyricIndex(timedLines, synced, offsetMs); };
  renderClock();
  nativePosition = 0.99; poll(); assert.equal(highlighted, -1, 'Never anticipate lyric timestamps');
  nativePosition = 1.05; poll(); assert.equal(highlighted, 0, 'Highlight advances before the next store status event');
  nativePosition = 2.05; poll(); assert.equal(highlighted, 1);
  nativePosition = 0.5; poll(); assert.equal(highlighted, -1, 'Native backward seek rewinds highlighting');
  const stableUpdates = updates, stableTimer = timerStarts;
  for (let i = 0; i < 50; i++) { nativePosition = i / 100; emitPlayback({ position: nativePosition }); poll(); }
  assert.equal(updates, stableUpdates, 'Status events and clock samples within one line never update React');
  assert.equal(timerStarts, stableTimer, 'Status events do not recreate the polling timer');
  nativePosition = 1.2; emitPlayback({ position: nativePosition }); assert.equal(highlighted, 0, 'Seek highlights immediately without a React status render');
  emitPlayback({ playing: false }); assert.equal(poll, null, 'Pause stops polling via the store subscription');
  emitPlayback({ playing: true }); assert(poll);
  emitPlayback({ buffering: true, position: 0.5 }); assert.equal(poll, null); assert.equal(highlighted, -1);
  nativePosition = 1.6; emitPlayback({ buffering: false }); assert(poll); assert.equal(highlighted, 0);
  playback = { position: 1.5, playing: true, buffering: true };
  renderClock(); assert.equal(poll, null); assert.equal(highlighted, 0, 'Buffering holds the confirmed store position');
  playback = { position: 1.5, playing: false, buffering: false }; nativePosition = 1.6;
  renderClock(); assert.equal(poll, null); assert.equal(highlighted, 0, 'Pause samples once without polling');
  playback.playing = true; renderClock(); assert.ok(poll); cleanup(); assert.equal(poll, null, 'Unmount stops polling'); assert.equal(subscribers.size, 0);
  renderClock(false); assert.equal(poll, null); assert.equal(highlighted, -1, 'Plain lyrics never poll'); assert.equal(subscribers.size, 0);
  playback = { position: 1.5, playing: false, buffering: false }; nativePosition = 1.5;
  renderClock(true, 1000); assert.equal(highlighted, -1, 'Positive correction delays display by one second');
  renderClock(true, -1000); assert.equal(highlighted, 1, 'Negative correction advances display by one second');
  playback = { position: 1.5, playing: true, buffering: true }; nativePosition = 99;
  renderClock(true, 1000); assert.equal(highlighted, -1, 'Buffering applies correction to the confirmed position');
  playback = { position: 0, playing: true, buffering: false }; nativePosition = 2.9;
  renderClock(true, 1000); assert.equal(highlighted, 0); nativePosition = 3.01; poll(); assert.equal(highlighted, 1);
  nativePosition = 0; poll(); assert.equal(highlighted, -1, 'Repeat/backward seek keeps the corrected lyric clock'); cleanup();
  console.log('PASS: live lyric clock, timestamp boundaries, backward seek, pause/buffering, plain lyrics and cleanup.');
  const lrc = parser.parseLyrics('\uFEFF[ar:Example]\r\n[offset:500]\r\n[00:04.00]Later\r\n[00:01.2][00:02.300]Repeated\r\n[00:01.20]Translation\r\n[00:03.000]\r\n', 'nas');
  assert.equal(lrc.kind, 'synced');
  assert.deepEqual(lrc.lines.map((line) => line.time), [0.7, 1.8, 2.5, 3.5]);
  assert.equal(lrc.lines[0].text, 'Repeated\nTranslation');
  assert.equal(lrc.lines[2].text, '');
  assert.equal(parser.activeLyricIndex(lrc.lines, 0), -1, 'No line before its timestamp');
  assert.equal(parser.activeLyricIndex(lrc.lines, 0.7), 0);
  assert.equal(parser.activeLyricIndex(lrc.lines, 2.5), 2, 'Blank timed lines keep instrumental gaps');
  assert.equal(parser.activeLyricIndex(lrc.lines, 99), 3);
  assert.equal(parser.activeLyricIndex(lrc.lines, 1), 0, 'Seeking backwards/repeat rewinds highlighting');
  assert.equal(parser.activeLyricIndex(lrc.lines, NaN), -1);
  assert.equal(parser.parseLyrics('[ti:Test]\nFirst\nSecond', 'nas').kind, 'plain');
  assert.equal(parser.parseLyrics(' \r\n', 'nas').kind, 'missing');
  assert.equal(parser.parseLyrics('[00:01.00]<00:01.00>First <00:01.30>word', 'nas').lines[0].text, 'First word');
  assert.equal(parser.parseLyrics('[offset:-1000]\n[00:01]First', 'nas').lines[0].time, 2);
  assert.equal(parser.parseLyrics('[offset:5000]\n[00:01]First', 'nas').lines[0].time, 0);
  console.log('PASS: LRC timestamps/fractions, repeated timestamps, merged translations, offset, blank gaps, plain/missing text, seek/repeat highlighting.');

  let client = runtime();
  const result = await client.exports.onlineLyrics(song, 120);
  assert.equal(result.kind, 'synced');
  const requested = new URL(client.calls[0].url);
  assert.equal(requested.origin, 'https://lrclib.net');
  assert.deepEqual([...requested.searchParams.keys()].sort(), ['album_name', 'artist_name', 'duration', 'track_name']);
  assert.equal(requested.searchParams.get('duration'), '120');
  assert(!client.calls[0].url.includes(song.id));
  assert(!client.calls[0].url.includes('private.invalid'));
  assert(!client.calls[0].url.includes(song.path));
  assert(client.calls[0].init.headers['Lrclib-Client'].startsWith('YeongduMusic/'));
  assert.equal(client.calls[0].init.headers['User-Agent'], client.calls[0].init.headers['Lrclib-Client']);
  assert.equal(client.calls[0].init.headers.Accept, 'application/json');
  for (const platform of ['android', 'ios', 'web']) {
    const platformClient = runtime(undefined, undefined, platform);
    // Reproduce the observed native-default 520 without contacting the service.
    platformClient.setFetch(async (_, init) => {
      const identified = platform === 'web'
        ? init.headers['Lrclib-Client']?.startsWith('YeongduMusic/')
        : init.headers['User-Agent']?.startsWith('YeongduMusic/');
      return identified ? response() : response(null, 520);
    });
    assert.equal((await platformClient.exports.onlineLyrics(song, 120)).kind, 'synced');
    assert.equal(platformClient.calls.length, 1);
    assert.equal('User-Agent' in platformClient.calls[0].init.headers, platform !== 'web', 'Browser-managed User-Agent must not be overridden');
    assert.equal(platformClient.timers.size, 0);
  }
  assert.equal(client.timers.size, 0);
  for (const [payload, expected] of [
    [record({ syncedLyrics: null }), 'plain'],
    [record({ instrumental: true, syncedLyrics: null, plainLyrics: null }), 'instrumental'],
    [record({ trackName: 'Different Song' }), 'missing'],
    [record({ artistName: 'Different Artist' }), 'missing'],
    [record({ duration: 124 }), 'missing'],
    [record({ syncedLyrics: '', plainLyrics: '' }), 'missing'],
  ]) {
    client = runtime(); client.setFetch(async () => response(payload));
    assert.equal((await client.exports.onlineLyrics(song, 120)).kind, expected);
  }
  client = runtime(); client.setFetch(async () => response(null, 404));
  assert.equal((await client.exports.onlineLyrics(song, 120)).kind, 'missing');
  client = runtime(); client.setFetch(async () => response({}, 200));
  await assert.rejects(client.exports.onlineLyrics(song, 120), (error) => error.kind === 'response');
  client = runtime(); client.setFetch(async () => response(null, 200, {}, async () => 'invalid JSON'));
  await assert.rejects(client.exports.onlineLyrics(song, 120), (error) => error.kind === 'response');
  client = runtime(); client.setFetch(async () => { throw new Error('offline'); });
  await assert.rejects(client.exports.onlineLyrics(song, 120), (error) => error.kind === 'network');
  client = runtime(); client.setFetch(async () => response(null, 500));
  await assert.rejects(client.exports.onlineLyrics(song, 120), (error) => error.kind === 'http' && error.status === 500);
  client = runtime(); client.setFetch(async () => response(null, 520));
  await assert.rejects(client.exports.onlineLyrics(song, 120), (error) => error.kind === 'http' && error.status === 520);
  console.log('PASS: native User-Agent prevents reproduced 520; web uses alternative client identification; online metadata whitelist, synced/plain/instrumental/404, mismatched title/artist/duration, malformed responses and network/HTTP errors.');

  for (const stage of ['headers', 'body']) {
    client = runtime(); const late = deferred();
    client.setFetch(() => stage === 'headers' ? late.promise : response(null, 200, {}, () => late.promise));
    const promise = client.exports.onlineLyrics(song, 120);
    const rejected = assert.rejects(promise, (error) => error.kind === 'timeout');
    await flush(); await client.tick(15000); await rejected;
    assert(client.calls[0].init.signal.aborted);
    late.resolve(stage === 'headers' ? response() : JSON.stringify(record())); await flush();
    assert.equal(client.timers.size, 0);
  }
  for (const first of ['cancelled', 'timeout']) {
    client = runtime(); const late = deferred(); const abort = new AbortController();
    client.setFetch(() => late.promise);
    const promise = client.exports.onlineLyrics(song, 120, abort.signal);
    const rejected = assert.rejects(promise, (error) => error.kind === first);
    await flush();
    if (first === 'cancelled') abort.abort();
    await client.tick(15000); abort.abort(); await rejected;
    late.resolve(response()); await flush(); assert.equal(client.timers.size, 0);
  }
  client = runtime(); const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(client.exports.onlineLyrics(song, 120, cancelled.signal), (error) => error.kind === 'cancelled');
  assert.equal(client.calls.length, 0);
  client = runtime(); const body = deferred(); const bodyAbort = new AbortController();
  client.setFetch(() => response(null, 200, {}, () => body.promise));
  const bodyRequest = client.exports.onlineLyrics(song, 120, bodyAbort.signal);
  const bodyCancelled = assert.rejects(bodyRequest, (error) => error.kind === 'cancelled');
  await flush(); bodyAbort.abort(); await bodyCancelled;
  body.resolve(JSON.stringify(record())); await flush(); assert.equal(client.timers.size, 0);
  client = runtime(); const firstResponse = deferred();
  client.setFetch(() => firstResponse.promise);
  const first = client.exports.onlineLyrics(song, 120);
  const second = client.exports.onlineLyrics(song, 120);
  await flush(); assert.equal(client.calls.length, 1, 'Provider requests are sequential');
  firstResponse.resolve(response()); await first; await flush();
  assert.equal(client.calls.length, 1);
  await client.tick(250); await second; assert.equal(client.calls.length, 2);
  client = runtime(); const held = deferred(); const queuedAbort = new AbortController();
  client.setFetch(() => held.promise);
  const heldRequest = client.exports.onlineLyrics(song, 120);
  const queuedRequest = client.exports.onlineLyrics(song, 120, queuedAbort.signal);
  const queuedCancelled = assert.rejects(queuedRequest, (error) => error.kind === 'cancelled');
  await flush(); queuedAbort.abort(); held.resolve(response()); await heldRequest; await queuedCancelled;
  assert.equal(client.calls.length, 1, 'Cancelled queued work does not send metadata');
  client = runtime(); client.setFetch(async () => response(null, 429, { 'Retry-After': '30' }));
  await assert.rejects(client.exports.onlineLyrics(song, 120), (error) => error.kind === 'rate-limit');
  await assert.rejects(client.exports.onlineLyrics(song, 120), (error) => error.kind === 'rate-limit');
  assert.equal(client.calls.length, 1, 'Do not send another request during Retry-After');
  await client.tick(30000); client.setFetch(async () => response());
  await client.exports.onlineLyrics(song, 120); assert.equal(client.calls.length, 2);
  const searching = runtime();
  searching.setFetch(async () => response([
    record({ trackName: 'Other Song' }), record({ artistName: 'Other Artist' }), record({ duration: 130 }),
    record({ albumName: 'Alternate Album', syncedLyrics: null }), record({ albumName: 'Alternate Album' }),
  ]));
  assert.equal((await searching.exports.onlineLyrics(song, 120, undefined, true)).kind, 'synced');
  const searchUrl = new URL(searching.calls[0].url);
  assert.equal(searchUrl.pathname, '/api/search');
  assert.deepEqual([...searchUrl.searchParams.keys()].sort(), ['artist_name', 'track_name']);
  assert(!searching.calls[0].url.includes(song.id)); assert(!searching.calls[0].url.includes(song.path));
  const noMatch = runtime(); noMatch.setFetch(async () => response([record({ artistName: 'Other Artist' })]));
  assert.equal((await noMatch.exports.onlineLyrics(song, 120, undefined, true)).kind, 'missing');
  const malformedSearch = runtime(); malformedSearch.setFetch(async () => response(record()));
  await assert.rejects(malformedSearch.exports.onlineLyrics(song, 120, undefined, true), error => error.kind === 'response');
  const emptySearch = runtime(); emptySearch.setFetch(async () => response([]));
  assert.equal((await emptySearch.exports.onlineLyrics(song, 120, undefined, true)).kind, 'missing');
  const unknownDuration = runtime(); unknownDuration.setFetch(async () => response([record()]));
  assert.equal((await unknownDuration.exports.onlineLyrics(song, 0, undefined, true)).kind, 'synced');
  console.log('PASS: manual search uses documented endpoint without album/duration params; unrelated titles/artists/versions rejected, synced alternate-album result preferred, empty/malformed/unknown-duration results handled.');
  console.log('PASS: headers/body timeout, external cancellation, first interruption wins, late completions, timer cleanup, sequential throttling and Retry-After.');

  // Test the actual Synology adapter against Mock fetch, including discovery's
  // endpoint/version selection. The authenticated NAS result is a separate check.
  const nasRuntime = runtime('src/services/synology/api.ts', {});
  const api = nasRuntime.exports;
  const session = { baseUrl: 'https://nas.invalid', sid: 'mock-session', apis: { 'SYNO.AudioStation.Lyrics': { path: 'AudioStation/lyrics.cgi', minVersion: 1, maxVersion: 2 } } };
  nasRuntime.setFetch(async () => response({ success: true, data: { lyrics: 'NAS plain text' } }));
  assert.equal(await new api.SynologyClient(session).lyrics(song.id), 'NAS plain text');
  const nasUrl = new URL(nasRuntime.calls[0].url);
  assert.equal(nasUrl.pathname, '/webapi/AudioStation/lyrics.cgi');
  assert.equal(nasUrl.searchParams.get('method'), 'getlyrics');
  assert.equal(nasUrl.searchParams.get('version'), '2');
  assert.equal(nasUrl.searchParams.get('id'), song.id);
  assert.equal(nasUrl.searchParams.get('library'), 'all');
  const olderSession = { ...session, apis: { 'SYNO.AudioStation.Lyrics': { path: 'entry.cgi', minVersion: 1, maxVersion: 1 } } };
  assert.equal(await new api.SynologyClient(olderSession).lyrics(song.id), 'NAS plain text');
  const olderUrl = new URL(nasRuntime.calls[1].url);
  assert.equal(olderUrl.pathname, '/webapi/entry.cgi');
  assert.equal(olderUrl.searchParams.get('version'), '1');
  nasRuntime.setFetch(async () => response({ success: true, data: { lyrics: [] } }));
  await assert.rejects(new api.SynologyClient(session).lyrics(song.id), (error) => error.kind === 'response');

  let nasText = '', nasFailure, onlineDocument = parser.parseLyrics('[00:01]Online line', 'lrclib'), onlineFailure, nasCalls = 0, onlineCalls = 0;
  const expired = [];
  const onlineTypes = runtime().exports;
  api.SynologyClient.prototype.lyrics = async () => { nasCalls++; if (nasFailure) throw nasFailure; return nasText; };
  const loader = load('src/features/lyrics/load-lyrics.ts', {
    '@/services/lyrics/parse-lyrics': parser,
    '@/services/lyrics/lrclib': { LyricsRequestError: onlineTypes.LyricsRequestError, checkLyricsCancelled: (signal) => { if (signal?.aborted) { const error = new Error('cancelled'); error.name = 'AbortError'; throw error; } }, onlineLyrics: async () => { onlineCalls++; if (onlineFailure) throw onlineFailure; return onlineDocument; } },
    '@/services/synology/api': api,
    '@/stores/auth': { useAuthStore: { getState: () => ({ expire: async (...args) => expired.push(args) }) } },
  });
  const request = { song, source: 'auto', mode: 'nas', session, generation: 7, duration: 120 };
  nasText = '[00:01]NAS synced';
  assert.equal((await loader.loadLyrics(request)).provider, 'nas'); assert.equal(onlineCalls, 0);
  nasText = 'NAS plain';
  assert.equal((await loader.loadLyrics(request)).provider, 'lrclib');
  onlineDocument = parser.parseLyrics('Online plain', 'lrclib');
  assert.equal((await loader.loadLyrics(request)).provider, 'nas');
  onlineFailure = new onlineTypes.LyricsRequestError('http', 'online HTTP 520', 520);
  assert.equal((await loader.loadLyrics(request)).kind, 'plain', 'NAS plain survives online HTTP 520');
  nasText = '';
  await assert.rejects(loader.loadLyrics(request), (error) => error.kind === 'http' && error.status === 520);
  assert.equal(expired.length, 0, 'Online HTTP 520 must not expire NAS authentication');
  nasText = 'NAS plain';
  assert.equal((await loader.loadLyrics({ ...request, source: 'nas' })).provider, 'nas');
  onlineFailure = undefined; nasFailure = new Error('NAS unavailable'); onlineDocument = parser.parseLyrics('[00:01]Online', 'lrclib');
  assert.equal((await loader.loadLyrics(request)).provider, 'lrclib');
  const beforeOnlineOnly = nasCalls;
  assert.equal((await loader.loadLyrics({ ...request, source: 'online' })).provider, 'lrclib'); assert.equal(nasCalls, beforeOnlineOnly);
  const beforeDemo = onlineCalls;
  assert.equal((await loader.loadLyrics({ ...request, mode: 'mock' })).provider, 'demo'); assert.equal(onlineCalls, beforeDemo); assert.equal(nasCalls, beforeOnlineOnly);
  nasFailure = new api.SessionExpiredError(106);
  await assert.rejects(loader.loadLyrics(request), api.SessionExpiredError);
  assert.deepEqual(expired[0], [session, 7], 'Pass the captured session/generation to the existing guarded expiry');
  nasFailure = new api.SynologyRequestError('cancelled', 'cancelled');
  await assert.rejects(loader.loadLyrics(request), (error) => error.kind === 'cancelled'); assert.equal(expired.length, 1);
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(loader.loadLyrics({ ...request, signal: aborted.signal }), /cancelled/); assert.equal(expired.length, 1);
  nasFailure = undefined; nasText = '';
  assert.equal((await loader.loadLyrics({ ...request, source: 'nas' })).kind, 'missing');
  console.log('PASS: verified NAS wire contract with Mock fetch, automatic priority/fallback, explicit sources, demo without network, captured-session expiry and cancellation guards.');
  let auth = { mode: 'nas', session, generation: 7 }, lastRequest;
  const hook = load('src/features/lyrics/use-lyrics.ts', {
    '@tanstack/react-query': { useQuery: (options) => options },
    './load-lyrics': { loadLyrics: async (options) => { lastRequest = options; return onlineDocument; } },
    '@/features/library/repository': { libraryIdentity: (mode, session) => `${mode}:${session?.sid ?? ''}` },
    '@/services/lyrics/lrclib': onlineTypes,
    '@/services/synology/api': api,
    '@/stores/auth': { useAuthStore: (select) => select(auth) },
  });
  const oldQuery = hook.useLyrics(song, 'auto', 120);
  auth = { ...auth, session: { ...session, sid: 'new-session' }, generation: 8 };
  const newQuery = hook.useLyrics(song, 'auto', 120);
  assert.notDeepEqual(oldQuery.queryKey, newQuery.queryKey, 'Account/session transitions isolate lyric cache');
  assert.notDeepEqual(newQuery.queryKey, hook.useLyrics(song, 'nas', 120).queryKey, 'Provider selection isolates cache');
  assert.notDeepEqual(newQuery.queryKey, hook.useLyrics({ ...song, id: 'second-song' }, 'auto', 120).queryKey);
  const queryAbort = new AbortController();
  await oldQuery.queryFn({ signal: queryAbort.signal });
  assert.equal(lastRequest.signal, queryAbort.signal, 'Query cancellation reaches the loader');
  assert.equal(lastRequest.session, session, 'The query retains its original session snapshot');
  assert.equal(lastRequest.generation, 7);
  assert.equal(oldQuery.retry(0, new api.SessionExpiredError(106)), false);
  assert.equal(oldQuery.retry(0, new onlineTypes.LyricsRequestError('rate-limit', 'rate')), false);
  assert.equal(oldQuery.retry(0, new onlineTypes.LyricsRequestError('network', 'network')), true);
  const manualQuery = hook.useLyrics(song, 'online', 120, true);
  assert.equal(manualQuery.staleTime, 0); assert.equal(manualQuery.refetchOnWindowFocus, false);
  assert.notDeepEqual(manualQuery.queryKey, hook.useLyrics(song, 'online', 120).queryKey);
  await manualQuery.queryFn({ signal: queryAbort.signal }); assert.equal(lastRequest.searchOnline, true);
  const { QueryClient, QueryObserver } = require(path.join(root, 'node_modules/@tanstack/react-query'));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(manualQuery.queryKey, parser.parseLyrics('', 'lrclib'));
  lastRequest = null;
  const observer = new QueryObserver(queryClient, manualQuery), unsubscribe = observer.subscribe(() => {});
  await flush();
  assert.equal(lastRequest.searchOnline, true, 'Opening manual search refetches even a fresh cached miss');
  assert.equal(observer.getCurrentResult().data.kind, onlineDocument.kind);
  unsubscribe(); observer.destroy(); queryClient.clear();
  console.log('PASS: query cache separates tracks/providers/sessions; AbortSignal and captured generation forwarded; auth/rate-limit errors are not retried.');
  console.log('Native lyric scrolling/animation and real online song matching require device verification. No NAS credentials or lyric contents are printed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
