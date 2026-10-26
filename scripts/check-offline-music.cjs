/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { Buffer } = require('node:buffer');
const root = path.resolve(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));
const { create } = require(path.join(root, 'node_modules/zustand'));
function load(file, modules = {}) {
  modules = { ...require('./test-cloud-fixtures.cjs').cloudFixtures({}, modules), ...modules };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => {
    if (name === 'zustand') return { create };
    if (name in modules) return modules[name];
    throw Error('Unexpected dependency: ' + name);
  }, mod, mod.exports);
  return mod.exports;
}
const files = new Map(), rows = new Map(), requests = [], refreshes = [], removed = [];
let plan = {}, copyFailure = false, dbFailure = false, deleteFailure = false, heldResolve, cancelled = 0, copyGate, commitGate, cancelGate, readGate;
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
const platform = { OS: 'android' };
const rules = load('src/services/local-music/folders.ts');
const exclusions = create(() => ({ ready: true, folders: [], load: async () => {} }));
const fileSystem = {
  documentDirectory: 'file:///app/', cacheDirectory: 'file:///cache/',
  getInfoAsync: async (uri, options = {}) => files.has(uri) ? { exists: true, isDirectory: false, size: files.get(uri).length, md5: options.md5 ? crypto.createHash('md5').update(files.get(uri)).digest('hex') : undefined } : { exists: false },
  makeDirectoryAsync: async () => {},
  copyAsync: async ({ from, to }) => { files.set(to, Buffer.from(files.get(from))); if (copyGate) await copyGate.promise; if (copyFailure) throw Error('Disk full'); },
  deleteAsync: async uri => { if (deleteFailure && uri.startsWith(fileSystem.documentDirectory)) throw Error('delete failure'); files.delete(uri); removed.push(uri); },
  createDownloadResumable: (url, uri, options, progress) => {
    requests.push({ url, uri, options });
    const current = Array.isArray(plan) ? plan.shift() : plan;
    let stopped = false;
    return {
      cancelAsync: async () => { cancelled++; stopped = true; heldResolve?.(); if (cancelGate) await cancelGate.promise; },
      downloadAsync: async () => {
        if (current.fail) throw Error('Native exception ' + url);
        files.set(uri, Buffer.from(current.bytes ?? 'ID3audio fixture'));
        const length = files.get(uri).length;
        progress({ totalBytesWritten: length, totalBytesExpectedToWrite: length });
        if (current.hold) await new Promise(resolve => { heldResolve = resolve; });
        if (stopped) return undefined;
        return { uri, status: current.status ?? 200, mimeType: current.mime ?? 'audio/mpeg', headers: { 'Content-Length': String(length), ...current.headers } };
      },
    };
  },
};
const database = {
  execAsync: async () => {},
  getAllAsync: async () => { const snapshot = [...rows.values()].map(value => ({ value })); if (readGate) await readGate.promise; return snapshot; },
  getFirstAsync: async (_, id) => rows.has(id) ? { value: rows.get(id) } : null,
  runAsync: async (sql, id, value) => { if (dbFailure) throw Error('DB failure'); if (commitGate) await commitGate.promise; if (sql.startsWith('DELETE')) rows.delete(id); else rows.set(id, value); },
};
const storageModules = {
  'react-native': { Platform: platform }, 'expo-file-system/legacy': fileSystem,
  'expo-sqlite': { openDatabaseAsync: async () => database },
  'expo-document-picker': { getDocumentAsync: async () => { throw Error('Must not open picker'); } },
  '@/stores/folder-exclusions': { useFolderExclusionStore: exclusions }, './folders': rules,
};
const storage = load('src/services/local-music/storage.ts', storageModules);
const realApi = load('src/services/synology/api.ts');
const apis = { 'SYNO.AudioStation.Stream': { path: 'AudioStation/stream.cgi', minVersion: 1, maxVersion: 2 } };
const session = { account: 'fixture-account', baseUrl: 'https://nas.example.invalid', sid: 'private-fixture-sid', token: 'private-fixture-token', apis };
const auth = create((set, get) => ({
  mode: 'nas', session, generation: 1,
  expire: async (old, generation) => { if (old === get().session && generation === get().generation) set({ mode: 'setup', session: null, generation: generation + 1 }); },
}));
const drive = create(() => ({ generation: 1, account: { id: 'drive-account' } }));
const driveModule = {
  useGoogleDriveStore: drive,
  driveSource: async (song, refresh) => {
    refreshes.push(refresh);
    if (drive.getState().account?.id !== song.drive.accountId) throw Error('Google account changed');
    return { uri: 'https://www.googleapis.com/drive/v3/files/file?alt=media', headers: { Authorization: 'Bearer private-fixture-drive-token' } };
  },
};
const s3 = create(() => ({ generation: 1, connection: { id: 's3-fixture' } }));
const s3Module = { useS3Store: s3, s3Source: async () => ({ uri: 'https://s3.example.invalid/music/song.mp3?X-Amz-Signature=fixture' }) };
const mybox = create(() => ({ generation: 1, connection: { id: 'mbx-fixture' },
  source: async () => ({ uri: 'https://mybox-storage.example.invalid/download?atoken=private-fixture-mybox' }),
  playbackSource: async () => { throw Error('Offline downloads must use a fresh remote URL, not the playback cache'); } }));
