/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const { create } = require('zustand');
function load(file, dependencies = {}, globals = {}) {
  const modules = { ...require('./test-cloud-fixtures.cjs').cloudFixtures(globals, dependencies), ...dependencies };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  new Function('require', 'exports', ...Object.keys(globals), code)(name => {
    if (name === 'zustand') return { create };
    if (name === '@aws-crypto/sha256-js') return require(name);
    if (name in modules) return modules[name];
    throw Error('Unexpected MYBOX dependency ' + name);
  }, exports, ...Object.values(globals));
  return exports;
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
const flush = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };
const requests = [], delays = [];
const token = 'mbx_pat_fixture-only-not-a-real-token';
const file = (id = 'file-a', name = 'Song.flac', parentPath = '/Music/Album/', size = 32) => ({ resourceId: id, name, parentPath, parentId: 'fixture-mybox-root-account', size, modifiedAt: '2026-10-19T00:00:00Z' });
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
let network = async () => response({ resources: [file()], responseMetaData: {} });
const api = load('src/services/mybox/api.ts', {}, {
  fetch: async (url, options) => { requests.push({ url, options }); return network(url, options); },
  setTimeout: (fn, ms) => { delays.push(ms); return setTimeout(fn, ms === 2100 ? 0 : ms); }, clearTimeout,
});
async function main() {
  const connection = api.prepareMyboxConnection({ token: ' ' + token + ' ', folder: '/Music' }, 'mbx-test-connection');
  assert.equal(connection.folder, '/Music/'); assert.equal(connection.token, token);
  assert.deepEqual(api.publicMyboxConnection(connection), { id: connection.id, folder: '/Music/' });
  for (const input of [{ token: 'bad' }, { token, folder: '../Music' }, { token, folder: '/Music/../Other' }, { token, folder: '/Music\\Other' }]) assert.throws(() => api.prepareMyboxConnection(input));
  let pages = 0;
  network = async () => response(++pages === 1 ? { resources: [file(), file('ignored', 'Image.jpg')], responseMetaData: { nextCursor: 'opaque+cursor=' } } : { resources: [file(), file('file-b', 'Other.mp3')], responseMetaData: {} });
  const progress = [], songs = await api.loadMyboxSongs(connection, undefined, value => progress.push(value));
  assert.equal(songs.length, 2); assert.deepEqual(progress, [2, 4]); assert(delays.includes(2100), 'Search pages respect the 30/minute limit');
  assert.equal(songs[0].source, 'mybox'); assert.equal(songs[0].album, 'Album');
  assert(!JSON.stringify(songs).includes(token), 'Song records never include the PAT');
  const first = new URL(requests[0].url), second = new URL(requests[1].url);
  assert.equal(first.pathname, '/v1/search/resources/files'); assert.equal(first.searchParams.get('category'), 'audio');
  assert.equal(first.searchParams.get('parentPath'), '/Music/'); assert.equal(second.searchParams.get('cursor'), 'opaque+cursor=');
  assert(requests.every(item => item.options.headers.Authorization === 'Bearer ' + token && item.options.redirect === 'error'));
  network = async () => response({ downloadUrl: 'https://storage.example.invalid/v1/storage/download?atoken=private-url', expiresIn: 600 });
  const remote = await api.myboxDownloadSource(connection, 'id/with+symbols');
  assert.deepEqual(Object.keys(remote), ['uri'], 'The storage host must not receive the PAT header');
  assert(requests.at(-1).url.includes('id%2Fwith%2Bsymbols'));
  for (const downloadUrl of ['http://unsafe.invalid/file', 'https://user:password@storage.invalid/file', 'not-a-url']) {
    network = async () => response({ downloadUrl, expiresIn: 600 }); await assert.rejects(api.myboxDownloadSource(connection, 'file-a'));
  }
  for (const status of [401, 403, 404, 429, 503]) {
    network = async () => response({ message: token }, status);
    await assert.rejects(api.listMyboxSongs(connection), error => error.status === status && !error.message.includes(token));
  }
  for (const resources of [null, [file('bad', 'Song.mp3', '/MusicElse/')], [{ ...file(), size: -1 }]]) {
    network = async () => response({ resources }); await assert.rejects(api.listMyboxSongs(connection));
  }
  network = async () => response({ resources: [file()], responseMetaData: { nextCursor: 'loop' } });
  await assert.rejects(api.loadMyboxSongs(connection), /반복/);
  network = async () => response({ resources: [], responseMetaData: { nextCursor: 'next' } });
  const abort = new AbortController(), scanning = api.loadMyboxSongs(connection, abort.signal); await flush(); abort.abort();
  await assert.rejects(scanning, /취소/);
  network = async () => response({ resources: [file()], responseMetaData: {} });
  const identified = await api.identifyMyboxConnection(connection);
  assert.equal((await api.identifyMyboxConnection({ ...connection, token: 'mbx_pat_rotated-fixture', folder: '/Other/' })).id, identified.id, 'Token rotation and folder selection keep the account scope');
  network = async () => response({ resources: [{ ...file(), parentId: 'fixture-mybox-different-account' }] });
  assert.notEqual((await api.identifyMyboxConnection(connection)).id, identified.id, 'Different drive roots cannot share likes, metadata or playlists');
  network = async () => response({ resources: [file()], responseMetaData: {} });
  const secure = new Map(), writes = []; let writeGate = null, scanGate = null;
  const secureStore = {
    AFTER_FIRST_UNLOCK: 'after-first-unlock', getItemAsync: async key => secure.get(key) ?? null,
    setItemAsync: async (key, value, options) => { writes.push({ key, options }); if (writeGate) await writeGate.promise; secure.set(key, value); },
    deleteItemAsync: async key => { secure.delete(key); },
  };
  const storeDeps = { 'react-native': { Platform: { OS: 'android' } }, 'expo-secure-store': secureStore,
    '@/services/mybox/api': { ...api, loadMyboxSongs: (...args) => scanGate ? scanGate.promise : api.loadMyboxSongs(...args) },
    '@/services/mybox/playback-cache': { clearMyboxPlaybackCache: async () => {}, prepareMyboxPlayback: async (_, source) => { await source(); return { uri: 'file:///cache/prepared.flac' }; } } };
  const store = load('src/stores/mybox.ts', storeDeps).useMyboxStore;
  await store.getState().bootstrap(); await store.getState().connect({ token, folder: '/Music/' });
  assert.equal(store.getState().songs.length, 1); assert.equal(store.getState().error, null);
  assert(!JSON.stringify(store.getState()).includes(token)); assert.equal(writes[0].options.keychainAccessible, 'after-first-unlock');
  const savedSong = store.getState().songs[0], savedId = store.getState().connection.id;
  network = async () => response({ downloadUrl: 'https://storage.example.invalid/download?atoken=fixture', expiresIn: 600 });
  assert((await store.getState().source(savedSong)).uri.startsWith('https://'));
  assert((await store.getState().playbackSource(savedSong)).uri.startsWith('file://'));
  await assert.rejects(store.getState().source({ ...savedSong, mybox: { ...savedSong.mybox, connectionId: 'other-account' } }));
  await assert.rejects(store.getState().source({ ...savedSong, path: '/MusicElse/Song.flac' }));
  network = async () => response({ resources: [file()], responseMetaData: {} });
  const restarted = load('src/stores/mybox.ts', storeDeps).useMyboxStore; await restarted.getState().bootstrap();
  assert.equal(restarted.getState().connection.id, savedId, 'Account scope survives restart');
  scanGate = deferred(); const old = store.getState().refresh(); await flush();
  await store.getState().disconnect(); scanGate.resolve([savedSong]); await old; scanGate = null;
  assert.equal(store.getState().connection, null); assert.deepEqual(store.getState().songs, []); assert.equal(secure.size, 0);
  await assert.rejects(store.getState().source(savedSong), 'Disconnected songs cannot obtain new URLs');
  writeGate = deferred(); const connecting = store.getState().connect({ token }); await flush(); store.getState().cancel();
  writeGate.resolve(); await connecting; writeGate = null;
  assert.equal(secure.size, 0, 'Cancel during secure persistence cannot resurrect credentials');
  assert.equal(store.getState().connection, null);

  const files = new Map([['file:///cache/mybox-playback/track-old.part', 5], ['file:///cache/mybox-playback/keep.txt', 5]]), transfers = [];
  let transferGate = null, freeSpace = 1024 * 1024 * 1024, wrongSize = false, badMime = false, cancelCount = 0;
  const cacheFs = {
    cacheDirectory: 'file:///cache/', makeDirectoryAsync: async () => {}, readDirectoryAsync: async () => ['track-old.part', 'keep.txt'],
    deleteAsync: async uri => { files.delete(uri); }, getFreeDiskStorageAsync: async () => freeSpace,
    getInfoAsync: async uri => files.has(uri) ? { exists: true, size: files.get(uri), isDirectory: false } : { exists: false },
    moveAsync: async ({ from, to }) => { files.set(to, files.get(from)); files.delete(from); },
    createDownloadResumable: (url, uri, options) => {
      transfers.push({ url, options }); let canceled = false;
      return { downloadAsync: async () => { files.set(uri, wrongSize ? 7 : 32); if (transferGate) await transferGate.promise; return canceled ? undefined : { status: 200, mimeType: badMime ? 'text/html' : 'audio/flac', headers: {} }; },
        cancelAsync: async () => { canceled = true; cancelCount++; transferGate?.resolve(); } };
    },
  };
  const cache = load('src/services/mybox/playback-cache.ts', { 'expo-file-system/legacy': cacheFs, './api': api,
    '@/services/offline-music/formats': load('src/services/offline-music/formats.ts') });
  let urls = 0;
  const downloadSource = async () => { urls++; return { uri: 'https://storage.example.invalid/one-use-' + urls }; };
  const prepare = (song = savedSong, signal = new AbortController().signal) => cache.prepareMyboxPlayback(song, downloadSource, signal);
  const cached = await prepare(); assert(cached.uri.endsWith('.flac')); assert(!files.has('file:///cache/mybox-playback/track-old.part')); assert(files.has('file:///cache/mybox-playback/keep.txt'));
  assert.equal((await prepare()).uri, cached.uri); assert.equal(urls, 1, 'Seeking/replaying uses a local file and never reuses a one-use URL');
  assert.equal(transfers[0].options.headers, undefined, 'No PAT travels to the storage host');
  await prepare({ ...savedSong, id: 'second' }); await prepare({ ...savedSong, id: 'third' });
  assert(!files.has(cached.uri), 'The oldest cache entry is evicted');
  assert.equal([...files.keys()].filter(uri => uri.endsWith('.flac')).length, 2);
  wrongSize = true; await assert.rejects(prepare({ ...savedSong, id: 'truncated' })); wrongSize = false;
  badMime = true; await assert.rejects(prepare({ ...savedSong, id: 'html' })); badMime = false;
  freeSpace = 0; const before = urls; await assert.rejects(prepare({ ...savedSong, id: 'no-space' })); assert.equal(urls, before); freeSpace = 1024 * 1024 * 1024;
  transferGate = deferred(); const cancel = new AbortController(), download = prepare({ ...savedSong, id: 'canceled' }, cancel.signal);
  await flush(); cancel.abort(); await assert.rejects(download); transferGate = null;
  assert.equal(cancelCount, 1); assert(![...files.keys()].some(uri => uri.endsWith('.part')), 'Cancellation removes partial audio');
  await cache.clearMyboxPlaybackCache(); assert.equal([...files.keys()].filter(uri => uri.endsWith('.flac')).length, 0);
  const rules = load('src/features/metadata/rules.ts'), key = rules.metadataKey(savedSong, null);
  rules.validateMetadataKey(key); assert.equal(JSON.parse(key)[0], 'mybox'); assert(!key.includes(token));
  assert.match(load('src/features/metadata/file-options.ts').fileWriteUnavailable(savedSong, 'nas', 'android'), /MYBOX/);
  assert(load('src/services/playback/lossless.ts').isLosslessPlayback(savedSong, { uri: 'file:///cache/song.flac' }));
  let selectedSource = 'all';
  const query = load('src/features/library/queries.ts', {
    react: { useMemo: fn => fn(), useCallback: fn => fn }, '@tanstack/react-query': { useQuery: options => options },
    '@/stores/auth': { useAuthStore: select => select({ mode: 'setup', session: null }) },
    '@/stores/local-music': { useLocalMusicStore: select => select({ ready: true, source: selectedSource, songs: [] }) },
    '@/stores/google-drive': { useGoogleDriveStore: select => select({ songs: [], loading: false, error: null }) },
    '@/stores/mybox': { useMyboxStore: select => select({ songs: [savedSong], loading: false, busy: false, error: null }) },
    '@/stores/hidden-music': { useHiddenMusicStore: select => select({ ready: true, profile: { presets: [] } }) },
    '@/stores/library-preferences': { useLibraryPreferences: select => select({ ready: true, includeFolderAlbums: true }) },
    '../hidden-music/rules': { privacyScope: () => null, visibleSongs: library => library },
    './repository': { libraryIdentity: () => 'device' }, './load-song-library': { artistName: name => name },
    './album-library': load('src/features/library/album-library.ts'), './search-songs': load('src/features/library/search-songs.ts'),
  });
  const empty = { items: [], total: 0 };
  assert.equal(query.useSongs().select(empty).items[0].id, savedSong.id, 'MYBOX merges into the all-source library');
  selectedSource = 'mybox';
  assert.equal(query.useSongs().select(empty).total, 1); assert.equal(query.useAlbums().select(empty).total, 1); assert.equal(query.useArtists().select(empty).total, 1);
  selectedSource = 'nas'; assert.equal(query.useSongs().select(empty).total, 0);
  assert.equal(query.useSongs(true, 'mybox').select(empty).total, 1, 'Source overrides used by favorites/playlists resolve MYBOX');

  const jsx = (type, props) => ({ type, props });
  const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
  const slots = []; let index = 0, connectedInput;
  const uiState = { ready: true, busy: false, loading: false, connection: null, error: null, connect: async input => { connectedInput = input; } };
  const Settings = load('src/features/mybox/settings.tsx', {
    react: { useState: initial => { const slot = index++; if (!(slot in slots)) slots[slot] = initial; return [slots[slot], value => { slots[slot] = value; }]; } },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { View: 'View', Pressable: 'Button', StyleSheet: { create: value => value }, Platform: { OS: 'android' }, Keyboard: { dismiss() {} } },
    '@/components/text': { Text: 'Text' }, '@/components/text-input': { TextInput: 'Input' }, '@/theme/tokens': { useColors: () => ({}) },
    '@/features/settings/settings-ui': { SettingsPage: 'Page', SettingsSection: 'Section' }, '@/stores/mybox': { useMyboxStore: () => uiState },
  }).MyboxSettings;
  const render = () => { index = 0; return Settings(); };
  let tree = render(); const tokenInput = nodes(tree).find(node => node.type === 'Input' && node.props.secureTextEntry);
  assert(tokenInput); assert.equal(tokenInput.props.autoComplete, 'off'); assert.equal(connectedInput, undefined);
  tokenInput.props.onChangeText(token);
  nodes(tree).find(node => node.type === 'Input' && !node.props.secureTextEntry).props.onChangeText('/Music/');
  tree = render(); const connectButton = nodes(tree).find(node => node.type === 'Button' && node.props.accessibilityRole === 'button');
  assert.equal(connectButton.props.disabled, false); connectButton.props.onPress(); await flush();
  assert.deepEqual(connectedInput, { token, folder: '/Music/' });
  assert.equal(nodes(render()).find(node => node.type === 'Input' && node.props.secureTextEntry).props.value, '', 'The token input is cleared as soon as it is submitted');
  console.log('PASS: official MYBOX auth/search/paging/limits, safe errors and URLs, secure persistence, restart/disconnect/cancel races, local playback cache/reuse/eviction/cleanup, read-only metadata and lossless identity. No real MYBOX account or files were used.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
