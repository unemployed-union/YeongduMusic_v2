const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..');
const projectRequire = createRequire(path.join(root, 'package.json'));
const ts = projectRequire('typescript');
const tanstack = projectRequire('@tanstack/react-query');
const { create } = projectRequire('zustand');
const clients = [];
const observers = [];
function load(file, overrides = {}) {
  overrides = { ...require('./test-cloud-fixtures.cjs').cloudFixtures({}, overrides), ...overrides };
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => name in overrides ? overrides[name] : projectRequire(name), mod, mod.exports);
  return mod.exports;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
const rules = load('src/features/hidden-music/rules.ts');
const metadata = load('src/features/library/load-song-library.ts');
const albumHelpers = load('src/features/library/album-library.ts');
const searchHelpers = load('src/features/library/search-songs.ts');
const { mockRepository } = load('src/features/library/mock-repository.ts');
const song = (id, location, artist = 'Artist', album = 'Album') => ({ id, path: location, title: id, artist, album, duration: 180 });
const songs = [song('pop', '/music/Pop/a.mp3'), song('child', '/music/Pop/Live/b.mp3'), song('boundary', '/music/Popcorn/c.mp3'), song('personal', '/home/music/private.mp3', 'Private Artist', 'Private Album'), song('case', '/music/pop/lower.mp3')];
const preset = { id: 'folder', name: '폴더 숨김', enabled: true, folders: ['/music/Pop/'], songIds: [] };
const selected = { id: 'selected', name: '선택 곡', enabled: true, folders: [], songIds: ['personal'] };
const saved = new Map();
let readOverride = null;
let writeFailure = false;
let biometricOverride = null;
let biometricCalls = 0;
const privacyModule = load('src/stores/hidden-music.ts', {
  '@/features/hidden-music/rules': rules,
  '@/services/hidden-music/storage': {
    readHiddenProfile: async scope => readOverride ? readOverride(scope) : saved.has(scope) ? rules.parseProfile(saved.get(scope)) : rules.emptyProfile(),
    writeHiddenProfile: async (scope, profile) => { if (writeFailure) throw new Error('disk full'); saved.set(scope, JSON.stringify(profile)); },
  },
  '@/services/hidden-music/biometrics': { authenticateHiddenSettings: async () => { biometricCalls++; if (biometricOverride) return biometricOverride(); } },
});
const privacy = privacyModule.useHiddenMusicStore;
const auth = { mode: 'mock', session: null };
const localFixture = { songs: [], ready: true, source: 'nas' };
const queries = load('src/features/library/queries.ts', {
  '@/stores/library-preferences': { useLibraryPreferences: selector => selector({ ready: true, includeFolderAlbums: true }) },
  react: { useMemo: factory => factory(), useCallback: callback => callback },
  '@/stores/google-drive': { useGoogleDriveStore: selector => selector({ songs: [], loading: false, error: null }) },
  '@/stores/local-music': { useLocalMusicStore: selector => selector(localFixture) },
  '@tanstack/react-query': { useQuery: options => options },
  './album-library': albumHelpers, './load-song-library': metadata, './search-songs': searchHelpers,
  './repository': { libraryIdentity: () => 'demo-query', musicRepository: () => ({ songs: async page => ({ items: songs.slice(page.offset, page.offset + page.limit), total: songs.length }) }) },
  '../hidden-music/rules': rules,
  '@/stores/auth': { useAuthStore: selector => selector(auth) },
  '@/stores/hidden-music': { useHiddenMusicStore: selector => selector(privacy.getState()) },
});

