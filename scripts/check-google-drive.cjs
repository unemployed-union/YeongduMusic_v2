/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));
const { create } = require(path.join(root, 'node_modules/zustand'));
function load(file, modules = {}, globals = {}) {
  modules = { ...require('./test-cloud-fixtures.cjs').cloudFixtures(globals, modules), ...modules };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', ...Object.keys(globals), code)(name => {
    if (name in modules) return modules[name];
    if (name === 'zustand') return { create };
    throw Error('Unexpected dependency ' + name);
  }, mod, mod.exports, ...Object.values(globals));
  return mod.exports;
}
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(check) { for (let i = 0; i < 80; i++) { if (check()) return; await tick(); } throw Error('Asynchronous step not reached'); }
function deferred() { let resolve; const promise = new Promise(ok => { resolve = ok; }); return { promise, resolve }; }
function response(value, status = 200) { return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(value) }; }
const file = (id, name = 'Song.mp3') => ({ id, name, mimeType: 'audio/mpeg', size: '1234', capabilities: { canDownload: true } });
const folder = (id = 'music', name = 'Music') => ({ id, name, mimeType: 'application/vnd.google-apps.folder', trashed: false });
function api(fetch, timers = {}, defaultFolder = true) {
  return load('src/services/google-drive/api.ts', {}, { fetch: (url, options) => defaultFolder && new URL(url).searchParams.get('fields') === 'id,name,mimeType,trashed'
    ? Promise.resolve(response(folder(new URL(url).pathname.split('/').at(-1)))) : fetch(url, options), ...timers });
}
function harness(saved = null, platform = 'android', iosId, webId = 'public-fixture', timers = {}) {
  const h = { stored: saved, nativeUser: null, calls: [], selection: 'A', token: 'fixture-token', signInGate: null, tokenGate: null, writeGate: null, writeFails: false, silentGate: null, deleteFails: false, revokeFails: false, listGate: null, signInError: null, configureError: null, options: null };
  const sdk = {
    configure: options => { h.calls.push('configure'); if (h.configureError) throw h.configureError; h.options = options; assert.deepEqual(options.scopes, ['https://www.googleapis.com/auth/drive.readonly']); assert.equal(options.offlineAccess, false); },
    hasPlayServices: async () => true,
    signOut: async () => { h.calls.push('out'); h.nativeUser = null; },
    signIn: async () => { h.calls.push('in'); if (h.signInError) throw h.signInError; const account = h.selection; if (h.signInGate) await h.signInGate.promise; if (account === 'cancel') return { type: 'cancelled' }; h.nativeUser = { user: { id: account, email: 'fixture@example.invalid' } }; return { type: 'success', data: h.nativeUser }; },
    signInSilently: async () => { h.calls.push('silent'); if (h.silentGate) await h.silentGate.promise; return h.nativeUser ? { type: 'success', data: h.nativeUser } : { type: 'noSavedCredentialFound' }; },
    getCurrentUser: () => h.nativeUser,
    getTokens: async () => { h.calls.push('tokens'); if (h.tokenGate) await h.tokenGate.promise; return { accessToken: h.token, idToken: platform === 'android' ? null : 'not-for-drive' }; },
    clearCachedAccessToken: async token => { h.calls.push('clear:' + token); h.token = 'refreshed-fixture'; },
    revokeAccess: async () => { h.calls.push('revoke'); if (h.revokeFails) throw Error('offline'); },
  };
  const secure = {
    getItemAsync: async () => h.stored,
    setItemAsync: async (_, value) => { h.calls.push('write'); if (h.writeFails) throw Error('disk failure'); if (h.writeGate) await h.writeGate.promise; h.stored = value; },
    deleteItemAsync: async () => { h.calls.push('delete'); if (h.deleteFails) throw Error('disk failure'); h.stored = null; },
  };
  h.api = api(async url => {
    assert.equal(new URL(url).hostname, 'www.googleapis.com');
    if (new URL(url).searchParams.get('fields').startsWith('id,')) return response({ id: new URL(url).pathname.split('/').at(-1), capabilities: { canDownload: true } });
    const files = h.listFiles ?? [file('song')];
    if (h.listGate) await h.listGate.promise;
    return response({ files });
  });
  h.module = load('src/stores/google-drive.ts', {
    'expo-secure-store': secure, 'react-native': { Platform: { OS: platform } },
    '@/services/google-drive/config': { DRIVE_SCOPE: 'https://www.googleapis.com/auth/drive.readonly', GOOGLE_WEB_CLIENT_ID: webId, GOOGLE_IOS_CLIENT_ID: iosId },
    '@/services/google-drive/api': h.api,
    '@/services/google-drive/metadata': { enrichDriveSongs: async (songs, token, signal, publish) => {
      if (h.metadataGate) await h.metadataGate.promise;
      if (h.metadataSongs) publish(h.metadataSongs);
      return 0;
    } },
    '@/stores/playback': { usePlaybackStore: { setState: update => { h.playback = { ...h.playback, ...update(h.playback ?? { queue: [] }) }; } } },
    '@react-native-google-signin/google-signin': { GoogleSignin: sdk },
  }, timers);
  h.store = h.module.useGoogleDriveStore;
  return h;
}
async function main() {
  const calls = [], rejected = [];
  const client = api(async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer fixture'); calls.push(new URL(url));
    return response(calls.length === 1 ? { files: [file('one'), { ...file('no-download'), capabilities: { canDownload: false } }], nextPageToken: 'page2' }
      : { files: [file('one'), { ...file('two', 'Lossless.flac'), mimeType: 'application/octet-stream' }, { ...file('not-audio', 'image.png'), mimeType: 'image/png' }] });
  });
  const tracks = await client.loadDriveSongs('A', ['music'], async () => 'fixture');
  assert.equal(tracks.length, 2); assert.equal(tracks[1].title, 'Lossless'); assert.equal(tracks[0].source, 'drive');
  assert.equal(calls[1].searchParams.get('pageToken'), 'page2'); assert.equal(calls[0].searchParams.get('pageSize'), '200');
  assert.match(calls[0].searchParams.get('q'), /trashed = false/); assert.ok(!calls[0].href.includes('fixture'));
  assert.ok(calls.every(url => url.searchParams.get('q').includes("'music' in parents")));
  assert.notEqual(tracks[0].id, 'one');
  assert.ok(client.driveMediaUrl('unsafe/id').endsWith('/unsafe%2Fid?alt=media'));
  let attempts = 0;
  const refreshed = api(async (_, options) => { attempts++; return attempts === 1 ? response({}, 401) : response({ files: [] }); });
  await refreshed.loadDriveSongs('A', ['music'], async old => { if (old) rejected.push(old); return old ? 'new' : 'old'; });
  assert.equal(attempts, 2); assert.deepEqual(rejected, ['old']);
  for (const status of [403, 404, 429, 520]) await assert.rejects(api(async () => response({}, status)).loadDriveSongs('A', ['music'], async () => 'fixture'), error => error.status === status);
  await assert.rejects(api(async () => response({ files: null })).loadDriveSongs('A', ['music'], async () => 'fixture'), /예상하지/);
  await assert.rejects(api(async () => ({ ok: true, status: 200, text: async () => 'not JSON' })).loadDriveSongs('A', ['music'], async () => 'fixture'), /응답/);
  await assert.rejects(api(async () => response({ files: [], nextPageToken: 'repeated' })).loadDriveSongs('A', ['music'], async () => 'fixture'), /반복/);
  let timer, clears = 0;
  const body = deferred(), header = deferred();
  const slow = api(async () => { header.resolve(); return { ok: true, status: 200, text: () => body.promise }; }, { setTimeout: callback => { timer = callback; return 1; }, clearTimeout: () => { clears++; } });
  const delayed = slow.driveJson('https://www.googleapis.com/drive/v3/files', async () => 'fixture');
  const observed = delayed.catch(error => error); await header.promise; timer(); assert.match((await observed).message, /초과/); assert.equal(clears, 1); body.resolve('{}');
  const abort = new AbortController(); const blocked = deferred();
  const cancelled = api(async () => blocked.promise).driveJson('https://www.googleapis.com/drive/v3/files', async () => 'fixture', abort.signal);
  const cancelledResult = cancelled.catch(error => error); abort.abort(); assert.match((await cancelledResult).message, /취소/); blocked.resolve(response({}));
  let sent = 0; const before = new AbortController(); before.abort();
  await assert.rejects(api(async () => { sent++; return response({}); }).driveJson('https://www.googleapis.com/drive/v3/files', async () => 'fixture', before.signal), /취소/); assert.equal(sent, 0);
  console.log('PASS: actual Drive API: paginated read-only list, file filtering/deduplication, account IDs, header-only tokens, 401 refresh/retry, HTTP/JSON/schema errors, repeated pages and body timeout/cancellation.');

  const scopedCalls = [];
  const scoped = api(async url => {
    const request = new URL(url); scopedCalls.push(request);
    if (!request.searchParams.has('q')) return response(folder('music'));
    const q = request.searchParams.get('q');
    assert.match(q, /in parents/, 'Every list must have a parent constraint');
    if (q.startsWith("'music' in parents")) return response(request.searchParams.has('pageToken')
      ? { files: [file('top'), file('second'), folder('child')] }
      : { files: [file('top'), folder('child'), { ...folder('shortcut'), mimeType: 'application/vnd.google-apps.shortcut' }], nextPageToken: 'next' });
    assert.ok(q.startsWith("'child' in parents"), 'Must never list outside the selected subtree');
    return response({ files: [file('nested'), folder('music'), file('top')] }); // Duplicate and cyclic folder metadata.
  }, {}, false);
  const scopedSongs = await scoped.loadDriveSongs('A', ['music'], async () => 'fixture');
  assert.deepEqual(scopedSongs.map(song => song.drive.fileId), ['top', 'second', 'nested']);
  assert.equal(scopedCalls.length, 4, 'Folder metadata + two root pages + one child page');
  const multiLists = [], multiLookups = [];
  const multi = api(async url => {
    const request = new URL(url), id = request.pathname.split('/').at(-1);
    if (!request.searchParams.has('q')) { multiLookups.push(id); return response(folder(id)); }
    const parent = request.searchParams.get('q').match(/^'([^']+)' in parents/)[1];
    multiLists.push(parent);
    const pages = {
      music: [file('shared'), folder('child')],
      other: [file('other-song'), file('shared'), folder('grandchild')],
      child: [file('nested'), folder('grandchild')],
      grandchild: [file('deep')],
    };
    assert.ok(parent in pages, 'Multiple selection must remain scoped to selected trees');
    return response({ files: pages[parent] });
  }, {}, false);
  const multiSongs = await multi.loadDriveSongs('A', ['music', 'other', 'child', 'music'], async () => 'fixture');
  assert.deepEqual(multiLookups, ['music', 'other', 'child'], 'Duplicate selections need only one validation');
  assert.deepEqual(multiLists, ['music', 'other', 'child', 'grandchild'], 'Selected descendants and shared subfolders are scanned once');
  assert.deepEqual(multiSongs.map(song => song.drive.fileId), ['shared', 'other-song', 'nested', 'deep']);
  let invalidLists = 0;
  await assert.rejects(api(async url => {
    const request = new URL(url);
    if (request.searchParams.has('q')) { invalidLists++; return response({ files: [] }); }
    return request.pathname.endsWith('/deleted') ? response({}, 404) : response(folder('music'));
  }, {}, false).loadDriveSongs('A', ['music', 'deleted'], async () => 'fixture'), error => error.status === 404);
  assert.equal(invalidLists, 0, 'All selected roots must be valid before publishing a combined library');
  let unselectedRequests = 0;
  await assert.rejects(api(async () => { unselectedRequests++; return response({}); }).loadDriveSongs('A', [], async () => 'fixture'), /폴더를 선택/);
  assert.equal(unselectedRequests, 0);
  for (const data of [{ ...folder(), trashed: true }, { ...folder(), mimeType: 'audio/mpeg' }]) {
    let lookup = 0;
    await assert.rejects(api(async () => { lookup++; return response(data); }, {}, false).loadDriveSongs('A', ['music'], async () => 'fixture'), /폴더/);
    assert.equal(lookup, 1, 'Invalid selection must not fall back to whole Drive');
  }
  await assert.rejects(api(async () => response({}, 404), {}, false).loadDriveSongs('A', ['music'], async () => 'fixture'), error => error.status === 404);
  const browsed = [];
  const browse = api(async url => { browsed.push(new URL(url)); return response({ files: [folder('child'), file('ignored')], nextPageToken: 'folders2' }); });
  const browsePage = await browse.loadDriveFolderPage('root', async () => 'fixture');
  assert.deepEqual(browsePage.folders, [{ id: 'child', name: 'Music' }]); assert.equal(browsePage.nextPageToken, 'folders2');
  await browse.loadDriveFolderPage("folder'\\id", async () => 'fixture', undefined, 'folders2');
  assert.ok(browsed[1].searchParams.get('q').includes("'folder\\'\\\\id' in parents"));
  assert.equal(browsed[1].searchParams.get('pageToken'), 'folders2');
  assert.match(browsed[0].searchParams.get('q'), /mimeType = 'application\/vnd.google-apps.folder'/);
  const traversalAbort = new AbortController(); let traversed = 0;
  const interrupted = api(async () => { traversed++; traversalAbort.abort(); return response({ files: [folder('child')] }); });
  await assert.rejects(interrupted.loadDriveSongs('A', ['music'], async () => 'fixture', traversalAbort.signal), /취소/);
  assert.equal(traversed, 1, 'Cancelled traversal must not fetch descendants');
  console.log('PASS: parent-scoped recursive library, folder/page deduplication, no global fallback, deleted/invalid folder, paginated folder browser, query escaping and traversal cancellation.');

  const h = harness(); await h.store.getState().bootstrap(); assert.equal(h.store.getState().account, null); assert.equal(h.calls.includes('in'), false);
  await h.store.getState().connect(); assert.equal(h.store.getState().account.id, 'A'); assert.equal(h.store.getState().songs.length, 0);
  assert.deepEqual(h.store.getState().folders, [], 'Login must not scan the entire Drive');
  await h.store.getState().selectFolders([{ id: 'music', name: 'Music' }]); assert.equal(h.store.getState().songs.length, 1);
  assert.equal(JSON.parse(h.stored).folders[0].id, 'music');
  assert.equal(JSON.parse(h.stored).accessToken, 'fixture-token');
  assert.equal('idToken' in JSON.parse(h.stored), false);
  assert.ok(!('webClientId' in h.options), 'Android does not request an unused backend ID token');
  assert.ok(!('iosClientId' in h.options));
  const noWebId = harness(null, 'android', undefined, ''); await noWebId.store.getState().connect();
  assert.equal(noWebId.store.getState().account.id, 'A'); assert.equal(noWebId.store.getState().error, null);
  assert.equal(JSON.parse(noWebId.stored).accessToken, 'fixture-token');
  const oauthFailure = harness(); oauthFailure.signInError = { code: '10' }; await oauthFailure.store.getState().connect();
  assert.equal(oauthFailure.store.getState().account, null); assert.equal(oauthFailure.stored, null);
  assert.match(oauthFailure.store.getState().error, /코드 10/); assert.match(oauthFailure.store.getState().error, /같은 Google Cloud 프로젝트/);
  const configureFailure = harness(); configureFailure.configureError = { code: '10' }; await configureFailure.store.getState().connect();
  assert.match(configureFailure.store.getState().error, /코드 10/, 'Configuration errors are not misreported as missing native modules');
  const noIosId = harness(null, 'ios'); await noIosId.store.getState().connect(); assert.match(noIosId.store.getState().error, /클라이언트 ID/);
  const ios = harness(null, 'ios', 'public-ios-fixture'); await ios.store.getState().connect(); assert.equal(ios.store.getState().account.id, 'A');
  assert.equal(ios.options.webClientId, 'public-fixture'); assert.equal(ios.options.iosClientId, 'public-ios-fixture');
  const web = harness(null, 'web'); await web.store.getState().connect(); assert.match(web.store.getState().error, /Android\/iOS/);
  const noWrite = harness(); noWrite.writeFails = true; await noWrite.store.getState().connect(); assert.equal(noWrite.store.getState().account, null); assert.equal(noWrite.stored, null);
  const source = await h.module.driveSource(h.store.getState().songs[0]); assert.equal(source.headers.Authorization, 'Bearer fixture-token'); assert.ok(!source.uri.includes('fixture-token'));
  const metadataGate = deferred(); h.metadataGate = metadataGate;
  h.playback = { queue: [h.store.getState().songs[0]], position: 42, playing: true, index: 0 };
  h.metadataSongs = [{ ...h.playback.queue[0], title: 'Tagged title', artworkUrl: 'file:///cache/cover.jpg' }];
  await h.store.getState().refresh();
  assert.equal(h.store.getState().loading, false, 'Browsing must not wait for tag reads');
  assert.equal(h.store.getState().metadataLoading, true);
  metadataGate.resolve(); await until(() => !h.store.getState().metadataLoading);
  assert.equal(h.playback.queue[0].title, 'Tagged title'); assert.equal(h.playback.position, 42); assert.equal(h.playback.playing, true);
  h.metadataGate = null; h.metadataSongs = null;
  const staleMetadata = harness(); await staleMetadata.store.getState().connect();
  await staleMetadata.store.getState().selectFolders([{ id: 'music', name: 'Music' }]);
  const staleGate = deferred(); staleMetadata.metadataGate = staleGate;
  staleMetadata.metadataSongs = [{ ...staleMetadata.store.getState().songs[0], title: 'Old account metadata' }];
  await staleMetadata.store.getState().refresh();
  await staleMetadata.store.getState().disconnect();
  staleGate.resolve(); await tick(); await tick();
  assert.equal(staleMetadata.store.getState().metadataLoading, false);
  assert.equal(staleMetadata.store.getState().account, null); assert.deepEqual(staleMetadata.store.getState().songs, []);
  assert.equal(staleMetadata.playback, undefined, 'Old metadata cannot update a queue after disconnect');
  await h.module.driveSource(h.store.getState().songs[0], true); assert.equal(h.calls.some(call => call.startsWith('clear:')), true);
  const restored = harness(h.stored); restored.nativeUser = h.nativeUser; await restored.store.getState().bootstrap(); assert.equal(restored.store.getState().account.id, 'A');
  assert.equal(restored.store.getState().folders[0].id, 'music'); assert.equal(restored.store.getState().songs.length, 1);
  const oldFolder = harness(JSON.stringify({ id: 'A', email: 'fixture@example.invalid', folder: { id: 'music', name: 'Old Music' } })); oldFolder.nativeUser = h.nativeUser;
  await oldFolder.store.getState().bootstrap();
  assert.equal(oldFolder.store.getState().folders[0].id, 'music'); assert.equal(oldFolder.store.getState().songs.length, 1);
  assert.deepEqual(JSON.parse(oldFolder.stored).folders, [{ id: 'music', name: 'Old Music' }]);
  assert.equal('folder' in JSON.parse(oldFolder.stored), false, 'Legacy selection is rewritten in the new format');
  const several = harness(); await several.store.getState().connect();
  await several.store.getState().selectFolders([{ id: 'music', name: 'One' }, { id: 'other', name: 'Two' }, { id: 'music', name: 'Duplicate' }]);
  assert.deepEqual(several.store.getState().folders.map(item => item.id), ['music', 'other']);
  assert.equal(several.store.getState().songs.length, 1, 'The same file from multiple folders is deduplicated');
  const severalRestored = harness(several.stored); severalRestored.nativeUser = several.nativeUser;
  await severalRestored.store.getState().bootstrap();
  assert.deepEqual(severalRestored.store.getState().folders.map(item => item.id), ['music', 'other']);
  await severalRestored.store.getState().accessToken('A', 'fixture-token');
  assert.deepEqual(JSON.parse(severalRestored.stored).folders.map(item => item.id), ['music', 'other']);
  await severalRestored.store.getState().selectFolders([{ id: 'other', name: 'Two' }]);
  assert.deepEqual(JSON.parse(severalRestored.stored).folders.map(item => item.id), ['other']);
  await severalRestored.store.getState().selectFolders([]);
  assert.deepEqual(severalRestored.store.getState().folders, []); assert.deepEqual(severalRestored.store.getState().songs, []);
  assert.deepEqual(JSON.parse(severalRestored.stored).folders, []);
  const emptyRestored = harness(severalRestored.stored); emptyRestored.nativeUser = severalRestored.nativeUser;
  await emptyRestored.store.getState().bootstrap(); assert.deepEqual(emptyRestored.store.getState().songs, []);
  const savedSeveral = several.stored, songsBeforeFailure = several.store.getState().songs;
  several.writeFails = true;
  await assert.rejects(several.store.getState().selectFolders([{ id: 'new', name: 'New' }, { id: 'other', name: 'Two' }]));
  assert.equal(several.stored, savedSeveral); assert.equal(several.store.getState().songs, songsBeforeFailure);
  assert.deepEqual(several.store.getState().folders.map(item => item.id), ['music', 'other']);
  several.writeFails = false;
  await assert.rejects(several.store.getState().selectFolders([{ id: 'root', name: 'All Drive' }]), /폴더 정보/);
  for (const folders of [null, {}, [null], [{ id: '', name: 'Invalid' }]]) {
    const malformed = harness(JSON.stringify({ id: 'A', email: 'fixture@example.invalid', folders })); malformed.nativeUser = h.nativeUser;
    await malformed.store.getState().bootstrap(); assert.equal(malformed.store.getState().account, null); assert.match(malformed.store.getState().error, /폴더 정보/);
  }
  console.log('PASS: multiple roots/overlapping descendants, combined file deduplication, deleted root isolation, persisted multi-selection/token refresh, single-folder migration, remove/clear/restart and failed-write preservation.');
  const legacy = harness(JSON.stringify({ id: 'A', email: 'fixture@example.invalid' })); legacy.nativeUser = h.nativeUser;
  await legacy.store.getState().bootstrap(); assert.deepEqual(legacy.store.getState().folders, []); assert.equal(legacy.store.getState().songs.length, 0);
  const oldPage = deferred(); h.listGate = oldPage; h.listFiles = [file('old-song')];
  const oldRefresh = h.store.getState().refresh(); await until(() => h.store.getState().loading);
  h.listGate = null; h.listFiles = [file('new-song')];
  await h.store.getState().selectFolders([{ id: 'new-folder', name: 'New Music' }]); oldPage.resolve(); await oldRefresh;
  assert.equal(h.store.getState().folders[0].id, 'new-folder'); assert.equal(JSON.parse(h.stored).folders[0].id, 'new-folder');
  assert.deepEqual(h.store.getState().songs.map(song => song.drive.fileId), ['new-song']);
  await h.store.getState().accessToken('A'); assert.equal(JSON.parse(h.stored).folders[0].id, 'new-folder', 'Token refresh preserves selection');
  h.writeFails = true;
  await assert.rejects(h.store.getState().selectFolders([{ id: 'failed-folder', name: 'Failed' }]));
  assert.equal(h.store.getState().folders[0].id, 'new-folder'); assert.equal(JSON.parse(h.stored).folders[0].id, 'new-folder'); h.writeFails = false;
  const lateBootstrap = harness(h.stored); lateBootstrap.nativeUser = h.nativeUser; lateBootstrap.silentGate = deferred();
  const restoring = lateBootstrap.store.getState().bootstrap(); await until(() => lateBootstrap.calls.includes('silent'));
  const leaving = lateBootstrap.store.getState().disconnect(); lateBootstrap.silentGate.resolve(); await Promise.all([restoring, leaving]);
  assert.equal(lateBootstrap.store.getState().account, null); assert.equal(lateBootstrap.stored, null);
  const mismatch = harness(h.stored); mismatch.nativeUser = { user: { id: 'B', email: 'fixture@example.invalid' } }; await mismatch.store.getState().bootstrap(); assert.equal(mismatch.store.getState().account, null);
  await h.store.getState().disconnect(); assert.equal(h.store.getState().account, null); assert.equal(h.stored, null); assert.equal(h.store.getState().songs.length, 0);
  assert.deepEqual(h.store.getState().folders, []);
  await assert.rejects(h.module.driveSource(tracks[0]), /변경/);
  const cancelledSignIn = harness(); cancelledSignIn.selection = 'cancel'; await cancelledSignIn.store.getState().connect(); assert.equal(cancelledSignIn.store.getState().account, null); assert.equal(cancelledSignIn.stored, null);
  const old = harness(); old.signInGate = deferred(); const login = old.store.getState().connect(); await until(() => old.calls.includes('in'));
  const logout = old.store.getState().disconnect(); old.signInGate.resolve(); await Promise.all([login, logout]); assert.equal(old.store.getState().account, null); assert.equal(old.stored, null);
  const race = harness(); race.writeGate = deferred(); const first = race.store.getState().connect(); await until(() => race.calls.includes('write'));
  race.selection = 'B'; const newer = race.store.getState().connect(); race.writeGate.resolve(); await Promise.all([first, newer]); assert.equal(race.store.getState().account.id, 'B'); assert.equal(JSON.parse(race.stored).id, 'B');
  const folderRace = harness(); await folderRace.store.getState().connect(); const previousWrites = folderRace.calls.filter(call => call === 'write').length;
  folderRace.writeGate = deferred(); const selectingOldFolder = folderRace.store.getState().selectFolders([{ id: 'old-account-folder', name: 'Old Account' }]);
  await until(() => folderRace.calls.filter(call => call === 'write').length > previousWrites);
  folderRace.selection = 'B'; const changingAccount = folderRace.store.getState().connect(); folderRace.writeGate.resolve();
  await Promise.all([selectingOldFolder, changingAccount]);
  assert.equal(folderRace.store.getState().account.id, 'B'); assert.deepEqual(folderRace.store.getState().folders, []);
  assert.equal(JSON.parse(folderRace.stored).id, 'B'); assert.deepEqual(JSON.parse(folderRace.stored).folders ?? [], []);
  const delayedList = harness(); await delayedList.store.getState().connect(); delayedList.listGate = deferred(); const listing = delayedList.store.getState().selectFolders([{ id: 'music', name: 'Music' }]); await until(() => delayedList.store.getState().loading);
  await delayedList.store.getState().disconnect(); delayedList.listGate.resolve(); await listing; assert.equal(delayedList.store.getState().songs.length, 0);
  assert.deepEqual(delayedList.store.getState().folders, []); assert.equal(delayedList.stored, null);
  console.log('PASS: no scan before folder selection, persisted selection/restart and token refresh, legacy-account migration, stale-folder results, failed writes, account-change race and disconnect cleanup.');
  const failedRevoke = harness(); await failedRevoke.store.getState().connect(); failedRevoke.revokeFails = true; await failedRevoke.store.getState().disconnect(); assert.equal(failedRevoke.stored, null); assert.match(failedRevoke.store.getState().error, /권한 철회/);
  const failedDelete = harness(); await failedDelete.store.getState().connect(); failedDelete.deleteFails = true; await failedDelete.store.getState().disconnect(); assert.equal(failedDelete.nativeUser, null); assert.match(failedDelete.store.getState().error, /삭제/);
  console.log('PASS: actual Drive store with SDK/SecureStore mocks: login/cancel/restore/account mismatch/logout, expired-token source refresh, stale login/write/list isolation and offline revoke/storage failure handling.');

  function fakeTimers() {
    const pending = new Map(); let id = 0;
    return {
      pending,
      setTimeout: (callback, ms) => { pending.set(++id, { callback, ms }); return id; },
      clearTimeout: timer => pending.delete(timer),
      expire(ms) { const next = [...pending.entries()].find(([, timer]) => timer.ms === ms); assert.ok(next, 'Expected active ' + ms + 'ms deadline'); pending.delete(next[0]); next[1].callback(); },
    };
  }
  const tokenTimers = fakeTimers(), stalledToken = harness(null, 'android', undefined, '', tokenTimers);
  stalledToken.tokenGate = deferred(); const stalledConnect = stalledToken.store.getState().connect();
  await until(() => stalledToken.calls.includes('tokens'));
  assert.equal(stalledToken.store.getState().progress, 'Drive 접근 토큰 발급');
  tokenTimers.expire(60000); await stalledConnect;
  assert.equal(stalledToken.store.getState().busy, false); assert.equal(stalledToken.store.getState().progress, null);
  assert.match(stalledToken.store.getState().error, /Drive 접근 토큰 발급 시간이 초과/);
  assert.equal(stalledToken.store.getState().account, null); assert.equal(tokenTimers.pending.size, 0);
  const nativeCalls = stalledToken.calls.length;
  const blockedRetry = stalledToken.store.getState().connect();
  await until(() => stalledToken.store.getState().progress === '이전 인증 요청 종료 대기');
  assert.equal(stalledToken.calls.length, nativeCalls, 'No overlapping SDK call while original native request is pending');
  tokenTimers.expire(30000); await blockedRetry; assert.equal(stalledToken.store.getState().busy, false);
  stalledToken.tokenGate.resolve(); await tick(); stalledToken.tokenGate = null;
  assert.equal(stalledToken.stored, null, 'Late token must not persist or authenticate');
  stalledToken.selection = 'B'; await stalledToken.store.getState().connect();
  assert.equal(stalledToken.store.getState().account.id, 'B'); assert.equal(JSON.parse(stalledToken.stored).id, 'B');
  assert.equal(tokenTimers.pending.size, 0);

  const signInTimers = fakeTimers(), stalledSignIn = harness(null, 'android', undefined, '', signInTimers);
  stalledSignIn.signInGate = deferred(); const longSignIn = stalledSignIn.store.getState().connect();
  await until(() => stalledSignIn.calls.includes('in'));
  assert.equal(stalledSignIn.store.getState().progress, '계정 선택 · 권한 승인');
  signInTimers.expire(120000); await longSignIn;
  assert.equal(stalledSignIn.store.getState().busy, false); assert.match(stalledSignIn.store.getState().error, /권한 승인 시간이 초과/);
  stalledSignIn.signInGate.resolve(); await tick(); assert.equal(stalledSignIn.stored, null);
  assert.ok(!stalledSignIn.calls.includes('tokens'), 'Timed-out sign-in cannot continue to token acquisition');

  const writeTimers = fakeTimers(), stalledWrite = harness(null, 'android', undefined, '', writeTimers);
  stalledWrite.writeGate = deferred(); const longWrite = stalledWrite.store.getState().connect();
  await until(() => stalledWrite.calls.includes('write'));
  writeTimers.expire(30000); await longWrite; assert.equal(stalledWrite.store.getState().busy, false);
  stalledWrite.selection = 'B'; const newerWrite = stalledWrite.store.getState().connect();
  await until(() => stalledWrite.store.getState().progress === '이전 인증 요청 종료 대기');
  stalledWrite.writeGate.resolve(); await newerWrite;
  assert.equal(stalledWrite.store.getState().account.id, 'B'); assert.equal(JSON.parse(stalledWrite.stored).id, 'B');
  assert.equal(writeTimers.pending.size, 0, 'Late-write cleanup must finish before the new credential write');

  const cancelTimers = fakeTimers(), cancelledToken = harness(null, 'android', undefined, '', cancelTimers);
  cancelledToken.tokenGate = deferred(); const pendingLogin = cancelledToken.store.getState().connect();
  await until(() => cancelledToken.calls.includes('tokens'));
  cancelledToken.store.getState().cancelConnection(); await pendingLogin;
  assert.equal(cancelledToken.store.getState().busy, false); assert.equal(cancelTimers.pending.size, 0);
  assert.match(cancelledToken.store.getState().error, /취소/);
  cancelledToken.tokenGate.resolve(); await tick(); assert.equal(cancelledToken.stored, null);
  console.log('PASS: login/token/storage deadlines, immediate cancellation and timer cleanup; late SDK success suppression, native-operation barrier, bounded retry wait and late SecureStore writes cannot delete newer credentials. Timers and native SDK are mocked.');

  const playback = load('src/stores/playback.ts').usePlaybackStore;
  const privacy = create(() => ({ ready: false, scope: null, profile: { presets: [] } }));
  const auth = { mode: 'setup', session: null, generation: 0 };
  let instances = 0, statusCallback, nasRequests = 0, pendingSource = null;
  const loads = [], seeks = [];
  class Engine {
    constructor() { instances++; }
    subscribe(callback) { statusCallback = callback; }
    subscribeRemoteNavigation() {}
    async load(source, song) { loads.push([source, song]); playback.getState().setStatus({ playing: true, buffering: false, error: null }); }
    pause() { playback.getState().setStatus({ playing: false }); }
    play() { playback.getState().setStatus({ playing: true }); }
    async seek(seconds) { seeks.push(seconds); }
    release() {}
  }
  const drive = tracks[0], local = { ...drive, id: 'local:fixture', source: 'local', drive: undefined, local: { fileName: 'fixture.mp3' } }, nas = { ...drive, id: 'nas-fixture', source: 'nas', drive: undefined };
  const rules = load('src/features/hidden-music/rules.ts');
  const controller = load('src/services/playback/controller.ts', {
    './audio-engine': { ExpoAudioEngine: Engine },
    '@/stores/playback': { usePlaybackStore: playback }, '@/stores/auth': { useAuthStore: { getState: () => auth } },
    '@/stores/hidden-music': { useHiddenMusicStore: privacy }, '@/features/hidden-music/rules': rules,
    '@/stores/player-background': { usePlayerBackgroundStore: { getState: () => ({ selectArtwork() {}, reset() {} }) } },
    '@/services/synology/api': { SessionExpiredError: class extends Error {}, SynologyError: class extends Error {}, SynologyClient: class { async checkSession() { throw Error('Must not check NAS for Drive'); } } },
    '@/features/library/repository': { musicRepository: () => ({ streamSource: async () => { nasRequests++; return { uri: 'https://example.invalid/nas' }; } }) },
    '@/services/local-music/storage': { localSource: async () => ({ uri: 'file:///fixture.mp3' }) },
    '@/stores/google-drive': { driveSource: async (song, refresh) => { if (pendingSource) await pendingSource.promise; return { uri: 'https://www.googleapis.com/drive/v3/files/' + song.drive.fileId + '?alt=media', headers: { Authorization: refresh ? 'Bearer refreshed' : 'Bearer fixture' } }; } },
  });
  await controller.playQueue([drive, local]); assert.equal(loads.at(-1)[1].source, 'drive'); assert.equal(nasRequests, 0);
  await controller.next(); assert.equal(loads.at(-1)[1].source, 'local'); await controller.previous(false); assert.equal(loads.at(-1)[1].source, 'drive');
  await controller.seek(17); assert.equal(seeks.at(-1), 17); controller.togglePlayback(); assert.equal(playback.getState().playing, false); controller.togglePlayback();
  auth.mode = 'nas'; auth.session = { baseUrl: 'https://example.invalid', sid: 'fixture' }; privacy.setState({ ready: true, scope: rules.privacyScope(auth.mode, auth.session) });
  await controller.playQueue([nas, drive, local]); assert.equal(loads.at(-1)[1].source, 'nas'); await controller.next(); assert.equal(loads.at(-1)[1].source, 'drive');
  controller.stopNasPlayback(); assert.equal(playback.getState().playing, true);
  auth.mode = 'setup'; auth.session = null; privacy.setState({ ready: false, scope: null }); assert.deepEqual(playback.getState().queue.map(song => song.source), ['drive', 'local']); assert.equal(playback.getState().playing, true);
  assert.equal(rules.hiddenMatcher([{ enabled: true, songIds: [drive.id], folders: [] }])(drive), false);
  statusCallback({ playing: false, buffering: true, position: 17, duration: 100, error: 'fixture 401', ended: false }); await until(() => loads.at(-1)[0].headers?.Authorization === 'Bearer refreshed'); await tick(); assert.equal(seeks.at(-1), 17);
  pendingSource = deferred(); const stale = controller.playQueue([drive]); await controller.playQueue([local]); pendingSource.resolve(); await stale; pendingSource = null; assert.equal(loads.at(-1)[1].source, 'local');
  await controller.playQueue([drive, local]); controller.reconcilePlaybackVisibility(song => song.source === 'drive'); assert.equal(playback.getState().queue.length, 0);
  assert.equal(instances, 1); controller.stopPlayback();
  console.log('PASS: actual controller: offline/NAS-independent Drive, NAS/Drive/local mixed queue, shared engine, pause/seek/next/previous, NAS-expiry survival, NAS-hidden isolation, bounded token recovery at prior position, stale sources and disconnect pruning.');

  const driveState = { songs: tracks, loading: false, error: null }, localState = { source: 'all', songs: [local], ready: true };
  let queryResult;
  const hooks = load('src/features/library/queries.ts', {
    '@/stores/library-preferences': { useLibraryPreferences: selector => selector({ ready: true, includeFolderAlbums: true }) },
    react: { useMemo: f => f(), useCallback: f => f }, '@tanstack/react-query': { useQuery: options => queryResult ?? options },
    '@/stores/google-drive': { useGoogleDriveStore: selector => selector(driveState) }, '@/stores/local-music': { useLocalMusicStore: selector => selector(localState) },
    '@/stores/auth': { useAuthStore: selector => selector({ mode: 'nas', session: {} }) }, '@/stores/hidden-music': { useHiddenMusicStore: selector => selector({ ready: true, profile: { presets: [] } }) },
    './repository': { libraryIdentity: () => 'fixture', musicRepository: () => { throw Error('Drive selection must not fetch NAS'); } },
    './album-library': load('src/features/library/album-library.ts'), './load-song-library': load('src/features/library/load-song-library.ts'), './search-songs': load('src/features/library/search-songs.ts'), '../hidden-music/rules': rules,
  });
  const page = { items: [nas], total: 1 };
  assert.equal(hooks.useSongs().select(page).total, 4); localState.source = 'drive'; assert.equal(hooks.useSongs().select(page).total, 2);
  assert.equal((await hooks.useSongs().queryFn({})).total, 0); assert.equal(hooks.useSearch('Lossless').select(page).items[0].id, tracks[1].id);
  assert.equal(hooks.useAlbums().select(page).items[0].songCount, 2); assert.equal(hooks.useRawSongLibrary().select(page).total, 1);
  queryResult = { isError: false, data: { items: tracks, total: 2 } }; driveState.error = 'Google fixture error'; assert.equal(hooks.useSongs().isRefetchError, true);
  console.log('PASS: source filters, shared search/albums, raw NAS isolation and Drive retry errors. Google Cloud OAuth, actual audio decoding/Range/seek/background and native UI require device verification. No real accounts/files were accessed.');
  await checkFolderPicker();
}