const myboxModule = { useMyboxStore: mybox };
const formats = load('src/services/offline-music/formats.ts');
const downloader = load('src/services/offline-music/download.ts', {
  'react-native': { Platform: platform }, 'expo-file-system/legacy': fileSystem,
  './formats': formats, '@/services/local-music/storage': storage,
  '@/services/synology/api': realApi, '@/stores/auth': { useAuthStore: auth }, '@/stores/google-drive': driveModule, '@/stores/s3': s3Module,
  '@/stores/mybox': myboxModule,
});
const nas = { id: 'nas-song', source: 'nas', title: 'Offline song', artist: 'Artist', album: 'Album', albumSource: 'tag', albumArtist: 'Album Artist', duration: 180, trackNumber: 2, path: '/private/music/song.flac', artworkUrl: 'https://nas.example.invalid/cover?_sid=private-fixture-sid' };
const cloud = { id: 'drive:fixture:file', source: 'drive', title: 'Cloud song', artist: 'Cloud artist', album: 'Google Drive', duration: 0, drive: { accountId: 'drive-account', fileId: 'file', mimeType: 'audio/mpeg' } };
function run(song, controller = new AbortController()) { return downloader.downloadSong(song, controller.signal, () => {}, () => {}); }
function assertNoParts() { assert.ok([...files.keys()].every(uri => !uri.includes('offline-download-')), 'Partial files must be cleaned'); }
async function flush() { for (let i = 0; i < 60; i++) await Promise.resolve(); }
async function main() {
  plan = { bytes: 'fLaClossless fixture', mime: 'audio/x-flac' };
  const saved = await run(nas);
  assert.equal(saved.song.source, 'local'); assert.equal(saved.song.title, nas.title);
  assert.equal(saved.song.artist, nas.artist); assert.equal(saved.song.album, nas.album);
  assert.equal(saved.song.duration, nas.duration); assert.equal(saved.song.local.downloadedFrom, 'nas');
  assert.equal(saved.song.albumSource, 'tag', 'Local downloads retain confirmed album tags');
  assert.ok(saved.song.local.fileName.endsWith('.flac'));
  const nasRequest = new URL(requests[0].url);
  assert.equal(nasRequest.searchParams.get('method'), 'stream', 'Always original NAS stream');
  assert.equal(nasRequest.searchParams.get('_sid'), session.sid); assert.equal(nasRequest.searchParams.get('library'), 'all');
  const stored = rows.get(saved.song.id);
  for (const privateValue of [session.sid, session.token, session.baseUrl, session.account, nas.path, nas.artworkUrl]) assert.ok(!stored.includes(privateValue));
  assertNoParts();
  assert.equal((await run(nas)).duplicate, true); assert.equal(rows.size, 1);
  const originalUri = (await storage.localSource(saved.song)).uri;
  files.delete(originalUri);
  assert.equal((await run(nas)).duplicate, false, 'Missing copy is restored');
  assert.ok(files.has(originalUri));
  // A fresh module represents app restart; local files no longer need either account.
  auth.setState({ mode: 'setup', session: null, generation: 2 }); drive.setState({ account: null });
  const restarted = load('src/services/local-music/storage.ts', storageModules);
  assert.equal((await restarted.readLocalSongs())[0].id, saved.song.id);
  assert.equal((await restarted.localSource(saved.song)).uri, originalUri);
  auth.setState({ mode: 'nas', session, generation: 3 }); drive.setState({ account: { id: 'drive-account' } });
  plan = { bytes: 'ID3cloud fixture' };
  const downloadedDrive = await run(cloud);
  assert.equal(downloadedDrive.song.local.downloadedFrom, 'drive');
  assert.equal(downloadedDrive.song.albumSource, 'fallback', 'Downloads without album provenance obey the folder-album setting');
  assert.equal(requests.at(-1).options.headers.Authorization, 'Bearer private-fixture-drive-token');
  assert.ok(!rows.get(downloadedDrive.song.id).includes('drive-account')); assert.ok(!rows.get(downloadedDrive.song.id).includes('Bearer'));
  plan = { bytes: 'ID3s3 unique fixture' };
  const s3Track = { ...cloud, id: 's3:s3-fixture:music%2Fsong.mp3', source: 's3', drive: undefined, s3: { connectionId: 's3-fixture', key: 'music/song.mp3', size: Buffer.byteLength(plan.bytes) } };
  const s3Copy = await run(s3Track);
  assert.equal(s3Copy.song.local.downloadedFrom, 's3');
  assert.ok(!rows.get(s3Copy.song.id).includes('X-Amz')); assert.ok(!rows.get(s3Copy.song.id).includes('s3-fixture'));
  plan = { bytes: 'ID3mybox unique fixture' };
  const myboxTrack = { id: 'mybox:mbx-fixture:file-a', source: 'mybox', title: 'MYBOX track', artist: 'Artist', album: 'Album', duration: 0, path: '/Music/song.mp3',
    mybox: { connectionId: 'mbx-fixture', fileId: 'file-a', fileName: 'song.mp3', size: Buffer.byteLength(plan.bytes) } };
  const myboxCopy = await run(myboxTrack);
  assert.equal(myboxCopy.song.local.downloadedFrom, 'mybox');
  assert.equal(requests.at(-1).options.headers, undefined, 'MYBOX storage does not receive account credentials');
  assert.ok(!rows.get(myboxCopy.song.id).includes('atoken')); assert.ok(!rows.get(myboxCopy.song.id).includes('mbx-fixture'));
  plan = { bytes: 'ID3mybox truncated' }; await assert.rejects(run(myboxTrack));
  assertNoParts();
  plan = [{ status: 401 }, { bytes: 'ID3new-token retry' }];
  await run(cloud); assert.deepEqual(refreshes.slice(-2), [false, true]);
  const count = rows.size;
  for (const invalid of [
    { status: 403 }, { status: 404 }, { status: 206 }, { mime: 'text/html', bytes: '<html>login</html>' },
    { mime: 'text/plain', bytes: '{"success":false,"error":{"code":105}}' },
    { bytes: '' }, { headers: { 'content-length': '9999', 'Content-Length': '9999' } }, { fail: true },
  ]) {
    plan = invalid; await assert.rejects(run(nas)); assert.equal(rows.size, count); assertNoParts();
  }
  plan = { bytes: 'ID3truncated' };
  await assert.rejects(run({ ...cloud, drive: { ...cloud.drive, size: 99999 } }));
  assert.equal(rows.size, count);
  const aborted = new AbortController(); aborted.abort(); plan = {};
  const before = requests.length; await assert.rejects(run(nas, aborted)); assert.equal(requests.length, before);
  plan = { bytes: 'ID3cancel', hold: true };
  const controller = new AbortController(), job = run(nas, controller);
  await flush(); controller.abort(); await assert.rejects(job); assert.ok(cancelled > 0); assertNoParts();
  plan = { status: 401, hold: true };
  const obsolete = run(nas); await flush();
  const newer = { ...session, sid: 'newer-fixture-sid' };
  auth.setState({ mode: 'nas', session: newer, generation: 77 });
  heldResolve();
  await assert.rejects(obsolete);
  assert.equal(auth.getState().session, newer, 'Old download 401 cannot expire a new session');
  auth.setState({ mode: 'nas', session, generation: 78 });
  plan = { bytes: 'ID3disk failure' }; copyFailure = true;
  await assert.rejects(run(nas)); copyFailure = false; assert.equal(rows.size, count); assertNoParts();
  plan = { bytes: 'ID3database failure' }; dbFailure = true;
  await assert.rejects(run(nas)); dbFailure = false; assert.equal(rows.size, count); assertNoParts();
  assert.ok([...files.values()].every(bytes => bytes.toString() !== 'ID3database failure'), 'New app copy rolled back on DB failure');
  assert.equal(formats.audioExtension(cloud, 'audio/mp4; charset=binary'), 'm4a');
  assert.throws(() => formats.audioExtension(cloud, 'application/json'));
  platform.OS = 'web'; await assert.rejects(run(nas)); platform.OS = 'android';
  console.log('PASS: original NAS and Bearer-authenticated Drive download; persistent local metadata; offline/restart; duplicate and missing-copy repair; token URL exclusion; 401 retry; invalid response/partial/size checks; cancel and disk/DB rollback.');

  const localModule = load('src/stores/local-music.ts', {
    './folder-exclusions': { useFolderExclusionStore: exclusions },
    '@/services/local-music/folders': rules, '@/services/local-music/storage': storage,
  });
  const local = localModule.useLocalMusicStore;
  let pruned;
  const offline = load('src/stores/offline-music.ts', {
    '@/services/offline-music/download': downloader, '@/services/local-music/storage': storage,
    './local-music': localModule, './auth': { useAuthStore: auth }, './google-drive': driveModule,
    './mybox': myboxModule,
    '@/services/playback/controller': { reconcilePlaybackVisibility: match => { pruned = match; } },
  }).useOfflineMusicStore;
  plan = { bytes: 'ID3store success' }; await offline.getState().download(nas);
  assert.equal(offline.getState().busy, false); assert.equal(local.getState().busy, false);
  assert.ok(local.getState().songs.some(song => song.title === nas.title));
  assert.equal(offline.getState().error, null);
  plan = { bytes: 'ID3active cancel', hold: true };
  cancelGate = deferred();
  const pending = offline.getState().download(nas); await flush();
  const requestsBefore = requests.length;
  await offline.getState().download(cloud);
  assert.equal(requests.length, requestsBefore, 'Concurrent downloads are blocked');
  const deletionCount = removed.length;
  assert.equal(await offline.getState().remove(local.getState().songs[0]), false);
  assert.equal(removed.length, deletionCount, 'Deletion cannot interrupt an active download');
  const jsx = (type, props) => ({ type, props });
  const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
  const Status = load('src/features/offline-music/download-status.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': { View: 'View', Pressable: 'Button', StyleSheet: { create: value => value } },
    '@/components/text': { Text: 'Text' }, '@/theme/tokens': { useColors: () => ({}) },
    '@/stores/offline-music': { useOfflineMusicStore: () => offline.getState() },
  }).DownloadStatus;
  const cancelButton = () => nodes(Status({})).find(node => node.props?.accessibilityLabel === '보관 다운로드 취소');
  assert.equal(cancelButton().props.style[0].minHeight, 44, 'Download cancellation has a full-size touch target');
  const beforeCancel = cancelled;
  cancelButton().props.onPress(); offline.getState().cancel();
  assert.equal(offline.getState().cancelling, true); assert.equal(cancelButton().props.disabled, true);
  assert.equal(cancelled, beforeCancel + 1, 'Repeated cancel taps cancel the native transfer once');
  await flush(); assert.equal(offline.getState().busy, true, 'Keep the job locked until native cancellation and cleanup finish');
  cancelGate.resolve(); await pending; cancelGate = null; assertNoParts();
  assert.equal(offline.getState().cancelling, false); assert.equal(offline.getState().busy, false);
  assert.match(offline.getState().message, /취소/); assert.equal(offline.getState().error, null);

  const filesBefore = [...files.keys()].sort(), rowsBefore = rows.size;
  plan = { bytes: 'ID3cancel-during-verified-copy' }; copyGate = deferred();
  const copying = offline.getState().download(nas); await flush();
  assert.equal(offline.getState().saving, false, 'Copying/verifying is still cancellable');
  cancelButton().props.onPress(); copyGate.resolve(); await copying; copyGate = null;
  assert.equal(rows.size, rowsBefore); assert.deepEqual([...files.keys()].sort(), filesBefore, 'Canceled copy leaves neither a published song nor a new app copy');
  plan = { bytes: 'ID3atomic-commit' }; commitGate = deferred();
  const committing = offline.getState().download(nas); await flush();
  assert.equal(offline.getState().saving, true); assert.equal(cancelButton(), undefined, 'Final publication cannot be interrupted');
  offline.getState().cancel(); assert.equal(offline.getState().cancelling, false);
  commitGate.resolve(); await committing; commitGate = null;
  assert.equal(offline.getState().error, null); assertNoParts();
  plan = { bytes: 'ID3obsolete NAS', hold: true };
  const previous = offline.getState().download(nas); await flush();
  auth.setState({ generation: auth.getState().generation + 1 });
  await previous; assertNoParts();
  plan = { bytes: 'ID3obsolete Drive', hold: true };
  const olderDrive = offline.getState().download(cloud); await flush();
  drive.setState({ generation: 2, account: null });
  await olderDrive; assertNoParts();
  plan = { bytes: 'ID3obsolete MYBOX', hold: true };
  const olderMybox = offline.getState().download(myboxTrack); await flush();
  mybox.setState({ generation: 2, connection: null }); await olderMybox; assertNoParts();
  assert.match(offline.getState().message, /취소/);
  plan = { bytes: 'ID3failure for retry', fail: true };
  await offline.getState().download(nas);
  assert.ok(offline.getState().error); assert.equal(offline.getState().retrySong.id, nas.id);
  plan = { bytes: 'ID3retry success' }; await offline.getState().download(offline.getState().retrySong);
  assert.equal(offline.getState().error, null);
  const song = local.getState().songs[0], source = await storage.localSource(song);
  const filesBeforeRemoval = [...files.keys()].sort();
  assert.equal(await offline.getState().remove(nas), false);
  assert.equal(await offline.getState().remove(cloud), false);
  assert.equal(await offline.getState().remove(s3Track), false);
  assert.deepEqual([...files.keys()].sort(), filesBeforeRemoval, 'Remote originals cannot be deleted');
  local.setState({ busy: true }); assert.equal(await offline.getState().remove(song), false); local.setState({ busy: false });
  assert.ok(rows.has(song.id)); assert.ok(files.has(source.uri), 'An import in progress blocks deletion');
  deleteFailure = true; assert.equal(await offline.getState().remove(song), false);
  assert.ok(rows.has(song.id)); assert.ok(files.has(source.uri)); assert.ok(offline.getState().error);
  deleteFailure = false; readGate = deferred();
  const loading = local.getState().load(); await flush();
  const deleting = offline.getState().remove(song); await flush();
  assert.equal(offline.getState().removing, true);
  assert(nodes(Status({})).some(node => node.type === 'Text' && node.props.children.includes('삭제 중')), 'The status describes deletion rather than downloading');
  assert.equal(cancelButton(), undefined, 'File deletion is not presented as a cancellable download');
  assert.ok(files.has(source.uri), 'Wait for the in-flight library read before deleting');
  assert.equal(await offline.getState().remove(song), false, 'Concurrent deletions are blocked');
  readGate.resolve(); readGate = null; await loading; assert.equal(await deleting, true);
  assert.equal(rows.has(song.id), false); assert.equal(files.has(source.uri), false);
  assert.equal(offline.getState().removing, false); assert.equal(offline.getState().error, null);
  assert.deepEqual([...files.keys()].sort(), filesBeforeRemoval.filter(uri => uri !== source.uri), 'Only the selected app-owned file is removed');
  assert.ok(!local.getState().songs.some(item => item.id === song.id)); assert.equal(pruned(song), true);
  assert.ok(!local.getState().allSongs.some(item => item.id === song.id));
  assert.ok(!(await restarted.readLocalSongs()).some(item => item.id === song.id), 'Deletion persists across app restart');
  assert.equal(pruned(nas), false, 'Deletion cannot prune or delete a remote original');
  console.log('PASS: download/store/library integration, single job, cancel, NAS/Drive account change cancellation, retry, offline copy deletion and delete failure. Only mocked accounts/files were used; actual devices/format decoding remain unverified.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
