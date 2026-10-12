/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Buffer } = require('node:buffer');
const root = path.resolve(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));
const { create } = require(path.join(root, 'node_modules/zustand'));
const folderRules = load('src/services/local-music/folders.ts', {});
const exclusions = create(() => ({ folders: [], ready: true, load: async () => {} }));
function load(file, modules = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', ...Object.keys(globals), code)(name => {
    if (name in modules) return modules[name];
    if (name === 'zustand') return { create };
    throw Error('Unexpected dependency ' + name);
  }, mod, mod.exports, ...Object.values(globals));
  return mod.exports;
}
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function deferred() { let resolve; const promise = new Promise(ok => { resolve = ok; }); return { promise, resolve }; }
const files = new Map(), rows = new Map(), deletes = [], copies = [], sql = [];
let selection = { canceled: true }, pickerOptions, copyFails = false, databaseFails = false, platform = 'android';
const fileSystem = {
  documentDirectory: 'file:///documents/', cacheDirectory: 'file:///cache/',
  getInfoAsync: async (uri, options = {}) => files.has(uri) ? { exists: true, isDirectory: false, size: files.get(uri).length, md5: options.md5 ? crypto.createHash('md5').update(files.get(uri)).digest('hex') : undefined } : { exists: false },
  makeDirectoryAsync: async uri => { assert.equal(uri, fileSystem.documentDirectory + 'local-music/'); },
  copyAsync: async ({ from, to }) => { copies.push([from, to]); files.set(to, Buffer.from(files.get(from))); if (copyFails) throw Error('disk full'); },
  deleteAsync: async uri => { deletes.push(uri); files.delete(uri); },
};
const db = {
  execAsync: async statement => { sql.push(statement); },
  getAllAsync: async () => [...rows.values()].map(value => ({ value })),
  getFirstAsync: async (_, id) => rows.has(id) ? { value: rows.get(id) } : null,
  runAsync: async (statement, id, value) => { sql.push(statement); if (databaseFails) throw Error('DB failure'); rows.set(id, value); },
};
const storageModules = {
  '@/stores/folder-exclusions': { useFolderExclusionStore: exclusions },
  './folders': folderRules,
  'react-native': { Platform: { get OS() { return platform; } } },
  'expo-sqlite': { openDatabaseAsync: async name => { assert.equal(name, 'music-library.db'); return db; } },
  'expo-file-system/legacy': fileSystem,
  'expo-document-picker': { getDocumentAsync: async options => { pickerOptions = options; return selection; } },
};
const freshStorage = () => load('src/services/local-music/storage.ts', storageModules);
function asset(name, content, cache = true) {
  const uri = (cache ? fileSystem.cacheDirectory : 'content:///selected/') + name;
  files.set(uri, Buffer.from(content));
  return { name, uri, mimeType: 'audio/mpeg' };
}
async function main() {
  const storage = freshStorage();
  const original = asset('original.mp3', 'original bytes', false);
  const picked = asset('sample.mp3', 'original bytes');
  selection = { canceled: false, assets: [picked, asset('sample.m4a', 'AAC fixture'), asset('sample.flac', 'FLAC fixture')] };
  const result = await storage.importLocalSongs();
  assert.equal(result.added, 3); assert.equal(result.failures.length, 0);
  assert.equal(pickerOptions.multiple, true); assert.equal(pickerOptions.copyToCacheDirectory, true);
  assert.ok(pickerOptions.type.includes('audio/*'));
  assert.ok(files.has(original.uri)); assert.ok(!deletes.includes(original.uri));
  assert.ok(deletes.includes(picked.uri)); assert.ok(copies.every(([, to]) => to.startsWith('file:///documents/local-music/')));
  let songs = await storage.readLocalSongs();
  assert.ok(songs.every(song => song.source === 'local' && song.id.startsWith('local:') && !('path' in song)));
  assert.ok(songs.every(song => !JSON.stringify(song).includes('file:///') && !JSON.stringify(song).includes('content:///')));
  assert.equal(songs[0].title, 'sample'); assert.equal(songs[0].duration, 0);
  assert.ok(songs.every(song => song.albumSource === 'fallback'), 'Device imports are not treated as confirmed album tags');
  const storedBeforeMigration = rows.get(songs[0].id);
  const legacy = { ...songs[0], album: 'Original Folder', local: { ...songs[0].local, downloadedFrom: 'nas' } };
  delete legacy.albumSource;
  rows.set(legacy.id, JSON.stringify(legacy));
  const restoredLegacy = (await freshStorage().readLocalSongs()).find(song => song.id === legacy.id);
  assert.equal(restoredLegacy.albumSource, 'fallback', 'Legacy local folder names are normalized on reload');
  const tagged = { ...legacy, albumSource: 'tag' };
  rows.set(tagged.id, JSON.stringify(tagged));
  assert.equal((await freshStorage().readLocalSongs()).find(song => song.id === tagged.id).albumSource, 'tag', 'Reload preserves confirmed album tags');
  rows.set(songs[0].id, storedBeforeMigration);
  selection = { canceled: false, assets: [asset('renamed.mp3', 'original bytes')] };
  assert.equal((await storage.importLocalSongs()).duplicates, 1); assert.equal(rows.size, 3);
  selection = { canceled: false, assets: [asset('sample.mp3', 'different bytes')] };
  assert.equal((await storage.importLocalSongs()).added, 1); assert.equal(rows.size, 4, 'Same filename with different bytes is distinct');
  const oldUri = (await storage.localSource(songs[0])).uri;
  files.delete(oldUri);
  await assert.rejects(storage.localSource(songs[0]), /없거나/);
  selection = { canceled: false, assets: [asset('restored.mp3', 'original bytes')] };
  assert.equal((await storage.importLocalSongs()).added, 1); assert.equal(rows.size, 4);
  assert.ok((await storage.localSource(songs[0])).uri.startsWith('file:///documents/'));
  await storage.saveLocalDuration(songs[0].id, 123.5);
  assert.equal((await freshStorage().readLocalSongs())[0].duration, 123.5, 'Duration survives module/app restart');
  const restarted = freshStorage();
  assert.equal((await restarted.readLocalSongs()).length, 4);
  // iOS can move the app container. Only relative filenames are persisted.
  for (const [uri, bytes] of [...files]) if (uri.startsWith('file:///documents/')) files.set(uri.replace('file:///documents/', 'file:///new-container/'), bytes);
  fileSystem.documentDirectory = 'file:///new-container/';
  assert.ok((await restarted.localSource(songs[0])).uri.startsWith('file:///new-container/'));
  selection = { canceled: false, assets: [asset('unsupported.txt', 'text'), asset('empty.mp3', '')] };
  assert.equal((await storage.importLocalSongs()).failures.length, 2);
  copyFails = true;
  selection = { canceled: false, assets: [asset('copy-error.mp3', 'copy failure fixture')] };
  const beforeRows = rows.size;
  assert.equal((await storage.importLocalSongs()).failures.length, 1);
  assert.equal(rows.size, beforeRows); assert.ok(!files.has(copies.at(-1)[1]), 'Partial app copy removed after failure'); copyFails = false;
  databaseFails = true;
  selection = { canceled: false, assets: [asset('db-error.mp3', 'DB failure fixture')] };
  assert.equal((await storage.importLocalSongs()).failures.length, 1);
  assert.ok(!files.has(copies.at(-1)[1]), 'Unpublished new copy removed on DB failure'); databaseFails = false;
  selection = { canceled: true }; assert.equal((await storage.importLocalSongs()).cancelled, true);
  assert.ok(sql.every(statement => !statement.includes('DELETE FROM pages')), 'NAS cache remains untouched');
  assert.ok(sql.some(statement => statement.includes('local_tracks')));
  platform = 'web'; assert.deepEqual(await storage.readLocalSongs(), []); await assert.rejects(storage.importLocalSongs(), /iOS/); platform = 'android';
  console.log('PASS: multi-file selection, persistent app copies/SQLite, content duplicates, same-name distinct files, restart/container relocation, missing-file restore, cancellation, unsupported/empty files, copy/DB rollback, original preservation and web guard.');

  const localStore = load('src/stores/local-music.ts', { '@/services/local-music/storage': storage, './folder-exclusions': { useFolderExclusionStore: exclusions }, '@/services/local-music/folders': folderRules }).useLocalMusicStore;
  await localStore.getState().load();
  assert.equal(localStore.getState().songs.length, 4);
  await localStore.getState().recordDuration(songs[1].id, 99);
  assert.equal((await freshStorage().readLocalSongs()).find(song => song.id === songs[1].id).duration, 99);
  const a = localStore.getState().songs[0], b = localStore.getState().songs[1];
  const rules = load('src/features/hidden-music/rules.ts');
  const presets = [{ enabled: true, songIds: [a.id], folders: ['file:'] }];
  assert.equal(rules.hiddenMatcher(presets)(a), false, 'NAS presets never hide local tracks');
  const playback = load('src/stores/playback.ts').usePlaybackStore;
  const privacy = create(() => ({ ready: true, scope: null, profile: { presets } }));
  const auth = { mode: 'setup', session: null, generation: 0, expire: async () => { throw Error('Local playback must not expire NAS'); } };
  let nasRequests = 0, checks = 0, instances = 0, callback, remoteCallback;
  const loads = [], events = [];
  let pendingNas = null;
  class Engine {
    constructor() { instances++; }
    subscribe(fn) { callback = fn; }
    subscribeRemoteNavigation(fn) { remoteCallback = fn; }
    async load(source, song) { loads.push([source, song]); callback({ playing: true, buffering: false, position: 0, duration: song.source === 'local' ? 90 : 180, error: null, ended: false }); }
    pause() { events.push('pause'); }
    play() { events.push('play'); }
    async seek(time) { events.push(['seek', time]); }
    release() { events.push('release'); }
  }
  class SessionExpiredError extends Error {}
  class SynologyError extends Error {}
  const nas = { id: 'nas-song', source: 'nas', title: 'NAS fixture', album: 'Album', artist: 'Artist', duration: 180 };
  const controller = load('src/services/playback/controller.ts', {
    './audio-engine': { ExpoAudioEngine: Engine },
    '@/services/local-music/storage': storage, './folder-exclusions': { useFolderExclusionStore: exclusions }, '@/services/local-music/folders': folderRules,
    '@/stores/google-drive': { useGoogleDriveStore: selector => selector({ songs: [], loading: false, error: null }) },
    '@/stores/local-music': { useLocalMusicStore: localStore },
    '@/services/synology/api': { SessionExpiredError, SynologyError, SynologyClient: class { async checkSession() { checks++; } } },
    '@/features/library/repository': { musicRepository: () => { assert.ok(auth.session); nasRequests++; return { streamSource: async () => pendingNas ? pendingNas.promise : { uri: 'https://example.invalid/stream' } }; } },
    '@/stores/auth': { useAuthStore: { getState: () => auth } },
    '@/stores/playback': { usePlaybackStore: playback },
    '@/stores/player-background': { usePlayerBackgroundStore: { getState: () => ({ selectArtwork() {}, reset() {} }) } },
    '@/stores/hidden-music': { useHiddenMusicStore: privacy },
    '@/features/hidden-music/rules': rules,
  });
  await controller.playQueue([a, b]); await flush();
  assert.equal(loads.at(-1)[1].id, a.id); assert.equal(nasRequests, 0); assert.equal(checks, 0);
  assert.ok(loads.at(-1)[0].uri.startsWith('file:///new-container/'));
  await controller.seek(12); controller.togglePlayback(); controller.togglePlayback();
  assert.ok(events.some(event => Array.isArray(event) && event[0] === 'seek'));
  await controller.next(); assert.equal(loads.at(-1)[1].id, b.id);
  await controller.previous(false); assert.equal(loads.at(-1)[1].id, a.id);
  auth.mode = 'nas'; auth.session = { baseUrl: 'https://example.invalid', sid: 'fixture', account: 'fixture' };
  privacy.setState({ scope: rules.privacyScope(auth.mode, auth.session), ready: true });
  await controller.playQueue([nas, a, b]); assert.equal(loads.at(-1)[1].id, nas.id);
  await controller.next(); assert.equal(loads.at(-1)[1].id, a.id);
  await controller.previous(false); assert.equal(loads.at(-1)[1].id, nas.id);
  await controller.next();
  const requestsBeforeExpiry = nasRequests;
  auth.mode = 'setup'; auth.session = null;
  const releasesBefore = events.filter(event => event === 'release').length;
  privacy.setState({ ready: false, scope: null });
  assert.equal(playback.getState().queue[playback.getState().index].id, a.id);
  assert.equal(playback.getState().playing, true); assert.equal(events.filter(event => event === 'release').length, releasesBefore);
  assert.ok(playback.getState().queue.every(song => song.source === 'local'));
  callback({ playing: false, buffering: false, position: 3, duration: 90, error: 'local failure', ended: false }); await flush(); assert.equal(checks, 0);
  await controller.next(); assert.equal(nasRequests, requestsBeforeExpiry);
  assert.equal(instances, 1, 'One audio engine across all sources and queue navigation');
  privacy.setState({ ready: true });
  files.delete((await storage.localSource(a)).uri);
  await controller.playQueue([a]);
  assert.match(playback.getState().error, /없거나/); assert.equal(playback.getState().playing, false);
  const playsBefore = events.filter(event => event === 'play').length;
  controller.togglePlayback(); await flush();
  assert.equal(events.filter(event => event === 'play').length, playsBefore, 'Retry of missing file cannot play the previously loaded source');
  // Repair and ensure an older NAS source completion cannot replace a local choice.
  selection = { canceled: false, assets: [asset('repair.mp3', 'original bytes')] }; await storage.importLocalSongs();
  auth.mode = 'nas'; auth.session = { baseUrl: 'https://example.invalid', sid: 'new-fixture', account: 'fixture' }; privacy.setState({ scope: rules.privacyScope(auth.mode, auth.session), ready: true });
  pendingNas = deferred(); const older = controller.playQueue([nas]);
  await controller.playQueue([a, b]); pendingNas.resolve({ uri: 'https://example.invalid/obsolete' }); await older;
  assert.equal(loads.at(-1)[1].id, a.id); pendingNas = null;
  playback.setState({ shuffle: false, repeat: 'all' }); await controller.playQueue([a, b], 1); await controller.next(true); assert.equal(playback.getState().index, 0);
  playback.setState({ repeat: 'one' }); const loadCount = loads.length; await controller.next(true); assert.equal(loads.length, loadCount);
  playback.setState({ repeat: 'off', shuffle: true }); await controller.next(); assert.equal(playback.getState().index, 1);
  remoteCallback('previous'); await flush(); assert.equal(instances, 1);
  controller.stopPlayback();
  auth.mode = 'nas'; privacy.setState({ ready: true, scope: rules.privacyScope(auth.mode, auth.session) });
  await controller.playQueue([a, b], 0);
  controller.reconcilePlaybackVisibility(song => song.source === 'local' && song.id === b.id);
  assert.deepEqual(playback.getState().queue.map(song => song.id), [a.id]);
  assert.equal(playback.getState().index, 0);
  controller.reconcilePlaybackVisibility(song => song.source === 'local' && song.id === a.id);
  assert.equal(playback.getState().queue.length, 0, 'Excluding current local song stops and clears playback');
  console.log('PASS: actual controller/store with Mock audio: unauthenticated/offline local playback, NAS↔local transitions, shared queue, seek/pause/next/previous, repeat/shuffle/remote commands, session-change survival, no local NAS auth checks, duration persistence, missing-file retry and stale source protection.');

  const metadata = load('src/features/library/load-song-library.ts');
  const albums = load('src/features/library/album-library.ts');
  const search = load('src/features/library/search-songs.ts');
  const localState = { source: 'all', ready: true, songs: [a, b] };
  const libraryPreferences = { ready: true, includeFolderAlbums: true };
  let queryResult = null;
  const hooks = load('src/features/library/queries.ts', {
    '@/stores/library-preferences': { useLibraryPreferences: selector => selector(libraryPreferences) },
    react: { useCallback: fn => fn, useMemo: fn => fn() },
    '@tanstack/react-query': { useQuery: options => queryResult ?? options },
    '@/stores/google-drive': { useGoogleDriveStore: selector => selector({ songs: [], loading: false, error: null }) },
    '@/stores/local-music': { useLocalMusicStore: selector => selector(localState) },
    '@/stores/auth': { useAuthStore: selector => selector(auth) },
    '@/stores/hidden-music': { useHiddenMusicStore: selector => selector(privacy.getState()) },
    './repository': { musicRepository: () => ({ songs: async () => ({ items: [nas], total: 1 }) }), libraryIdentity: () => 'fixture' },
    './load-song-library': metadata, './album-library': albums, './search-songs': search,
    '../hidden-music/rules': rules,
  });
  const page = { items: [nas], total: 1 };
  assert.equal(hooks.useSongs().select(page).total, 3);
  assert.equal(hooks.useRawSongLibrary().select(page).total, 1);
  localState.source = 'local'; assert.deepEqual(hooks.useSongs().select(page).items.map(song => song.id), [a.id, b.id]);
  assert.equal((await hooks.useSongs().queryFn({})).total, 0, 'Device selection never calls NAS');
  const importedSongs = localState.songs;
  const localFolder = { ...a, album: 'Same Album', albumSource: 'fallback', albumId: undefined };
  const localTag = { ...b, album: 'Same Album', albumSource: 'tag', albumId: undefined };
  const legacyFolder = { ...localFolder, id: 'legacy-local-folder', albumSource: undefined };
  localState.songs = [localFolder, localTag, legacyFolder];
  assert.equal(hooks.useAlbums().select(page).total, 2, 'Tagged and folder albums with the same name remain separate');
  libraryPreferences.includeFolderAlbums = false;
  const onlyTagged = hooks.useAlbums().select(page);
  assert.equal(onlyTagged.total, 1);
  assert.equal(onlyTagged.items[0].songCount, 1, 'Only the confirmed local album remains with the option off');
  assert.deepEqual(hooks.useAlbumSongs(onlyTagged.items[0]).select(page).items.map(song => song.id), [localTag.id]);
  assert.equal(hooks.useSongs().select(page).total, 3, 'Turning off folder albums keeps all local songs accessible');
  localState.source = 'all';
  assert.equal(hooks.useAlbums().select(page).total, 2, 'All-sources view also filters local folder albums');
  libraryPreferences.includeFolderAlbums = true;
  assert.equal(hooks.useAlbums().select(page).total, 3, 'Turning the option back on restores local folder albums');
  localState.songs = importedSongs;
  localState.source = 'nas'; assert.equal(hooks.useSongs().select(page).total, 1);
  localState.source = 'all'; assert.equal(hooks.useSearch('sample').select(page).total, 2);
  queryResult = { isError: true, isPending: false, data: undefined, error: new Error('offline') };
  assert.equal(hooks.useSongs().data.total, 2); assert.equal(hooks.useSongs().isRefetchError, true); assert.equal(hooks.useSongs().error.message, 'offline');
  const realApi = load('src/services/synology/api.ts', {}, {
    fetch: async () => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => JSON.stringify({ success: true, data: { songs: [{ id: a.id, title: 'Reserved NAS ID' }], total: 1 } }) }),
  });
  const apis = Object.fromEntries(['Song', 'Cover', 'Stream'].map(name => ['SYNO.AudioStation.' + name, { path: 'entry.cgi', minVersion: 1, maxVersion: 2 }]));
  const client = new realApi.SynologyClient({ baseUrl: 'https://example.invalid', sid: 'fixture', apis });
  const mapped = (await client.songs({ offset: 0, limit: 1 })).items[0];
  assert.notEqual(mapped.id, a.id, 'NAS raw IDs cannot collide with reserved local IDs');
  assert.equal(mapped.nasId, a.id);
  assert.equal(new URL(client.streamSource(mapped).uri).searchParams.get('id'), a.id, 'Original NAS wire ID retained');
  assert.throws(() => client.streamSource(a), /로컬 음악/);
  console.log('PASS: whole/NAS/device selection, local search/album selection, NAS-only hidden metadata and visible local fallback without changing NAS cache or suppressing its error.');
  console.log('Native picker, file permissions, actual decoding/seek/background/lock-screen and iOS/Android UI require device verification. No NAS or real music files were accessed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
