/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const ts = require('typescript'), { create } = require('zustand');
const { cloudFixtures } = require('./test-cloud-fixtures.cjs');
function load(file, mocks = {}, globals = {}) {
  const modules = { ...cloudFixtures(globals, mocks), ...mocks };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', ...Object.keys(globals), code)(name => {
    if (name in modules) return modules[name];
    if (name === 'zustand') return { create };
    if (name.startsWith('@aws-') || name.startsWith('@smithy/') || name === 'fast-xml-parser') return require(name);
    throw Error('Unmocked S3 dependency ' + name);
  }, exports, ...Object.values(globals));
  return exports;
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(check) { for (let i = 0; i < 100; i++) { if (check()) return; await tick(); } throw Error('Expected async boundary not reached'); }
const input = { endpoint: 'https://storage.example.invalid:9000', region: 'us-east-1', bucket: 'music-bucket', prefix: 'music/', pathStyle: true, allowHttp: false,
  accessKeyId: 'TESTACCESS', secretAccessKey: 'test-secret-only-not-real', sessionToken: 'test-session-only' };
function xml(keys, next) {
  return '<?xml version="1.0"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><EncodingType>url</EncodingType><IsTruncated>' + !!next + '</IsTruncated>'
    + keys.map(([key, size = 321]) => '<Contents><Key>' + encodeURIComponent(key) + '</Key><Size>' + size + '</Size><LastModified>2026-10-13T00:00:00Z</LastModified></Contents>').join('')
    + (next ? '<NextContinuationToken>' + next + '</NextContinuationToken>' : '') + '</ListBucketResult>';
}
const response = (text, status = 200, read) => ({ ok: status >= 200 && status < 300, status, text: read ?? (async () => text) });
let network = async () => response(xml([['music/song.mp3']]));
const requests = [];
const sharedRequest = cloudFixtures()['@/services/cloud-music/request'];
const connectionModule = load('src/services/s3/connection.ts', { '@/services/cloud-music/request': sharedRequest });
const responseModule = load('src/services/s3/response.ts', { './connection': connectionModule });
const api = load('src/services/s3/api.ts', { './connection': connectionModule, './response': responseModule, '@/services/cloud-music/request': sharedRequest }, { fetch: (url, options) => { requests.push({ url, options }); return network(url, options); } });
const hmac = (key, text) => crypto.createHmac('sha256', key).update(text).digest();
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const encode = text => encodeURIComponent(text).replace(/[!'()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase());
function checkSignature(urlString, config) {
  const url = new URL(urlString), signature = url.searchParams.get('X-Amz-Signature');
  const credential = url.searchParams.get('X-Amz-Credential'), scope = credential.slice(credential.indexOf('/') + 1);
  const [date, region, service] = scope.split('/');
  assert.equal(region, config.region); assert.equal(service, 's3');
  assert.equal(url.searchParams.get('X-Amz-SignedHeaders'), 'host');
  const query = [...url.searchParams].filter(([key]) => key !== 'X-Amz-Signature').map(([key, value]) => [encode(key), encode(value)])
    .sort(([a, av], [b, bv]) => a < b ? -1 : a > b ? 1 : av < bv ? -1 : av > bv ? 1 : 0).map(([key, value]) => key + '=' + value).join('&');
  const canonical = ['GET', url.pathname, query, 'host:' + url.host + '\n', 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const signingKey = hmac(hmac(hmac(hmac('AWS4' + config.secretAccessKey, date), region), service), 'aws4_request');
  assert.equal(hmac(signingKey, ['AWS4-HMAC-SHA256', url.searchParams.get('X-Amz-Date'), scope, hash(canonical)].join('\n')).toString('hex'), signature);
  assert.ok(!urlString.includes(config.secretAccessKey));
}
function storeHarness(initial) {
  let saved = initial ?? null, setDelay = null, readDelay = null, failDelete = false, writes = 0;
  const secure = {
    getItemAsync: async () => { const value = saved; if (readDelay) await readDelay.promise; return value; },
    setItemAsync: async (_key, value) => { writes++; if (setDelay) await setDelay.promise; saved = value; },
    deleteItemAsync: async () => { if (failDelete) throw Error('disk'); saved = null; },
  };
  const store = load('src/stores/s3.ts', { 'react-native': { Platform: { OS: 'android' } }, 'expo-secure-store': secure, '@/services/s3/api': api }).useS3Store;
  return { store, saved: () => saved, writes: () => writes, setDelay: value => { setDelay = value; }, readDelay: value => { readDelay = value; }, failDelete: value => { failDelete = value; } };
}
async function main() {
  const connection = await api.prepareS3Connection(input);
  assert.match(connection.id, /^[a-f0-9]{64}$/);
  assert.equal((await api.prepareS3Connection({ ...input, prefix: '', secretAccessKey: 'rotated-test' })).id, connection.id);
  assert.notEqual((await api.prepareS3Connection({ ...input, accessKeyId: 'OTHER' })).id, connection.id);
  assert.equal((await api.prepareS3Connection({ ...input, endpoint: '', region: 'cn-north-1' })).endpoint, 'https://s3.cn-north-1.amazonaws.com.cn');
  for (const endpoint of ['http://storage.invalid', 'https://user:password@storage.invalid', 'https://storage.invalid/path', 'https://storage.invalid/?secret=x']) {
    await assert.rejects(api.prepareS3Connection({ ...input, endpoint }), /HTTPS/);
  }
  assert.equal((await api.prepareS3Connection({ ...input, endpoint: 'http://127.0.0.1:9000', allowHttp: true })).allowHttp, true);
  const key = 'music/한 글%+/song & one.MP3';
  const signed = await api.signedS3Url(connection, key);
  checkSignature(signed, connection);
  assert.equal(new URL(signed).searchParams.get('X-Amz-Security-Token'), input.sessionToken);
  assert.equal(new URL(signed).searchParams.get('X-Amz-Expires'), '86400');
  assert.equal(decodeURIComponent(new URL(signed).pathname), '/' + input.bucket + '/' + key);
  const virtual = await api.prepareS3Connection({ ...input, endpoint: '', pathStyle: false });
  const virtualUrl = await api.signedS3Url(virtual, key); checkSignature(virtualUrl, virtual);
  assert.equal(new URL(virtualUrl).hostname, 'music-bucket.s3.us-east-1.amazonaws.com');
  await assert.rejects(api.signedS3Url(connection, 'outside/song.mp3'), /접두사/);
  await assert.rejects(api.signedS3Url(connection, 'music/../song.mp3'), /경로/);
  const token = 'opaque+/%=';
  network = async url => {
    checkSignature(url, connection); const query = new URL(url).searchParams;
    assert.equal(query.get('prefix'), 'music/'); assert.equal(query.get('encoding-type'), 'url');
    return response(query.get('continuation-token') === token ? xml([['music/last.flac']])
      : xml([[key], ['music/empty.mp3', 0], ['music/image.jpg']], token));
  };
  const songs = await api.loadS3Songs(connection);
  assert.equal(songs.length, 2); assert.equal(songs[0].title, 'song & one'); assert.equal(songs[0].s3.key, key);
  assert.equal(songs[0].s3.size, 321); assert.ok(!JSON.stringify(songs).includes('X-Amz'));
  assert.equal(requests.at(-1).options.redirect, 'error');
  network = async () => response(xml([['music/song.mp3']], 'repeated'));
  await assert.rejects(api.loadS3Songs(connection), /반복/);
  for (const body of ['<html>oops</html>', '<ListBucketResult>', '<!DOCTYPE x><ListBucketResult/>', xml([['outside/song.mp3']])]) {
    network = async () => response(body); await assert.rejects(api.loadS3Songs(connection));
  }
  network = async () => response('<Error><Code>SignatureDoesNotMatch</Code><Message>do-not-show-private-url</Message></Error>', 403);
  await assert.rejects(api.loadS3Songs(connection), error => error.status === 403 && /서명/.test(error.message) && !error.message.includes('private'));
  network = async () => response('<Error><Code>AccessDenied</Code></Error>', 403);
  await assert.rejects(api.loadS3Songs(connection), /읽기 권한/);
  const abort = new AbortController(); abort.abort(); await assert.rejects(api.loadS3Songs(connection, abort.signal), /취소/);
  await checkDeadline();
  network = async () => response(xml([['music/song.mp3']]));
  const h = storeHarness(); await h.store.getState().connect(input);
  assert.equal(h.store.getState().connection.id, connection.id);
  for (const privateValue of [input.accessKeyId, input.secretAccessKey, input.sessionToken]) assert.ok(!JSON.stringify(h.store.getState().connection).includes(privateValue));
  const track = h.store.getState().songs[0];
  checkSignature((await h.store.getState().source(track)).uri, connection);
  const rebooted = storeHarness(h.saved()); await rebooted.store.getState().bootstrap();
  assert.equal(rebooted.store.getState().connection.id, connection.id);
  const oldSongs = h.store.getState().songs;
  network = async () => response('broken'); await assert.rejects(h.store.getState().refresh()); assert.equal(h.store.getState().songs, oldSongs);
  const delayed = deferred();
  network = async () => { await delayed.promise; return response(xml([['music/late.mp3']])); };
  const refresh = h.store.getState().refresh(); h.store.getState().cancel(); delayed.resolve(); await refresh;
  assert.equal(h.store.getState().songs, oldSongs, 'Cancelled lists cannot replace the library');
  network = async () => response(xml([['music/song.mp3']]));
  const first = storeHarness(), barrier = deferred(); first.setDelay(barrier);
  const pending = first.store.getState().connect(input); await until(() => first.writes() === 1);
  const latest = first.store.getState().connect({ ...input, accessKeyId: 'NEWACCESS', secretAccessKey: 'new-fixture-secret' });
  first.setDelay(null); barrier.resolve(); await Promise.all([pending, latest]);
  assert.equal(JSON.parse(first.saved()).accessKeyId, 'NEWACCESS', 'Stale cleanup cannot erase newer credentials');
  const restoring = storeHarness(h.saved()), readBarrier = deferred(); restoring.readDelay(readBarrier);
  const bootstrap = restoring.store.getState().bootstrap(); await tick();
  const logout = restoring.store.getState().disconnect(); readBarrier.resolve(); await Promise.all([bootstrap, logout]);
  assert.equal(restoring.store.getState().connection, null); assert.equal(restoring.saved(), null);
  h.failDelete(true); await h.store.getState().disconnect(); assert.match(h.store.getState().error, /삭제하지/);
  h.failDelete(false); await h.store.getState().disconnect(); assert.equal(h.saved(), null);
  await assert.rejects(h.store.getState().source(track), /다시 연결/);
  await rebooted.store.getState().connect({ ...input, accessKeyId: 'DIFFERENT' });
  await assert.rejects(rebooted.store.getState().source(track), /다시 연결/);
  await rebooted.store.getState().connect(input);
  await checkPlayback(rebooted.store);
  await checkDownload(rebooted.store);
  await checkLibraryAndRecovery(rebooted.store);
  console.log('PASS: independent SigV4 verification, AWS/custom/path/virtual URLs and Unicode keys; XML/list pagination/cancel/error; SecureStore restart/races/delete failure; mixed playback/NAS isolation and S3 download. Only mock storage/audio/network were used.');
}
async function checkLibraryAndRecovery(s3) {
  const track = s3.getState().songs[0], local = { ...track, id: 'local-fixture', source: 'local', s3: undefined, local: { fileName: 'test.mp3' } };
  let source = 's3', nasFailure = false, queryOptions, nasRequests = 0;
  const state = { songs: [local], ready: true };
  const rules = load('src/features/hidden-music/rules.ts');
  const library = load('src/features/library/queries.ts', {
    react: { useCallback: fn => fn, useMemo: fn => fn() },
    '@tanstack/react-query': { useQuery: options => { queryOptions = options; return { data: nasFailure ? undefined : options.select({ items: [], total: 0 }), isError: nasFailure, isPending: false, error: nasFailure ? Error('NAS fixture unavailable') : null }; } },
    '@/stores/s3': { useS3Store: select => select(s3.getState()) },
    '@/stores/google-drive': { useGoogleDriveStore: select => select({ songs: [], loading: false, error: null }) },
    '@/stores/local-music': { useLocalMusicStore: select => select({ ...state, source }) },
    '@/stores/auth': { useAuthStore: select => select({ mode: 'nas', session: {} }) },
    '@/stores/hidden-music': { useHiddenMusicStore: select => select({ ready: true, profile: { presets: [{ enabled: true, songIds: [track.id], folders: [] }] } }) },
    '@/stores/library-preferences': { useLibraryPreferences: select => select({ ready: true, includeFolderAlbums: true }) },
    './album-library': load('src/features/library/album-library.ts'), './load-song-library': load('src/features/library/load-song-library.ts'),
    './search-songs': load('src/features/library/search-songs.ts'), '../hidden-music/rules': rules,
    './repository': { libraryIdentity: () => 'nas-fixture', musicRepository: () => { nasRequests++; throw Error('Unexpected NAS access'); } },
  });
  assert.deepEqual(library.useSongs().data.items.map(song => song.id), [track.id]);
  await queryOptions.queryFn({ signal: new AbortController().signal }); assert.equal(nasRequests, 0, 'S3-only queries do not access NAS');
  assert.deepEqual(library.useSearch(track.title).data.items.map(song => song.id), [track.id]);
  assert.equal(library.useAlbums().data.items.length, 1); assert.equal(library.useArtists().data.items.length, 1);
  source = 'all'; assert.equal(library.useSongs().data.items.length, 2);
  nasFailure = true; const fallback = library.useSongs();
  assert.equal(fallback.isError, true); assert.equal(fallback.data.items.length, 2, 'S3/local remain available during NAS failure');
  source = 'nas'; nasFailure = false; assert.equal(library.useSongs().data.items.length, 0);
  const playback = load('src/stores/playback.ts').usePlaybackStore;
  playback.getState().setQueue([track], 0);
  let saved;
  const auth = { mode: 'setup', session: null };
  const persistCallbacks = [];
  const persistence = load('src/services/playback/persistence.ts', {
    'react-native': { Platform: { OS: 'android' }, AppState: { addEventListener: () => ({ remove: () => {} }) } },
    '@/stores/s3': { useS3Store: s3 }, '@/stores/playback': { usePlaybackStore: playback },
    '@/stores/auth': { useAuthStore: { getState: () => auth } },
    '@/stores/google-drive': { useGoogleDriveStore: { getState: () => ({ account: null }) } },
    '@/stores/local-music': { useLocalMusicStore: { getState: () => ({ songs: [] }) } },
    '@/stores/hidden-music': { useHiddenMusicStore: { getState: () => ({ ready: true, scope: null, profile: { presets: [] } }) } },
    '@/features/hidden-music/rules': rules,
    '@/services/synology/api': { SynologyClient: class {} },
    'expo-sqlite/kv-store': { __esModule: true, default: { getItem: async () => saved, setItem: async (_key, value) => { saved = value; }, removeItem: async () => { saved = null; } } },
  }, { setTimeout: callback => { persistCallbacks.push(callback); return callback; }, clearTimeout: () => {} });
  const stop = persistence.startPlaybackPersistence(); persistCallbacks[0](); await until(() => !!saved); stop();
  assert.ok(!saved.includes('X-Amz')); assert.ok(!saved.includes(input.secretAccessKey)); assert.ok(!saved.includes(input.sessionToken));
  assert.equal((await persistence.readRestoredPlayback()).queue[0].id, track.id);
  const connection = s3.getState().connection;
  s3.setState({ connection: { ...connection, id: 'other' } }); assert.equal(await persistence.readRestoredPlayback(), null);
  s3.setState({ connection: { ...connection, prefix: 'other/' } }); assert.equal(await persistence.readRestoredPlayback(), null);
  s3.setState({ connection });
  console.log('PASS: S3-only search/album/artist queries without NAS access; source filtering and NAS failure fallback; credential-free playback restore with connection/prefix isolation.');
}
async function checkDeadline() {
  const callbacks = [], cleared = [];
  const shared = cloudFixtures({ setTimeout: fn => { callbacks.push(fn); return fn; }, clearTimeout: fn => cleared.push(fn) })['@/services/cloud-music/request'];
  const late = deferred(), aborted = new AbortController();
  const pending = shared.cloudRequest('S3', async () => { await late.promise; return 1; }, aborted.signal);
  aborted.abort(); callbacks[0](); await assert.rejects(pending, /취소/); late.resolve();
  const body = deferred(); let receivedHeaders = false;
  const timeout = shared.cloudRequest('S3', async () => { receivedHeaders = true; return body.promise; });
  assert.equal(receivedHeaders, true); callbacks.at(-1)(); await assert.rejects(timeout, /시간이 초과/); body.resolve(2);
  const headers = deferred();
  const beforeHeaders = shared.cloudRequest('S3', () => headers.promise); callbacks.at(-1)(); await assert.rejects(beforeHeaders, /시간이 초과/); headers.resolve(3);
  assert.equal(cleared.length, 3);
}
async function checkPlayback(s3) {
  const auth = create(() => ({ mode: 'nas', session: { baseUrl: 'https://nas.invalid', account: 'test' }, generation: 0 }));
  const privacyScope = JSON.stringify(['https://nas.invalid', 'test']);
  let nasChecks = 0, engines = 0, onStatus;
  const rules = load('src/features/hidden-music/rules.ts');
  const playback = load('src/stores/playback.ts').usePlaybackStore;
  const loaded = [];
  class Audio {
    constructor() { engines++; }
    subscribe(fn) { onStatus = fn; return () => {}; } subscribeRemoteNavigation() { return () => {}; }
    async load(source, song, position = 0) { loaded.push({ source, song }); onStatus({ playing: true, buffering: false, position, duration: 100 }); }
    async seek(position) { playback.getState().setStatus({ position }); } play() {} pause() {} release() {} getPosition() { return playback.getState().position; }
  }
  class SynologyError extends Error {} class SessionExpiredError extends Error {}
  const controller = load('src/services/playback/controller.ts', {
    './audio-engine': { ExpoAudioEngine: Audio }, '@/stores/playback': { usePlaybackStore: playback },
    '@/stores/auth': { useAuthStore: auth },
    '@/stores/hidden-music': { useHiddenMusicStore: { getState: () => ({ ready: true, scope: privacyScope, profile: { presets: [] } }), subscribe: () => () => {} } },
    '@/features/hidden-music/rules': rules,
    '@/features/library/repository': { musicRepository: () => ({ streamSource: async () => ({ uri: 'https://nas.invalid/test' }) }) },
    '@/services/synology/api': { SynologyError, SessionExpiredError, SynologyClient: class { async checkSession() { nasChecks++; } } },
    '@/stores/player-background': { usePlayerBackgroundStore: { getState: () => ({ selectArtwork: () => {}, reset: () => {} }) } },
    '@/stores/s3': { s3Source: song => s3.getState().source(song) },
    '@/stores/google-drive': { driveSource: async () => ({ uri: 'https://drive.invalid/test' }) },
    '@/services/local-music/storage': { localSource: async () => ({ uri: 'file:///local/test.mp3' }) },
  });
  const track = s3.getState().songs[0], nas = { ...track, id: 'nas', source: 'nas', s3: undefined }, drive = { ...track, id: 'drive', source: 'drive', s3: undefined, drive: { accountId: 'test', fileId: 'test' } }, local = { ...track, id: 'local', source: 'local', s3: undefined, local: { fileName: 'test.mp3' } };
  await controller.playQueue([nas, drive, track, local], 2);
  assert.equal(loaded.at(-1).song.source, 's3'); assert.ok(loaded.at(-1).source.uri.includes('X-Amz-Signature='));
  await controller.next(); assert.equal(loaded.at(-1).song.source, 'local');
  await controller.previous(false); assert.equal(loaded.at(-1).song.source, 's3');
  auth.setState({ mode: 'setup', session: null, generation: 1 });
  controller.reconcilePlaybackVisibility();
  assert.equal(playback.getState().queue[playback.getState().index].source, 's3');
  assert.ok(playback.getState().queue.every(song => song.source !== 'nas'));
  controller.stopNasPlayback(); assert.equal(playback.getState().queue.length, 3);
  await controller.seek(30); assert.equal(playback.getState().position, 30);
  onStatus({ playing: false, buffering: false, position: 30, duration: 100, error: 'expired URL fixture' });
  await until(() => loaded.length === 4);
  assert.equal(nasChecks, 0); assert.equal(engines, 1, 'All sources share one engine');
  controller.reconcilePlaybackVisibility(song => song.source === 's3');
  assert.equal(playback.getState().queue.length, 0, 'Disconnecting the active S3 source stops its queue');
}
async function checkDownload(s3) {
  const track = s3.getState().songs[0], temporary = new Set(), saved = [];
  let status = 200, expired = 0;
  const fsMock = {
    cacheDirectory: 'file:///cache/',
    createDownloadResumable: (uri, destination) => ({ downloadAsync: async () => { temporary.add(destination); assert.ok(uri.includes('X-Amz-Signature=')); return { status, mimeType: 'audio/mpeg', headers: { 'content-length': '321' } }; }, cancelAsync: async () => {} }),
    getInfoAsync: async () => ({ exists: true, isDirectory: false, size: 321 }),
    deleteAsync: async uri => temporary.delete(uri),
  };
  const downloader = load('src/services/offline-music/download.ts', {
    'react-native': { Platform: { OS: 'android' } }, 'expo-file-system/legacy': fsMock,
    './formats': load('src/services/offline-music/formats.ts'),
    '@/stores/auth': { useAuthStore: { getState: () => ({ mode: 'setup', session: { sid: 'old-nas' }, expire: async () => { expired++; } }) } },
    '@/stores/s3': { s3Source: song => s3.getState().source(song) },
    '@/stores/google-drive': { driveSource: async () => { throw Error('S3 must not use Drive'); } },
    '@/services/synology/api': { SynologyClient: class { constructor() { throw Error('S3 must not use NAS'); } } },
    '@/services/local-music/storage': { storeDownloadedSong: async song => { saved.push(song); return { song, duplicate: false }; } },
  });
  await downloader.downloadSong(track, new AbortController().signal, () => {}, () => {});
  assert.equal(saved.length, 1); assert.equal(saved[0].source, 's3'); assert.equal(temporary.size, 0);
  status = 401; await assert.rejects(downloader.downloadSong(track, new AbortController().signal, () => {}, () => {}), /인증/);
  assert.equal(expired, 0, 'S3 errors never expire a NAS session'); assert.equal(temporary.size, 0);
}
const watchdog = setTimeout(() => { console.error('S3 regression did not finish'); process.exitCode = 1; }, 10000);
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(watchdog));
