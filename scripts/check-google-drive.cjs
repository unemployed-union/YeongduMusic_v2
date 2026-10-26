/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const { create } = require('zustand');
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
function load(file, dependencies = {}, globals = {}) {
  const modules = { ...require('./test-cloud-fixtures.cjs').cloudFixtures(globals, dependencies), ...dependencies };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  new Function('require', 'exports', ...Object.keys(globals), code)(name => { if (name in modules) return modules[name]; if (name === 'zustand') return { create }; throw Error('Unexpected Drive dependency ' + name); }, exports, ...Object.values(globals));
  return exports;
}
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(check) { for (let i = 0; i < 100; i++) { if (check()) return; await tick(); } throw Error('Expected async step not reached'); }
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) });
const file = id => ({ id, name: id + '.mp3', mimeType: 'audio/mpeg', size: '1234', capabilities: { canDownload: true } });
function api(fetch, timers = {}) { return load('src/services/google-drive/api.ts', {}, { fetch, ...timers }); }
function timers() {
  const pending = new Map(); let sequence = 0;
  return { pending, setTimeout: (work, ms) => { pending.set(++sequence, { work, ms }); return sequence; }, clearTimeout: id => pending.delete(id),
    expire(ms) { const next = [...pending].find(([, item]) => item.ms === ms); assert(next, 'Expected deadline ' + ms); pending.delete(next[0]); next[1].work(); } };
}
function harness(saved = null, selection = new Map(), clock = {}, platform = 'android') {
  const h = { stored: saved, selection, calls: [], apiCalls: [], account: 'A', scopes: [SCOPE], nativeUser: null, token: 'fixture-token', pickResult: ['one', 'two'],
    tokenGate: null, signInGate: null, writeGate: null, fileGate: null, pickGate: null, metadataGate: null, failSelection: false, failWrite: false, revokeFails: false, missing: new Set() };
  const sdk = {
    configure(options) { h.options = options; assert.deepEqual(options.scopes, [SCOPE]); assert.equal(options.offlineAccess, false); },
    hasPlayServices: async () => true,
    signOut: async () => { h.calls.push('out'); h.nativeUser = null; },
    signIn: async () => { const account = h.account; h.calls.push('in'); if (h.signInGate) await h.signInGate.promise; if (account === 'cancel') return { type: 'cancelled' };
      h.nativeUser = { user: { id: account, email: account + '@example.invalid' }, scopes: [...h.scopes] }; return { type: 'success', data: h.nativeUser }; },
    signInSilently: async () => { h.calls.push('silent'); return h.nativeUser ? { type: 'success', data: h.nativeUser } : { type: 'noSavedCredentialFound' }; },
    getCurrentUser: () => h.nativeUser,
    getTokens: async () => { h.calls.push('sdk-token'); return { accessToken: h.token }; },
    clearCachedAccessToken: async token => { h.calls.push('clear:' + token); h.token = 'new-fixture-token'; },
    revokeAccess: async () => { h.calls.push('revoke'); if (h.revokeFails) throw Error('offline'); h.scopes = [SCOPE]; },
  };
  const storage = { getItem: async key => selection.get(key) ?? null,
    setItem: async (key, value) => { if (h.failSelection) throw Error('selection disk failure'); selection.set(key, value); }, removeItem: async key => { selection.delete(key); } };
  const selectionModule = load('src/services/google-drive/selection.ts', { 'expo-sqlite/kv-store': { __esModule: true, default: storage } });
  const client = api(async (url, options) => {
    h.apiCalls.push({ url, options }); if (h.fileGate) await h.fileGate.promise;
    const id = new URL(url).pathname.split('/').at(-1);
    return h.missing.has(id) ? response({}, 404) : response(file(id));
  });
  const mod = load('src/stores/google-drive.ts', {
    'react-native': { Platform: { OS: platform } },
    'expo-secure-store': { getItemAsync: async () => h.stored, deleteItemAsync: async () => { h.stored = null; },
      setItemAsync: async (_, value) => { h.calls.push('write'); if (h.failWrite) throw Error('secure disk failure'); if (h.writeGate) await h.writeGate.promise; h.stored = value; } },
    '@react-native-google-signin/google-signin': { GoogleSignin: sdk },
    '@/services/google-drive/config': { DRIVE_SCOPE: SCOPE, GOOGLE_WEB_CLIENT_ID: 'public-web-client', GOOGLE_IOS_CLIENT_ID: 'public-ios-client' },
    '@/services/google-drive/api': client, '@/services/google-drive/selection': selectionModule,
    '@/services/google-drive/picker': { driveFileAccessToken: async () => { h.calls.push('native-token'); if (h.tokenGate) await h.tokenGate.promise; return h.token; },
      pickDriveFileIds: async () => { h.calls.push('picker'); if (h.pickGate) await h.pickGate.promise; return h.pickResult; } },
    '@/services/google-drive/metadata': { enrichDriveSongs: async (songs, _token, _signal, publish) => { if (h.metadataGate) await h.metadataGate.promise; if (h.metadataSongs) publish(h.metadataSongs); return 0; } },
    '@/stores/playback': { usePlaybackStore: { setState: update => { h.playback = { ...h.playback, ...update(h.playback ?? { queue: [] }) }; } } },
  }, clock);
  return Object.assign(h, { store: mod.useGoogleDriveStore, source: mod.driveSource, sdk });
}
async function main() {
  assert.equal(load('src/services/google-drive/config.ts').DRIVE_SCOPE, SCOPE);
  const requests = [], rejected = [];
  const client = api(async (url, options) => { requests.push(new URL(url)); assert.equal(options.headers.Authorization, 'Bearer fixture'); return response(file(new URL(url).pathname.split('/').at(-1))); });
  const tracks = await client.loadDriveSongs('A', ['two', 'one', 'two'], async () => 'fixture');
  assert.deepEqual(tracks.map(song => song.drive.fileId), ['two', 'one']); assert.equal(requests.length, 2);
  assert(requests.every(url => !url.searchParams.has('q') && /\/files\/(one|two)$/.test(url.pathname)), 'There is no full-drive or recursive folder query');
  await assert.rejects(client.readDriveFile('../bad', async () => 'fixture'));
  for (const mimeType of ['application/vnd.google-apps.folder', 'application/vnd.google-apps.shortcut', 'image/png']) await assert.rejects(api(async () => response({ ...file('one'), name: 'not-music', mimeType })).readDriveFile('one', async () => 'fixture'));
  let attempts = 0;
  await api(async () => ++attempts === 1 ? response({}, 401) : response(file('one'))).readDriveFile('one', async old => { if (old) rejected.push(old); return old ? 'refreshed' : 'expired'; });
  assert.deepEqual(rejected, ['expired']); assert.equal(attempts, 2);
  const missing = [];
  const available = await api(async url => new URL(url).pathname.endsWith('/gone') ? response({}, 404) : response(file('one'))).loadDriveSongs('A', ['gone', 'one'], async () => 'fixture', undefined, ids => missing.push(...ids));
  assert.equal(available.length, 1); assert.deepEqual(missing, ['gone']);
  const clock = timers(), body = deferred(), slow = api(async () => ({ ok: true, status: 200, text: () => body.promise }), clock);
  const waiting = slow.readDriveFile('one', async () => 'fixture'); const observed = waiting.catch(error => error); await tick(); clock.expire(15000);
  assert.match((await observed).message, /초과/); body.resolve('{}');
  const identityScopes = ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile'];
  const bridgeState = { accessToken: 'picker-fixture-token', fileIds: ['one', 'two', 'one'], scopes: [SCOPE, ...identityScopes] };
  let bridge = bridgeState, email = 'A@example.invalid', nativeAvailable = true;
  const picker = load('src/services/google-drive/picker.ts', {
    expo: { requireOptionalNativeModule: () => nativeAvailable ? { pick: async () => bridge, token: async () => bridge } : null },
    'react-native': { Platform: { OS: 'android' } }, './config': { DRIVE_SCOPE: SCOPE },
    './api': { driveJson: async () => ({ user: { emailAddress: email } }) },
  });
  assert.deepEqual(await picker.pickDriveFileIds(email), ['one', 'two']);
  assert.equal(await picker.driveFileAccessToken(email), bridgeState.accessToken, 'Sign-in scopes do not invalidate file access tokens');
  bridge = { ...bridgeState, scopes: [SCOPE, SCOPE] }; assert.equal(await picker.driveFileAccessToken(email), bridgeState.accessToken);
  bridge = { ...bridgeState, scopes: identityScopes }; await assert.rejects(picker.driveFileAccessToken(email), /권한/);
  bridge = { ...bridgeState, scopes: [SCOPE, null] }; await assert.rejects(picker.driveFileAccessToken(email), /권한/);
  bridge = bridgeState;
  email = 'B@example.invalid'; await assert.rejects(picker.pickDriveFileIds('A@example.invalid'), /계정/); email = 'A@example.invalid';
  bridge = { ...bridgeState, scopes: [SCOPE, 'https://www.googleapis.com/auth/drive'] }; await assert.rejects(picker.pickDriveFileIds(email));
  bridge = { ...bridgeState, fileIds: ['../bad'] }; await assert.rejects(picker.pickDriveFileIds(email));
  bridge = null; assert.equal(await picker.pickDriveFileIds(email), null); nativeAvailable = false; await assert.rejects(picker.pickDriveFileIds(email), /네이티브 빌드/);
  const legacy = harness(JSON.stringify({ id: 'A', email, accessToken: 'old-wide-token', folders: [{ id: 'old-folder', name: 'Old' }] }));
  await legacy.store.getState().bootstrap(); assert.equal(legacy.store.getState().account, null); assert.match(legacy.store.getState().error, /권한이 변경/);
  assert(!legacy.calls.includes('silent'), 'Legacy broad authorization is never restored silently');
  const h = harness(); await h.store.getState().connect();
  assert.equal(h.store.getState().account.id, 'A'); assert.equal(h.apiCalls.length, 0, 'Connecting does not scan the Drive');
  assert.equal(JSON.parse(h.stored).scope, SCOPE); assert(h.calls.includes('native-token')); assert(!h.calls.includes('sdk-token'));
  const signedIn = harness(); signedIn.scopes = [SCOPE, ...identityScopes]; await signedIn.store.getState().connect();
  assert.equal(signedIn.store.getState().account.id, 'A'); assert(!signedIn.calls.includes('revoke'), 'Valid sign-in scopes do not trigger grant revocation');
  await h.store.getState().pickFiles(); assert.equal(h.store.getState().files.length, 2); assert.equal(h.store.getState().songs.length, 2);
  assert.equal(JSON.parse(h.stored).files, undefined, 'The file list is not squeezed into SecureStore');
  assert.equal(h.selection.size, 1); assert(![...h.selection.values()][0].includes(h.token), 'The SQLite selection contains no credentials');
  const tokenCalls = h.calls.filter(call => call === 'native-token').length, writes = h.calls.filter(call => call === 'write').length;
  await Promise.all(Array.from({ length: 30 }, () => h.store.getState().accessToken('A')));
  assert.equal(h.calls.filter(call => call === 'native-token').length, tokenCalls); assert.equal(h.calls.filter(call => call === 'write').length, writes, 'Metadata reads reuse an in-memory token');
  const song = h.store.getState().songs[0]; assert.equal((await h.source(song)).headers.Authorization, 'Bearer fixture-token');
  await h.store.getState().accessToken('A', 'fixture-token'); assert(h.calls.includes('clear:fixture-token')); assert.equal((await h.source(song)).headers.Authorization, 'Bearer new-fixture-token');
  const restored = harness(h.stored, h.selection); restored.nativeUser = h.nativeUser; await restored.store.getState().bootstrap();
  assert.deepEqual(restored.store.getState().files.map(item => item.id), ['one', 'two']);
  h.failSelection = true; await assert.rejects(h.store.getState().selectFiles([{ id: 'two', name: 'two.mp3' }])); h.failSelection = false;
  assert.equal(h.store.getState().files.length, 2, 'Failed selection saves retain the library');
  h.pickResult = null; await h.store.getState().pickFiles(); assert.equal(h.store.getState().files.length, 2, 'Canceling Google Picker keeps the selection');
  h.missing.add('one'); await h.store.getState().refresh(); assert.equal(h.store.getState().songs.length, 1); assert.match(h.store.getState().error, /1개/);
  await h.store.getState().selectFiles([]); assert.deepEqual(h.store.getState().files, []); await assert.rejects(h.source(song), /선택한 음악/);
  await h.store.getState().disconnect(); assert.equal(h.stored, null); assert(h.calls.includes('revoke'));
  const wide = harness(); wide.scopes = ['https://www.googleapis.com/auth/drive']; await wide.store.getState().connect();
  assert(wide.calls.includes('revoke')); assert.equal(wide.store.getState().account.id, 'A', 'Old grants are revoked and the file scope is requested again');
  const ios = harness(null, new Map(), {}, 'ios'); await ios.store.getState().connect(); assert(ios.calls.includes('sdk-token')); assert.equal(ios.options.iosClientId, 'public-ios-client');
  const race = harness(); race.signInGate = deferred(); const old = race.store.getState().connect(); await until(() => race.calls.includes('in'));
  race.account = 'B'; const newer = race.store.getState().connect(); race.signInGate.resolve(); await Promise.all([old, newer]);
  assert.equal(race.store.getState().account.id, 'B'); assert.equal(JSON.parse(race.stored).id, 'B');
  const cancel = harness(); await cancel.store.getState().connect(); cancel.pickGate = deferred(); const picking = cancel.store.getState().pickFiles(); await until(() => cancel.calls.includes('picker'));
  cancel.store.getState().cancelConnection(); assert.equal(cancel.store.getState().busy, false); cancel.pickGate.resolve(); await picking;
  assert.deepEqual(cancel.store.getState().files, []); assert.equal(cancel.selection.size, 0, 'Late native Picker results cannot publish a canceled selection');
  const writeRace = harness(); writeRace.writeGate = deferred(); const writing = writeRace.store.getState().connect(); await until(() => writeRace.calls.includes('write'));
  writeRace.store.getState().cancelConnection(); writeRace.writeGate.resolve(); await writing; await tick(); assert.equal(writeRace.stored, null);
  const timeout = timers(), stalled = harness(null, new Map(), timeout); stalled.tokenGate = deferred(); const pending = stalled.store.getState().connect(); await until(() => stalled.calls.includes('native-token'));
  timeout.expire(60000); await pending; assert.equal(stalled.store.getState().busy, false); assert.match(stalled.store.getState().error, /초과/);
  const callsBefore = stalled.calls.length, retry = stalled.store.getState().connect(); await until(() => stalled.store.getState().progress === '이전 인증 요청 종료 대기');
  assert.equal(stalled.calls.length, callsBefore); timeout.expire(30000); await retry; stalled.tokenGate.resolve(); await tick(); assert.equal(stalled.stored, null);
  const disk = new Map(), gate = deferred(); let current = true, slowWrite = false;
  const selection = load('src/services/google-drive/selection.ts', { 'expo-sqlite/kv-store': { __esModule: true, default: {
    getItem: async key => disk.get(key) ?? null, setItem: async (key, value) => { disk.set(key, value); if (slowWrite) await gate.promise; }, removeItem: async key => { disk.delete(key); },
  } } });
  const many = Array.from({ length: 1000 }, (_, i) => ({ id: 'song-' + i, name: 'Track ' + i }));
  await selection.saveDriveSelection('A', many, () => current); assert.equal((await selection.loadDriveSelection('A')).length, 1000);
  assert.deepEqual(await selection.loadDriveSelection('B'), []);
  slowWrite = true; const late = selection.saveDriveSelection('A', [], () => current); await tick(); current = false; gate.resolve(); await late;
  assert.equal((await selection.loadDriveSelection('A')).length, 1000, 'Canceled disk writes restore the previous file selection');
  await checkFileEditor();
  console.log('PASS: drive.file-only authorization; explicit reads, 401/404/timeouts; Picker account/scope checks; legacy grant migration; selection/restart; token cache; cancellation/write barriers and file editor. Native consent and playback require device verification.');
}
async function checkFileEditor() {
  const jsx = (type, props) => ({ type, props }), slots = [], refs = []; let slot = 0, ref = 0, closed = 0, saved;
  const state = { files: [{ id: 'one', name: 'One' }, { id: 'two', name: 'Two' }], fileSaving: false, selectFiles: async files => { saved = files; } };
  const store = Object.assign(select => select(state), { getState: () => state });
  const Editor = load('src/features/google-drive/file-picker.tsx', {
    react: { useState: initial => { const i = slot++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; }, useRef: initial => refs[ref++] ??= { current: initial } },
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': { View: 'View', FlatList: 'List', Pressable: 'Button' },
    '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Icon' }, '@/components/text': { Text: 'Text' },
    '@/features/playlists/dialogs': { PlaylistSheet: 'Sheet' }, '@/stores/google-drive': { useGoogleDriveStore: store }, '@/theme/tokens': { useColors: () => ({}) },
  }).DriveFilePicker;
  const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
  const render = () => { slot = 0; ref = 0; return Editor({ onClose: () => { closed++; } }); };
  let tree = render(); assert.equal(saved, undefined); const list = nodes(tree).find(node => node.type === 'List');
  list.props.renderItem({ item: state.files[0] }).props.onPress(); tree = render();
  nodes(tree).find(node => node.type === 'Button').props.onPress(); await tick(); assert.deepEqual(saved, [state.files[1]]); assert.equal(closed, 1);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