async function checkFolderPicker() {
  const jsx = (type, props) => ({ type, props });
  let slots = [], slot = 0, closed = 0, saveGate = null, saveFails = false, nextPages = 0;
  const saves = [], music = { id: 'music', name: 'Music' }, other = { id: 'other', name: 'Other' }, child = { id: 'child', name: 'Child' };
  const state = {
    account: { id: 'A' }, generation: 1, folders: [], folderSaving: false,
    selectFolders: async folders => {
      state.folderSaving = true; saves.push([...folders]);
      try {
        if (saveGate) await saveGate.promise;
        if (saveFails) throw Error('Google 폴더 저장 실패');
        state.folders = [...folders];
      } finally { state.folderSaving = false; }
    },
  };
  const useStore = Object.assign(selector => selector ? selector(state) : state, { getState: () => state });
  const modules = {
    react: { useState: initial => {
      const index = slot++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    } },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', FlatList: 'FlatList', ActivityIndicator: 'Spinner', Alert: {} },
    '@/components/text': { Text: 'Text' },
    '@expo/vector-icons/Ionicons': { default: 'Icon', __esModule: true },
    '@/features/playlists/dialogs': { PlaylistSheet: 'Sheet' },
    '@/services/google-drive/api': {},
    '@/stores/google-drive': { useGoogleDriveStore: useStore },
    '@/theme/tokens': { useColors: () => ({ tint: 'tint', muted: 'muted', text: 'text', separator: 'separator' }) },
    '@tanstack/react-query': { useInfiniteQuery: options => ({
      data: { pages: options.queryKey[3] === 'root' ? [{ folders: [music, other] }, { folders: [music] }] : [{ folders: [child] }], pageParams: [undefined] },
      isPending: false, hasNextPage: true, fetchNextPage: async () => { nextPages++; },
    }) },
  };
  const { DriveFolderPicker } = load('src/features/google-drive/folder-picker.tsx', modules);
  function render() { slot = 0; return DriveFolderPicker({ onClose: () => { closed++; } }); }
  function nodes(node) {
    if (Array.isArray(node)) return node.flatMap(nodes);
    if (!node || typeof node !== 'object') return [];
    const children = node.type === 'FlatList'
      ? [node.props.ListHeaderComponent, ...node.props.data.map(item => node.props.renderItem({ item })), node.props.ListFooterComponent]
      : node.props?.children;
    return [node, ...nodes(children)];
  }
  const textOf = node => nodes(node).filter(item => item.type === 'Text').map(item => [item.props.children].flat().join('')).join(' ');
  const labelled = (tree, label) => nodes(tree).find(node => node.props?.accessibilityLabel === label);
  const saveButton = tree => nodes(tree).filter(node => node.type === 'Pressable').at(-1);
  let tree = render();
  assert.equal(saveButton(tree).props.disabled, true);
  assert.equal(nodes(tree).filter(node => node.props?.accessibilityLabel === 'Music 폴더 선택').length, 1, 'Repeated folder pages show one checkbox');
  labelled(tree, 'Music 폴더 선택').props.onPress(); tree = render();
  assert.equal(labelled(tree, 'Music 폴더 선택').props.accessibilityState.checked, true);
  labelled(tree, 'Other 폴더 열기').props.onPress(); tree = render();
  labelled(tree, 'Child 폴더 선택').props.onPress(); tree = render();
  assert.ok(textOf(tree).includes('선택한 폴더 2개'));
  labelled(tree, 'Other 폴더 전체 선택').props.onPress(); tree = render();
  assert.equal(labelled(tree, 'Other 폴더 전체 선택').props.accessibilityState.checked, true);
  labelled(tree, 'Other 선택 해제').props.onPress(); tree = render();
  labelled(tree, '상위 폴더').props.onPress(); tree = render();
  assert.equal(labelled(tree, 'Music 폴더 선택').props.accessibilityState.checked, true, 'Selection survives folder navigation');
  const list = nodes(tree).find(node => node.type === 'FlatList' && !node.props.horizontal);
  assert.deepEqual(list.props.extraData.map(folder => folder.id), ['music', 'child']);
  list.props.ListFooterComponent.props.onPress(); assert.equal(nextPages, 1);
  assert.equal(saves.length, 0, 'Checking and browsing do not persist until confirmed');
  tree.props.onClose(); assert.equal(closed, 1); assert.deepEqual(state.folders, []);
  slots = []; tree = render(); assert.equal(saveButton(tree).props.disabled, true, 'Closing discards unconfirmed selection');
  labelled(tree, 'Music 폴더 선택').props.onPress(); tree = render();
  labelled(tree, 'Other 폴더 선택').props.onPress(); tree = render();
  saveGate = deferred(); saveButton(tree).props.onPress(); tree = render();
  assert.equal(saveButton(tree).props.disabled, true);
  assert.equal(labelled(tree, 'Music 폴더 선택').props.disabled, true);
  assert.equal(labelled(tree, 'Other 폴더 열기').props.disabled, true);
  assert.equal(labelled(tree, 'Music 선택 해제').props.disabled, true);
  assert.equal(closed, 1);
  saveGate.resolve(); await until(() => closed === 2); saveGate = null;
  assert.deepEqual(saves[0].map(folder => folder.id), ['music', 'other']);
  slots = []; tree = render();
  assert.equal(labelled(tree, 'Music 폴더 선택').props.accessibilityState.checked, true, 'Reopening preselects saved folders');
  labelled(tree, 'Music 선택 해제').props.onPress(); tree = render();
  labelled(tree, 'Other 선택 해제').props.onPress(); tree = render();
  assert.equal(saveButton(tree).props.disabled, false); assert.ok(textOf(saveButton(tree)).includes('폴더 선택 해제'));
  saveButton(tree).props.onPress(); await until(() => closed === 3); assert.deepEqual(state.folders, []);
  slots = []; tree = render(); labelled(tree, 'Music 폴더 선택').props.onPress(); tree = render();
  saveFails = true; saveButton(tree).props.onPress(); await tick(); tree = render();
  assert.equal(closed, 3); assert.ok(textOf(tree).includes('Google 폴더 저장 실패'));
  assert.equal(labelled(tree, 'Music 폴더 선택').props.accessibilityState.checked, true, 'Failed save keeps the draft for retry');
  saveFails = false; saveButton(tree).props.onPress(); await until(() => closed === 4);
  modules['./folder-picker'] = { DriveFolderPicker: 'Picker' };
  const { GoogleDriveSettings } = load('src/features/google-drive/settings.tsx', modules);
  slots = []; slot = 0; state.folders = [music, other];
  assert.ok(textOf(GoogleDriveSettings()).includes('음악 폴더 2개: Music, Other'));
  console.log('PASS: real folder-picker handlers: independent check/navigation, pagination deduplication, cross-folder draft, cancel, preselection, apply/clear, busy controls and failed-save retry; multi-folder settings summary. Native views are mocked.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