async function main() {
  assert.deepEqual(songs.filter(rules.hiddenMatcher([preset, selected])).map(song => song.id), ['pop', 'child', 'personal']);
  assert.equal(rules.hiddenMatcher([{ ...preset, enabled: false }])(songs[0]), false);
  assert.equal(rules.hiddenMatcher([{ ...preset, folders: ['\\music\\Pop\\'] }])(songs[1]), true);
  assert.equal(rules.hiddenMatcher([preset])(song('absent', undefined)), false);
  assert.equal(rules.hiddenMatcher([{ ...selected, songIds: ['absent'] }])(song('absent', undefined)), true);
  assert.equal(rules.hiddenMatcher([preset])(song('new-file', '/music/Pop/New/new.mp3')), true);
  assert.equal(rules.visibleSongs({ items: songs, total: songs.length, stale: true }, [preset]).stale, true);
  assert.equal(rules.visibleSongs({ items: songs, total: songs.length }, [preset]).total, 3);
  assert.deepEqual(rules.foldersForSongs(songs).find(folder => folder.path === '/music/Pop'), { path: '/music/Pop', count: 2 });
  assert.equal(rules.foldersForSongs([song('relative', 'music/Folder/file.mp3')]).find(folder => folder.path === 'music/Folder').count, 1);
  assert.equal(rules.foldersForSongs([song('no-path', undefined)]).length, 0);
  assert.equal(rules.privacyScope('mock', null), 'demo');
  assert.equal(rules.privacyScope('nas', { baseUrl: 'https://example.invalid' }), null);
  const scope = rules.privacyScope('nas', { baseUrl: 'https://example.invalid', account: 'alice', sid: 'one' });
  assert.equal(scope, rules.privacyScope('nas', { baseUrl: 'https://example.invalid', account: 'alice', sid: 'two' }));
  assert.notEqual(scope, rules.privacyScope('nas', { baseUrl: 'https://example.invalid', account: 'bob' }));
  assert.notEqual(scope, rules.privacyScope('nas', { baseUrl: 'https://different.invalid', account: 'alice' }));
  assert.throws(() => rules.parseProfile('{broken'));
  assert.throws(() => rules.parseProfile(JSON.stringify({ version: 2, presets: [] })));
  assert.throws(() => rules.parseProfile(JSON.stringify({ version: 1, biometricLock: false, presets: [preset, preset] })));

  await privacy.getState().load('demo');
  await privacy.getState().savePreset({ ...preset, name: '  폴더 숨김  ' });
  assert.equal(privacy.getState().profile.presets[0].name, '폴더 숨김');
  assert.equal(privacy.getState().profile.presets[0].folders[0], '/music/Pop');
  await privacy.getState().savePreset(selected);
  await assert.rejects(privacy.getState().savePreset({ ...preset, name: '  ' }), /이름/);
  await assert.rejects(privacy.getState().savePreset({ ...preset, folders: [], songIds: [] }), /하나 이상/);
  writeFailure = true;
  const original = privacy.getState().profile;
  await assert.rejects(privacy.getState().togglePreset('folder'), /disk full/);
  assert.equal(privacy.getState().profile, original);
  assert.equal(privacy.getState().busy, false);
  writeFailure = false;

  const client = new tanstack.QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  clients.push(client);
  const songsObserver = new tanstack.QueryObserver(client, queries.useSongs());
  observers.push(songsObserver);
  const unsub = songsObserver.subscribe(() => {});
  await songsObserver.refetch();
  assert.deepEqual(songsObserver.getCurrentResult().data.items.map(song => song.id), ['boundary', 'case']);
  assert.equal(client.getQueryData(['song-library', 'demo-query']).total, 5);
  assert.equal(new tanstack.QueryObserver(client, queries.useRawSongLibrary()).getCurrentResult().data.total, 5);
  const albums = new tanstack.QueryObserver(client, queries.useAlbums());
  const artists = new tanstack.QueryObserver(client, queries.useArtists());
  const search = new tanstack.QueryObserver(client, queries.useSearch('personal'));
  const artistSongs = new tanstack.QueryObserver(client, queries.useArtistSongs({ id: 'Private Artist', name: 'Private Artist' }));
  const privateAlbum = albumHelpers.albumsFromSongs({ items: songs, total: 5 }).items.find(album => album.title === 'Private Album');
  const albumSongs = new tanstack.QueryObserver(client, queries.useAlbumSongs(privateAlbum));
  observers.push(albums, artists, search, artistSongs, albumSongs);
  assert.equal(albums.getCurrentResult().data.total, 1);
  assert.equal(artists.getCurrentResult().data.total, 1);
  assert.equal(search.getCurrentResult().data.total, 0);
  assert.equal(artistSongs.getCurrentResult().data.total, 0);
  assert.equal(albumSongs.getCurrentResult().data.total, 0);
  await privacy.getState().togglePreset('selected');
  songsObserver.setOptions(queries.useSongs());
  assert.equal(songsObserver.getCurrentResult().data.total, 3);
  await privacy.getState().togglePreset('selected');
  unsub();

  biometricOverride = async () => { throw new Error('cancelled'); };
  await assert.rejects(privacy.getState().setBiometricLock(true), /cancelled/);
  assert.equal(privacy.getState().profile.biometricLock, false);
  biometricOverride = null;
  await privacy.getState().setBiometricLock(true);
  assert.equal(privacy.getState().profile.biometricLock, true);
  assert.equal(privacy.getState().unlocked, true);
  privacy.getState().lock();
  await assert.rejects(privacy.getState().togglePreset('selected'), /생체 인증/);
  await assert.rejects(privacy.getState().removePreset('selected'), /생체 인증/);
  await assert.rejects(privacy.getState().setBiometricLock(false), /생체 인증/);
  biometricOverride = async () => { throw new Error('user cancelled'); };
  await privacy.getState().unlock();
  assert.equal(privacy.getState().unlocked, false);
  assert.equal(rules.hiddenMatcher(privacy.getState().profile.presets)(songs[3]), true);
  biometricOverride = null;
  await privacy.getState().unlock();
  assert.equal(privacy.getState().unlocked, true);
  privacy.getState().lock();
  const pending = deferred();
  biometricOverride = () => pending.promise;
  const unlockPromise = privacy.getState().unlock();
  privacy.getState().lock();
  pending.resolve();
  await unlockPromise;
  assert.equal(privacy.getState().unlocked, false);
  const otherPending = deferred();
  biometricOverride = () => otherPending.promise;
  const lateUnlock = privacy.getState().unlock();
  await privacy.getState().load('another-account');
  otherPending.resolve();
  await lateUnlock;
  assert.equal(privacy.getState().scope, 'another-account');
  assert.equal(privacy.getState().unlocked, false);
  assert.equal(privacy.getState().profile.presets.length, 0);
  biometricOverride = null;
  await privacy.getState().load('demo');
  assert.equal(privacy.getState().profile.presets.length, 2);
  assert.equal(privacy.getState().profile.biometricLock, true);
  assert.equal(privacy.getState().unlocked, false);
  await privacy.getState().unlock();
  await privacy.getState().setBiometricLock(false);
  await privacy.getState().removePreset('selected');
  assert.equal(privacy.getState().profile.presets.length, 1);
  readOverride = async () => { throw new Error('corrupt database'); };
  await privacy.getState().load('demo');
  assert.equal(privacy.getState().ready, false);
  assert.match(privacy.getState().error, /corrupt/);
  assert.equal(queries.useSongs().enabled, false);
  readOverride = null;
  await privacy.getState().load('demo');

  // A slow profile load for the old account cannot replace a newer account.
  const slowRead = deferred();
  readOverride = current => current === 'slow' ? slowRead.promise : Promise.resolve(rules.emptyProfile());
  const oldLoad = privacy.getState().load('slow');
  await privacy.getState().load('new');
  slowRead.resolve({ ...rules.emptyProfile(), presets: [preset] });
  await oldLoad;
  assert.equal(privacy.getState().scope, 'new');
  assert.equal(privacy.getState().profile.presets.length, 0);
  readOverride = null;
  await privacy.getState().load('demo');

  // Test real playback controller and stores with an in-memory audio engine.
  const playback = load('src/stores/playback.ts').usePlaybackStore;
  const engineEvents = [];
  class FakeEngine {
    subscribe(listener) { this.listener = listener; return () => {}; }
    subscribeRemoteNavigation(listener) { this.remote = listener; return () => {}; }
    async load(source, song) { engineEvents.push(['load', song.id]); this.listener({ playing: true, buffering: false, position: 0, duration: 180, error: null, ended: false }); }
    play() { engineEvents.push(['play']); }
    pause() { engineEvents.push(['pause']); }
    release() { engineEvents.push(['release']); }
    async seek() {}
  }
  const controller = load('src/services/playback/controller.ts', {
    './audio-engine': { ExpoAudioEngine: FakeEngine },
    '@/services/synology/api': { SessionExpiredError: class extends Error {}, SynologyError: class extends Error {} },
    '@/features/library/repository': { musicRepository: () => ({ streamSource: async song => ({ uri: 'https://example.invalid/' + song.id }) }) },
    '@/stores/auth': { useAuthStore: { getState: () => auth } },
    '@/stores/playback': { usePlaybackStore: playback },
    '@/stores/player-background': { usePlayerBackgroundStore: { getState: () => ({ selectArtwork() {}, reset() {} }) } },
    '@/stores/hidden-music': { useHiddenMusicStore: privacy },
    '@/features/hidden-music/rules': rules,
  });
  await controller.playQueue(songs, 2);
  assert.deepEqual(playback.getState().queue.map(song => song.id), ['boundary', 'personal', 'case']);
  assert.equal(playback.getState().index, 0);
  assert.equal(engineEvents.filter(event => event[0] === 'load').at(-1)[1], 'boundary');
  await controller.enqueue(songs[0]);
  assert.equal(playback.getState().queue.length, 3);
  await controller.playQueue(songs, 0);
  assert.equal(playback.getState().queue[playback.getState().index].id, 'boundary');
  await privacy.getState().savePreset(selected);
  assert.deepEqual(playback.getState().queue.map(song => song.id), ['boundary', 'case']);
  assert.equal(playback.getState().playing, true);
  await controller.next();
  assert.equal(playback.getState().queue[playback.getState().index].id, 'case');
  await privacy.getState().savePreset({ ...selected, songIds: ['case'] });
  assert.equal(playback.getState().queue.length, 0);
  assert.equal(playback.getState().playing, false);
  assert.ok(engineEvents.some(event => event[0] === 'release'));
  await controller.playQueue(songs, 2);
  await privacy.getState().load('another-account');
  assert.equal(playback.getState().queue.length, 0);

  // Native authentication options and failure paths, never actual biometrics.
  let options;
  let authResult = { success: true };
  let enrolledLevel = 3;
  const biometrics = load('src/services/hidden-music/biometrics.ts', {
    'react-native': { Platform: { OS: 'android', Version: 37 } },
    'expo-local-authentication': { SecurityLevel: { NONE: 0 }, getEnrolledLevelAsync: async () => enrolledLevel, authenticateAsync: async value => { options = value; return authResult; } },
  });
  await biometrics.authenticateHiddenSettings();
  assert.equal(options.disableDeviceFallback, false);
  assert.equal(options.biometricsSecurityLevel, 'strong');
  authResult = { success: false, error: 'user_cancel' };
  await assert.rejects(biometrics.authenticateHiddenSettings(), /완료하지/);
  authResult = { success: false, error: 'lockout' };
  await assert.rejects(biometrics.authenticateHiddenSettings(), /잠겼/);
  enrolledLevel = 0;
  await assert.rejects(biometrics.authenticateHiddenSettings(), /등록/);

  // Releasing an engine during its asynchronous audio setup cannot start playback later.
  const setup = deferred();
  let playerCreations = 0;
  const { ExpoAudioEngine } = load('src/services/playback/audio-engine.ts', {
    'expo-audio': { setAudioModeAsync: () => setup.promise, createAudioPlayer: () => { playerCreations++; throw new Error('Must not create after release'); } },
    'expo-constants': { default: { appOwnership: 'standalone' }, AppOwnership: { Expo: 'expo' } },
    'react-native': { Platform: { OS: 'android' } },
  });
  const engine = new ExpoAudioEngine();
  const pendingLoad = engine.load({ uri: 'https://example.invalid/audio' }, songs[0]);
  engine.release();
  setup.resolve();
  await assert.rejects(pendingLoad, /취소/);
  assert.equal(playerCreations, 0);

  // Storage binding and profile parsing are exercised without native SQLite.
  const storageRows = new Map();
  const sqlite = {
    execAsync: async () => {},
    getFirstAsync: async (sql, current) => storageRows.has(current) ? { value: storageRows.get(current) } : null,
    runAsync: async (sql, current, json) => storageRows.set(current, json),
  };
  const storage = load('src/services/hidden-music/storage.ts', {
    'react-native': { Platform: { OS: 'android' } }, 'expo-sqlite': { openDatabaseAsync: async () => sqlite }, '@/features/hidden-music/rules': rules,
  });
  await storage.writeHiddenProfile(scope, { ...rules.emptyProfile(), presets: [preset] });
  assert.equal((await storage.readHiddenProfile(scope)).presets[0].id, 'folder');
  assert.equal((await storage.readHiddenProfile('unknown-account')).presets.length, 0);
  storageRows.set(scope, 'broken');
  await assert.rejects(storage.readHiddenProfile(scope));
  const demo = await metadata.loadSongLibrary(mockRepository, new AbortController().signal);
  assert.ok(rules.foldersForSongs(demo.items).some(folder => folder.path === '/demo/music'));
  assert.ok(biometricCalls > 0);
  console.log('PASS: folder boundaries/descendants/future songs, multiple presets, per-song selection, account/NAS persistence, storage failures and corrupt profiles, protected mutations, cancelled/late biometrics, relocking, stale load isolation, shared-cache filtering across all library screens, queue pruning/current playback stop, native setup cancellation, SQLite parameter binding, and demo folders. Biometrics, audio engine and SQLite are mocked; actual NAS/device behavior remains unverified.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { for (const observer of observers) observer.destroy(); for (const client of clients) client.clear(); });
