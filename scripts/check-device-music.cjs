/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { Buffer } = require('node:buffer');
const root = path.resolve(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));
const { create } = require(path.join(root, 'node_modules/zustand'));
function load(file, modules) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(name => { if (name in modules) return modules[name]; throw Error('Unmocked ' + name); }, mod, mod.exports);
  return mod.exports;
}
let os = 'android', granted = true, picks = 0, pickerError = null, pageFail = false, repeating = false, copyFailure = null;
const queries = [], permissions = [], files = new Map(), rows = new Map(), deletes = [], copies = [];
const platform = { Platform: { get OS() { return os; } } };
const legacy = {
  documentDirectory: 'file:///documents/', cacheDirectory: 'file:///cache/',
  makeDirectoryAsync: async () => {},
  getInfoAsync: async (uri, opts = {}) => files.has(uri) ? { exists: true, isDirectory: false, size: files.get(uri).length, md5: opts.md5 ? crypto.createHash('md5').update(files.get(uri)).digest('hex') : undefined } : { exists: false },
  copyAsync: async ({ from, to }) => { files.set(to, Buffer.from(files.get(from))); copies.push([from, to]); },
  deleteAsync: async uri => { files.delete(uri); deletes.push(uri); },
};
class File {
  constructor(uri, name) { this.uri = uri; this.name = name ?? uri.split('/').pop(); }
  async copy(to) { files.set(to.uri, Buffer.from(files.get(this.uri))); copies.push([this.uri, to.uri]); if (this.uri === copyFailure) throw Error('copy failure'); }
}
class Directory {
  constructor(uri, entries = []) { this.uri = uri; this.name = uri.split('/').pop(); this.entries = entries; }
  list() { if (this.entries instanceof Error) throw this.entries; return this.entries; }
  static async pickDirectoryAsync() { picks++; if (pickerError) throw pickerError; return selectedFolder; }
}
const device = [];
class Query {
  constructor() { this.start = 0; }
  eq(field, value) { assert.equal(field, 'mediaType'); assert.equal(value, 'audio'); return this; }
  orderBy(field) { assert.equal(field, 'creationTime'); return this; }
  limit(count) { assert.equal(count, 100); this.count = count; return this; }
  offset(offset) { this.start = offset; return this; }
  async exe() { queries.push(this.start); if (pageFail && this.start > 0) throw Error('query failed'); return device.slice(repeating ? 0 : this.start, (repeating ? 0 : this.start) + this.count); }
}
const media = { Query, AssetField: { MEDIA_TYPE: 'mediaType', CREATION_TIME: 'creationTime' }, MediaType: { AUDIO: 'audio' }, requestPermissionsAsync: async (...args) => { permissions.push(args); return { granted }; } };
let scan;
const storage = load('src/services/local-music/storage.ts', {
  'react-native': platform,
  'expo-file-system/legacy': legacy,
  'expo-file-system': { File },
  'expo-document-picker': { getDocumentAsync: async () => { throw Error('Bulk import must not open multi-file picker'); } },
  'expo-sqlite': { openDatabaseAsync: async () => ({ execAsync: async () => {}, getAllAsync: async () => [...rows.values()].map(value => ({ value })), runAsync: async (_, id, value) => rows.set(id, value) }) },
  get './scan'() { return scan; },
});
scan = load('src/services/local-music/scan.ts', { 'react-native': platform, 'expo-file-system': { Directory }, 'expo-media-library': media, './storage': storage });
function original(uri, name, bytes) { files.set(uri, Buffer.from(bytes)); return new File(uri, name); }
let selectedFolder = new Directory('file:///selected');
async function main() {
  for (let i = 0; i < 205; i++) {
    const id = 'content://media/external/audio/media/' + i;
    original(id, 'track-' + i + '.mp3', 'audio fixture ' + i);
    device.push({ id, getFilename: async () => 'track-' + i + '.mp3', getDuration: async () => 120000 });
  }
  const progress = [];
  let result = await storage.importLocalSongs('device', count => progress.push(count));
  assert.equal(result.added, 205); assert.deepEqual(result.failures, []);
  assert.deepEqual(queries, [0, 100, 200]); assert.deepEqual(permissions, [[false, ['audio']]]);
  assert.equal(progress.at(-1), 205); assert.equal(rows.size, 205);
  assert.ok((await storage.readLocalSongs()).every(song => song.duration === 120));
  assert.equal([...files.keys()].filter(uri => uri.startsWith(legacy.cacheDirectory)).length, 0);
  assert.ok(device.every(asset => files.has(asset.id) && !deletes.includes(asset.id)), 'Device originals retained');
  result = await storage.importLocalSongs('device'); assert.equal(result.duplicates, 205); assert.equal(rows.size, 205);
  granted = false; const beforeQuery = queries.length;
  result = await storage.importLocalSongs('device'); assert.match(result.failures[0], /권한/); assert.equal(queries.length, beforeQuery); granted = true;
  os = 'ios'; const beforePermissions = permissions.length;
  result = await storage.importLocalSongs('device'); assert.match(result.failures[0], /폴더/); assert.equal(permissions.length, beforePermissions);
  const sub = new Directory('file:///selected/sub', [original('file:///selected/sub/a.flac', 'a.flac', 'FLAC folder fixture')]);
  const broken = new Directory('file:///selected/unreadable', Error('denied folder'));
  const cacheOriginal = original('file:///cache/selected/b.m4a', 'b.m4a', 'AAC folder fixture');
  selectedFolder = new Directory('file:///selected', [sub, broken, cacheOriginal, original('file:///selected/readme.txt', 'readme.txt', 'ignore me')]);
  sub.entries.push(selectedFolder); // Cycle must not loop forever.
  result = await storage.importLocalSongs('folder'); assert.equal(result.added, 2); assert.equal(result.failures.length, 1); assert.match(result.failures[0], /denied folder/);
  assert.ok(files.has(cacheOriginal.uri) && !deletes.includes(cacheOriginal.uri), 'Even an original under cache is never deleted');
  assert.equal(picks, 1); assert.equal(rows.size, 207); assert.ok((await storage.readLocalSongs()).some(song => song.title === 'a'));
  pickerError = { code: 'ERR_FILE_PICKING_CANCELLED' }; assert.equal((await storage.importLocalSongs('folder')).cancelled, true);
  os = 'android'; pickerError = { code: 'ERR_PICKER_CANCELLED' }; assert.equal((await storage.importLocalSongs('folder')).cancelled, true);
  pickerError = Error('provider failed'); await assert.rejects(storage.importLocalSongs('folder'), /provider failed/); pickerError = null;
  copyFailure = 'file:///selected/bad.mp3'; selectedFolder = new Directory('file:///selected', [original(copyFailure, 'bad.mp3', 'bad fixture'), original('file:///selected/good.wav', 'good.wav', 'WAV fixture')]);
  result = await storage.importLocalSongs('folder'); assert.equal(result.added, 1); assert.equal(result.failures.length, 1);
  assert.equal([...files.keys()].filter(uri => uri.includes('local-import-')).length, 0, 'Failed staging copy cleaned');
  assert.ok(files.has(copyFailure)); copyFailure = null;
  // Partial enumeration failure reports the error and keeps already imported songs.
  rows.clear(); pageFail = true;
  result = await storage.importLocalSongs('device'); assert.equal(result.added, 100); assert.match(result.failures[0], /query failed/); assert.equal((await storage.readLocalSongs()).length, 100); pageFail = false;
  repeating = true; result = await storage.importLocalSongs('device'); assert.match(result.failures[0], /반복/); repeating = false;
  const store = load('src/stores/local-music.ts', { zustand: { create }, '@/services/local-music/storage': storage }).useLocalMusicStore;
  await store.getState().importFiles('device'); assert.equal(store.getState().busy, false); assert.equal(store.getState().source, 'local'); assert.equal(store.getState().processed, 205); assert.equal(store.getState().songs.length, 205);
  assert.ok(copies.every(([, uri]) => uri.startsWith(legacy.cacheDirectory) || uri.startsWith(legacy.documentDirectory)));
  const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
  const plugin = config.plugins.find(entry => Array.isArray(entry) && entry[0] === 'expo-media-library')[1];
  assert.deepEqual(plugin.granularPermissions, ['audio']); assert.equal(plugin.photosPermission, false);
  assert.ok(config.android.blockedPermissions.includes('android.permission.READ_MEDIA_VISUAL_USER_SELECTED'));
  console.log('PASS: Android audio-only permission/pagination/duplicates/duration, permission denial and iOS guard, recursive folder import/cycle/unreadable folder/cancellation, original preservation, staging cleanup, partial scan failure, repeat-page guard and store progress.');
  console.log('Native MediaStore/SAF/iOS file-provider permissions and decoding still require a new build and real-device validation. No NAS or real music files were accessed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
