/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { Buffer } = require('node:buffer');
const root = path.resolve(__dirname, '..'), ts = require(path.join(root, 'node_modules/typescript')), zustand = require(path.join(root, 'node_modules/zustand'));
function load(file, modules) {
  const shared = require('./test-cloud-fixtures.cjs').cloudFixtures({}, modules);
  const mod = { exports: {} }, code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('require', 'module', 'exports', code)(name => { if (name in modules) return modules[name]; if (name in shared) return shared[name]; throw Error('Unexpected module ' + name); }, mod, mod.exports); return mod.exports;
}
const rules = load('src/services/local-music/folders.ts', {});
const call = '/storage/primary/Recordings/Call', music = '/storage/primary/Music';
const plain = (id, folders) => ({ id, title: id, source: 'local', local: { originalFolders: folders } });
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
async function main() {
  assert.equal(rules.localFolderKey('file:///storage/emulated/0/Recordings/Call/'), call);
  assert.equal(rules.localFolderKey('file:///storage/emulated/10/Recordings/Call/'), call);
  assert.equal(rules.localFolderKey('content://com.android.externalstorage.documents/tree/primary%3ARecordings%2FCall/document/primary%3ARecordings%2FCall'), call);
  assert.equal(rules.localFolderKey('content://com.android.externalstorage.documents/tree/ABCD-1234%3AMusic'), '/storage/abcd-1234/Music');
  assert.equal(rules.localFolderKey('file:///storage/ABCD-1234/Music'), '/storage/abcd-1234/Music');
  assert.equal(rules.localFolderKey('file:///var/mobile/Documents/My%20Music'), '/var/mobile/Documents/My Music');
  assert.equal(rules.sourceFolder('content://media/external/audio/media/1'), undefined);
  assert.equal(rules.sourceFolder('file:///storage/emulated/0/Recordings/Call/record.mp3'), call);
  assert.equal(rules.folderExcluded(call + '/2026', [call]), true); assert.equal(rules.folderExcluded(call + 'back', [call]), false);
  assert.equal(rules.folderExcluded(call.toLowerCase(), [call]), false, 'Folder names remain case-sensitive');
  assert.equal(rules.localSongExcluded(plain('a', [call]), [call]), true);
  assert.equal(rules.localSongExcluded(plain('a', [call, music]), [call]), false, 'Identical content in a permitted source folder stays available');
  assert.equal(rules.localSongExcluded({ source: 'nas', path: call + '/nas.mp3' }, [call]), false);
  assert.equal(rules.localSongExcluded(plain('unknown'), [call]), false, 'Never infer old records from filename');
  console.log('PASS: local file/SAF volume keys, work-profile primary storage, SD case normalization, folder boundaries/descendants, multi-source duplicates, unknown and NAS isolation.');
  let saved = null, failRead = false, failWrite = false, gate;
  const preferenceModules = { zustand, 'react-native': { Platform: { OS: 'android' } }, '@/services/local-music/folders': rules, 'expo-secure-store': {
    getItemAsync: async () => { if (failRead) throw Error('read failed'); return saved; },
    setItemAsync: async (_, value) => { if (gate) await gate.promise; if (failWrite) throw Error('write failed'); saved = value; },
  } };
  let preferences = load('src/stores/folder-exclusions.ts', preferenceModules).useFolderExclusionStore;
  await preferences.getState().load(); assert.equal(preferences.getState().ready, true);
  await preferences.getState().setFolders([call, call]); assert.deepEqual(preferences.getState().folders, [call]);
  preferences = load('src/stores/folder-exclusions.ts', preferenceModules).useFolderExclusionStore;
  await preferences.getState().load(); assert.deepEqual(preferences.getState().folders, [call]);
  failWrite = true; await assert.rejects(preferences.getState().setFolders([])); assert.deepEqual(preferences.getState().folders, [call]); failWrite = false;
  gate = deferred(); const first = preferences.getState().setFolders([music]), second = preferences.getState().setFolders([call]); await flush(); assert.equal(preferences.getState().saving, true); gate.resolve(); await Promise.all([first, second]); gate = null;
  assert.deepEqual(preferences.getState().folders, [call]); assert.deepEqual(JSON.parse(saved), [call]);
  await assert.rejects(preferences.getState().setFolders([null]));
  const retained = preferences.getState().folders; failRead = true; await preferences.getState().load(true); assert.equal(preferences.getState().folders, retained); failRead = false;
  saved = '{broken'; const corrupt = load('src/stores/folder-exclusions.ts', preferenceModules).useFolderExclusionStore;
  await corrupt.getState().load(); assert.equal(corrupt.getState().ready, false); await assert.rejects(corrupt.getState().setFolders([])); assert.equal(saved, '{broken');
  saved = JSON.stringify([call]); await preferences.getState().load(true);
  console.log('PASS: persistent settings/restart, deduplication, serialized changes, failed write/read preservation, invalid values and unreadable initial settings cannot be overwritten.');
  const originals = new Map(), rows = new Map(), copies = [], deletes = [];
  let selection;
  const native = { Platform: { OS: 'android' } };
  const legacy = { documentDirectory: 'file:///documents/', cacheDirectory: 'file:///cache/', makeDirectoryAsync: async () => {},
    getInfoAsync: async (uri, options = {}) => originals.has(uri) ? { exists: true, isDirectory: false, size: originals.get(uri).length, md5: options.md5 ? crypto.createHash('md5').update(originals.get(uri)).digest('hex') : undefined } : { exists: false },
    copyAsync: async ({ from, to }) => { originals.set(to, Buffer.from(originals.get(from))); copies.push([from, to]); },
    deleteAsync: async uri => { originals.delete(uri); deletes.push(uri); },
  };
  class File { constructor(uri) { this.uri = uri; } async copy(to) { originals.set(to.uri, Buffer.from(originals.get(this.uri))); copies.push([this.uri, to.uri]); } }
  const device = [];
  class Query { eq() { return this; } orderBy() { return this; } limit() { return this; } offset() { return this; } async exe() { return device; } }
  const media = { Query, AssetField: {}, MediaType: {}, requestPermissionsAsync: async () => ({ granted: true }) };
  let scanner;
  const storage = load('src/services/local-music/storage.ts', { 'react-native': native, 'expo-file-system/legacy': legacy, 'expo-file-system': { File }, 'expo-document-picker': { getDocumentAsync: async () => selection },
    'expo-sqlite': { openDatabaseAsync: async () => ({ execAsync: async () => {}, getAllAsync: async () => [...rows.values()].map(value => ({ value })), getFirstAsync: async (_, id) => rows.has(id) ? { value: rows.get(id) } : null, runAsync: async (_, id, value) => rows.set(id, value) }) },
    '@/stores/folder-exclusions': { useFolderExclusionStore: preferences }, './folders': rules, get './scan'() { return scanner; },
  });
  scanner = load('src/services/local-music/scan.ts', { 'react-native': native, 'expo-file-system': {}, 'expo-media-library': media, './storage': storage, './folders': rules });
  originals.set('file:///cache/dupe.mp3', Buffer.from('existing recording')); originals.set('file:///cache/normal.mp3', Buffer.from('existing music'));
  selection = { canceled: false, assets: [{ name: 'dupe.mp3', uri: 'file:///cache/dupe.mp3' }, { name: 'normal.mp3', uri: 'file:///cache/normal.mp3' }] };
  await preferences.getState().setFolders([]); await storage.importLocalSongs();
  const oldSongs = await storage.readLocalSongs(), oldRecording = oldSongs.find(song => song.local.originalName === 'dupe.mp3');
  assert.equal(oldRecording.local.originalFolders, undefined);
  function add(name, folder, bytes) { const id = 'content://media/external/audio/media/' + device.length; originals.set(id, Buffer.from(bytes)); device.push({ id, getFilename: async () => name, getDuration: async () => 120000, getUri: async () => 'file:///storage/emulated/0/' + folder + '/' + name }); return id; }
  const recordingUri = add('dupe.mp3', 'Recordings/Call', 'existing recording');
  const sameNameUri = add('dupe.mp3', 'Recordings/Call', 'different recording');
  add('normal.mp3', 'Music', 'existing music'); const newCall = add('new-call.mp3', 'Recordings/Call', 'new recording');
  await preferences.getState().setFolders([call]); const result = await storage.importLocalSongs('device');
  assert.equal(result.added, 0); assert.equal(result.duplicates, 1); assert.equal(result.excluded, 3); assert.equal(rows.size, 2);
  const updated = await storage.readLocalSongs(); assert.deepEqual(updated.find(song => song.id === oldRecording.id).local.originalFolders, [call]);
  assert.equal(updated.filter(song => song.local.originalFolders?.includes(call)).length, 1, 'Same filename is not mistaken for identical content');
  assert(!copies.some(([from]) => from === newCall), 'New excluded files skip staging/copy');
  assert(copies.some(([from]) => from === sameNameUri)); assert(copies.some(([from]) => from === recordingUri), 'One-time legacy association hashes exact content');
  await assert.rejects(storage.localSource(oldRecording), /제외 폴더/, 'Stale queue metadata cannot bypass a newly associated excluded folder');
  const local = load('src/stores/local-music.ts', { zustand, '@/services/local-music/storage': storage, './folder-exclusions': { useFolderExclusionStore: preferences }, '@/services/local-music/folders': rules }).useLocalMusicStore;
  await local.getState().load(); assert.equal(local.getState().songs.length, 1); assert.equal(local.getState().allSongs.length, 2);
  const retainedFiles = [...originals.keys()].filter(uri => uri.startsWith(legacy.documentDirectory));
  await preferences.getState().setFolders([]); assert.equal(local.getState().songs.length, 2); assert.equal((await storage.localSource(oldRecording)).uri.startsWith(legacy.documentDirectory), true);
  await preferences.getState().setFolders([call]); assert.equal(local.getState().songs.length, 1);
  add('dupe.mp3', 'Music', 'existing recording'); await local.getState().importFiles('device');
  assert.equal(local.getState().songs.length, 2, 'Identical audio also in Music is retained');
  await preferences.getState().setFolders([call, music]); assert.equal(local.getState().songs.length, 0);
  await preferences.getState().setFolders([]); assert.equal(local.getState().songs.length, 2);
  assert.deepEqual([...originals.keys()].filter(uri => uri.startsWith(legacy.documentDirectory)), retainedFiles, 'Exclusions never delete app copies');
  assert(device.every(asset => originals.has(asset.id) && !deletes.includes(asset.id)), 'Originals are never deleted');
  assert(deletes.every(uri => uri.startsWith(legacy.cacheDirectory)), 'Only owned temporary staging copies are cleaned');
  // Folder unknown: do not silently import bulk audio while exclusions are active.
  device.length = 0; const unknownUri = add('unknown.mp3', 'Music', 'unknown metadata'); device[0].getUri = async () => unknownUri;
  await preferences.getState().setFolders([call]); const skippedUnknown = await storage.importLocalSongs('device'); assert.equal(skippedUnknown.added, 0); assert.match(skippedUnknown.failures[0], /원본 폴더/);
  console.log('PASS: excluded future imports skip copying, exact legacy association, same-name distinction, filtered/raw lists, instant restore, multi-folder duplicates, stale playback rejection, unknown-folder reporting and original/app-copy preservation. No real music files or NAS are accessed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
