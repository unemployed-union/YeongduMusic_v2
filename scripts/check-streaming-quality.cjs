/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..');
const projectRequire = createRequire(path.join(root, 'package.json'));
const ts = projectRequire('typescript');
function load(file, overrides = {}, globals = {}) {
  overrides = { ...require('./test-cloud-fixtures.cjs').cloudFixtures(globals, overrides), ...overrides };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', ...Object.keys(globals), code)(name => name in overrides ? overrides[name] : projectRequire(name), mod, mod.exports, ...Object.values(globals));
  return mod.exports;
}
function deferred() { let resolve; const promise = new Promise(ok => { resolve = ok; }); return { promise, resolve }; }
const tick = () => new Promise(resolve => setImmediate(resolve));
function preferences(platform = 'android', initial = null) {
  const h = { value: initial, calls: [], read: async () => {}, write: async () => {} };
  const storage = {
    getItemAsync: async key => { h.calls.push(['get', key]); await h.read(); return h.value; },
    setItemAsync: async (key, value) => { h.calls.push(['set', key, value]); await h.write(value); h.value = value; },
  };
  const web = {
    getItem: key => { h.calls.push(['web-get', key]); return h.value; },
    setItem: (key, value) => { h.calls.push(['web-set', key, value]); h.value = value; },
  };
  h.store = load('src/stores/streaming-preferences.ts', { 'react-native': { Platform: { OS: platform } }, 'expo-secure-store': storage }, { localStorage: web }).useStreamingPreferences;
  return h;
}
const api = load('src/services/synology/api.ts');
const session = { baseUrl: 'https://example.invalid', sid: 'fixture-sid', token: 'fixture-token', apis: { 'SYNO.AudioStation.Stream': { path: 'AudioStation/stream.cgi', minVersion: 1, maxVersion: 2 } } };
const song = { id: 'song/fixture' };
function repo(h, auth, mockRepository = {}) {
  return load('src/features/library/repository.ts', {
    './mock-repository': { mockRepository }, '@/services/synology/api': api,
    '@/services/synology/cache': {}, '@/stores/auth': { useAuthStore: { getState: () => auth } },
    '@/stores/streaming-preferences': { useStreamingPreferences: h.store },
  }).musicRepository;
}
async function test(name, run) { await run(); console.log('PASS: ' + name); }
async function main() {
  await test('original URL unchanged; MP3 uses official request contract and discovery path', async () => {
    const client = new api.SynologyClient(session);
    assert.deepEqual(client.streamSource(song), client.streamSource(song, 'original'));
    const original = new URL(client.streamSource(song).uri);
    assert.equal(original.pathname, '/webapi/AudioStation/stream.cgi');
    assert.equal(original.searchParams.get('method'), 'stream');
    for (const [key, value] of Object.entries({ id: song.id, library: 'all', _sid: session.sid, SynoToken: session.token, version: '2' })) assert.equal(original.searchParams.get(key), value);
    assert.equal(original.searchParams.has('format'), false);
    const mp3 = new URL(client.streamSource(song, 'mp3').uri);
    assert.equal(mp3.pathname, '/webapi/AudioStation/stream.cgi/0.mp3');
    for (const [key, value] of Object.entries({ method: 'transcode', format: 'mp3', position: '0', id: song.id, library: 'all', version: '2', _sid: session.sid, SynoToken: session.token })) assert.equal(mp3.searchParams.get(key), value);
    assert.equal(mp3.searchParams.has('bitrate'), false, 'Do not promise an unverified bitrate');
    const changed = { ...session, apis: { 'SYNO.AudioStation.Stream': { path: 'custom/stream.cgi', minVersion: 2, maxVersion: 2, requestFormat: 'JSON' } } };
    const found = new URL(new api.SynologyClient(changed).streamSource(song, 'mp3').uri);
    assert.equal(found.pathname, '/webapi/custom/stream.cgi/0.mp3');
    assert.equal(JSON.parse(found.searchParams.get('format')), 'mp3');
    assert.equal(JSON.parse(found.searchParams.get('id')), song.id);
    const older = { ...session, apis: { 'SYNO.AudioStation.Stream': { path: 'AudioStation/stream.cgi', minVersion: 1, maxVersion: 1 } } };
    assert.throws(() => new api.SynologyClient(older).streamSource(song, 'mp3'), /v2/);
    assert.equal(new URL(new api.SynologyClient(older).streamSource(song).uri).searchParams.get('version'), '1');
  });
  await test('default original, stored MP3 restoration, corrupt value fallback, coalesced reads', async () => {
    for (const [stored, expected] of [[null, 'original'], ['mp3', 'mp3'], ['unknown', 'original']]) {
      const h = preferences('android', stored);
      await Promise.all([h.store.getState().load(), h.store.getState().load()]);
      assert.equal(h.store.getState().quality, expected);
      assert.equal(h.calls.length, 1);
      assert.equal(h.store.getState().ready, true);
      await h.store.getState().load(); assert.equal(h.calls.length, 1);
    }
  });
  await test('load completion cannot overwrite newer choice; native writes are serialized', async () => {
    const h = preferences('ios', 'mp3'), read = deferred();
    h.read = () => read.promise;
    const loading = h.store.getState().load();
    const choosing = h.store.getState().setQuality('original');
    await tick(); assert.equal(h.calls.filter(call => call[0] === 'set').length, 0);
    read.resolve(); await Promise.all([loading, choosing]);
    assert.equal(h.store.getState().quality, 'original'); assert.equal(h.value, 'original');
    const write = deferred(); h.write = value => value === 'mp3' ? write.promise : Promise.resolve();
    const first = h.store.getState().setQuality('mp3'), second = h.store.getState().setQuality('original');
    await tick(); assert.equal(h.store.getState().saving, true);
    write.resolve(); await Promise.all([first, second]);
    assert.equal(h.value, 'original'); assert.equal(h.store.getState().quality, 'original');
    assert.equal(h.store.getState().saving, false);
    assert.deepEqual(h.calls.filter(call => call[0] === 'set').map(call => call[2]), ['original', 'mp3', 'original']);
  });
  await test('read/write failure is visible; playback defaults to original; retry recovers', async () => {
    const h = preferences(); h.read = async () => { throw new Error('fixture read failure'); };
    await h.store.getState().load();
    assert.equal(h.store.getState().quality, 'original'); assert.ok(h.store.getState().error);
    assert.equal(h.store.getState().loading, false);
    h.read = async () => {}; await h.store.getState().load(); assert.equal(h.store.getState().error, null);
    h.write = async () => { throw new Error('fixture write failure'); };
    await assert.rejects(h.store.getState().setQuality('mp3'));
    assert.equal(h.store.getState().quality, 'original'); assert.equal(h.value, null);
    assert.ok(h.store.getState().error); assert.equal(h.store.getState().saving, false);
    h.write = async () => {}; await h.store.getState().setQuality('mp3');
    assert.equal(h.value, 'mp3'); assert.equal(h.store.getState().error, null);
    await assert.rejects(h.store.getState().setQuality('invalid'));
    assert.equal(h.value, 'mp3');
    assert.ok(h.calls.every(call => call[1] === 'yeongdumusic-streaming-quality-v1'), 'Never modify session credentials');
  });
  await test('web persists only the quality name without native SecureStore calls', async () => {
    const h = preferences('web', 'mp3'); await h.store.getState().load();
    assert.equal(h.store.getState().quality, 'mp3');
    await h.store.getState().setQuality('original'); assert.equal(h.value, 'original');
    assert.ok(h.calls.every(call => call[0].startsWith('web-')));
  });
  await test('repository restores quality before source load, ignores demo and rejects obsolete session', async () => {
    const h = preferences('android', 'mp3');
    const auth = { mode: 'nas', session, generation: 1 };
    const nas = repo(h, auth)();
    const source = new URL((await nas.streamSource(song)).uri);
    assert.equal(source.searchParams.get('method'), 'transcode');
    await h.store.getState().setQuality('original');
    assert.equal(new URL((await nas.streamSource(song)).uri).searchParams.get('method'), 'stream');
    const waiting = preferences('android', 'mp3'), read = deferred(); waiting.read = () => read.promise;
    const old = repo(waiting, auth)().streamSource(song);
    await tick(); auth.generation = 2; auth.session = { ...session, sid: 'new-fixture' };
    read.resolve(); await assert.rejects(old, /취소/);
    const demo = { streamSource: async () => ({ uri: 'mock-fixture' }) };
    const mock = preferences('android', 'mp3');
    assert.equal(repo(mock, { mode: 'mock' }, demo)(), demo);
    assert.equal(mock.calls.length, 0);
  });
  console.log('Streaming quality verified with actual API/repository/store and mocked storage. NAS transcoding, bitrate, native audio and UI are not exercised.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
