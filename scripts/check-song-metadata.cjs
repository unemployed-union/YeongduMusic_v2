/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const { create } = require('zustand');
function load(file, modules = {}, globals = {}) {
  modules = { ...require('./test-cloud-fixtures.cjs').cloudFixtures(globals, modules), ...modules };
  const exports = {}, code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'exports', ...Object.keys(globals), code)(name => {
    if (name === 'zustand') return { create };
    if (name in modules) return modules[name];
    throw Error('Unexpected import ' + name);
  }, exports, ...Object.values(globals));
  return exports;
}
const rules = load('src/features/metadata/rules.ts');
const raw = { id: 'song', title: 'Original', artist: 'Artist', album: 'Album', albumId: 'server-album', albumSource: 'tag',
  duration: 180, path: '/music/song.mp3', artworkUrl: 'https://example.invalid/art', trackNumber: 2 };
const edited = rules.parseMetadata({ title: ' New title ', artist: 'New artist', album: 'New album', albumArtist: 'Compilation', year: '2026', trackNumber: '1', discNumber: '2', id: 'overwrite' });
const key = rules.metadataKey(raw, 'demo');
const flush = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
async function main() {
  assert.equal(edited.title, 'New title'); assert.equal(edited.id, undefined);
  for (const value of [{ ...edited, title: ' ' }, { ...edited, artist: 'a'.repeat(301) }, { ...edited, year: -1 }, { ...edited, trackNumber: '1.5' }, { ...edited, discNumber: '10000' }]) assert.throws(() => rules.parseMetadata(value));
  assert.equal(rules.parseMetadata({ ...edited, year: ' ' }).year, undefined);
  assert.equal(rules.metadataKey(raw, null), null);
  assert.notEqual(key, rules.metadataKey(raw, 'other-account'));
  for (const source of ['drive', 's3']) {
    const song = { ...raw, source, [source]: source === 'drive' ? { accountId: 'A', fileId: 'same-file' } : { connectionId: 'A', key: 'same.mp3' } };
    const other = { ...song, [source]: { ...song[source], [source === 'drive' ? 'accountId' : 'connectionId']: 'B' } };
    assert.notEqual(rules.metadataKey(song, null), rules.metadataKey(other, null));
  }
  const local = { ...raw, source: 'local', local: { fileName: 'file.mp3' } };
  assert.equal(rules.metadataKey(local, null), rules.metadataKey(local, 'irrelevant-account'));
  const page = { items: [raw], total: 1, stale: true }, changed = rules.applyMetadataLibrary(page, { [key]: edited }, 'demo');
  assert.equal(page.items[0], raw); assert.equal(raw.title, 'Original');
  const song = changed.items[0];
  for (const field of ['id', 'path', 'duration', 'artworkUrl', 'source']) assert.equal(song[field], raw[field]);
  assert.equal(song.albumId, undefined); assert.equal(changed.stale, true);
  assert.equal(rules.applyMetadata(song, edited), song, 'Unchanged overrides preserve references');
  assert.equal(rules.applyMetadataLibrary(page, { [key]: edited }, 'other-account'), page);
  const reset = rules.applyMetadata(JSON.parse(JSON.stringify(song)), undefined);
  for (const field of [...rules.METADATA_FIELDS.map(field => field.key), 'albumId', 'albumSource']) assert.equal(reset[field], raw[field], 'Reset after restart restores ' + field);
  assert.equal(reset.metadataOriginal, undefined);
  assert.throws(() => rules.parseMetadataStorage('{broken'));
  assert.throws(() => rules.parseMetadataStorage(JSON.stringify({ version: 1, patches: { 'wrong-key': edited } })));
  const search = load('src/features/library/search-songs.ts'), albums = load('src/features/library/album-library.ts');
  assert.equal(search.searchSongs(changed, 'new compilation').total, 0);
  assert.equal(search.searchSongs(changed, 'new title').total, 1);
  assert.equal(search.searchSongs(changed, 'original').total, 0);
  assert.equal(albums.albumsFromSongs(changed).items[0].artist, 'Compilation');
  assert.equal(albums.songsForAlbum(changed, albums.albumsFromSongs(changed).items[0]).items[0].id, raw.id);

  const disk = new Map(); let failRead = false, failWrite = false, writes = 0, reads = 0;
  const storage = { getItem: async k => { reads++; if (failRead) throw Error('read failed'); return disk.get(k) ?? null; },
    setItem: async (k, v) => { writes++; if (failWrite) throw Error('disk full'); disk.set(k, v); } };
  const storeModules = { 'react-native': { Platform: { OS: 'android' } }, 'expo-sqlite/kv-store': { __esModule: true, default: storage }, '@/features/metadata/rules': rules };
  const fresh = () => load('src/stores/song-metadata.ts', storeModules).useSongMetadataStore;
  const store = fresh(); await Promise.all([store.getState().load(), store.getState().load()]); assert.equal(reads, 1);
  await Promise.all([store.getState().save(key, edited), store.getState().save(rules.metadataKey(local, null), { ...edited, title: 'Local edit' })]);
  assert.equal(Object.keys(store.getState().patches).length, 2, 'Concurrent edits cannot lose another song');
  const restarted = fresh(); await restarted.getState().load(); assert.deepEqual(restarted.getState().patches, store.getState().patches);
  failWrite = true; const before = store.getState().patches;
  await assert.rejects(store.getState().reset(key)); assert.equal(store.getState().patches, before); assert.equal(store.getState().busy, false);
  failWrite = false; await store.getState().reset(key); assert.equal(store.getState().patches[key], undefined);
  failRead = true; await store.getState().load(true); const beforeWrites = writes;
  await assert.rejects(store.getState().save(key, edited)); assert.equal(writes, beforeWrites, 'Unread saved edits cannot be overwritten');
  failRead = false; await store.getState().load(true); assert.equal(store.getState().loadError, false);
  const storageKey = [...disk.keys()][0]; disk.set(storageKey, '{broken'); await store.getState().load(true);
  assert.equal(store.getState().loadError, true); assert.equal(Object.keys(store.getState().patches).length, 1);
  disk.delete(storageKey); await store.getState().load(true);
  const webStore = load('src/stores/song-metadata.ts', { 'react-native': { Platform: { OS: 'web' } }, '@/features/metadata/rules': rules },
    { localStorage: { getItem: k => disk.get(k) ?? null, setItem: (k, v) => disk.set(k, v) } }).useSongMetadataStore;
  await webStore.getState().save(key, edited); await store.getState().load(true);
  assert.deepEqual(store.getState().patches[key], edited, 'Web and native stores use the same persistent schema');
  await store.getState().reset(key);
  await checkPlayback(store);
  checkQueries(store);
  await checkEditor(store);
  console.log('PASS: seven-field validation, source/account isolation, persistent edits/reset/restart, concurrent saves, failed/corrupt storage protection, search/grouping, query refresh and live queue/lock-screen updates without audio reload or seek. Native rendering/audio are mocked.');
}
async function checkPlayback(metadata) {
  const playback = load('src/stores/playback.ts').usePlaybackStore, events = [];
  const auth = create(() => ({ mode: 'mock', session: null }));
  class Engine {
    subscribe(listener) { this.listener = listener; } subscribeRemoteNavigation() {}
    pause() {} getPosition() { return 37; }
    async load(_, song) { events.push(['load', song.title]); this.listener({ playing: true, buffering: false, position: 37, duration: 180, ended: false, error: null }); }
    updateMetadata(song) { events.push(['metadata', song.title]); }
    release() {}
  }
  const controller = load('src/services/playback/controller.ts', {
    '@/stores/song-metadata': { useSongMetadataStore: metadata }, '@/features/metadata/rules': rules,
    '@/stores/playback': { usePlaybackStore: playback }, './audio-engine': { ExpoAudioEngine: Engine }, '@/stores/auth': { useAuthStore: auth },
    '@/features/hidden-music/rules': { privacyScope: () => 'demo', hiddenMatcher: () => () => false },
    '@/stores/hidden-music': { useHiddenMusicStore: create(() => ({ ready: true, scope: 'demo', profile: { presets: [] } })) },
    '@/stores/player-background': { usePlayerBackgroundStore: { getState: () => ({ selectArtwork() {}, reset() {} }) } },
    '@/features/library/repository': { musicRepository: () => ({ streamSource: async song => { assert.equal(song.id, raw.id); return { uri: 'https://example.invalid/music' }; } }) },
    '@/services/synology/api': { SessionExpiredError: class extends Error {}, SynologyError: class extends Error {} },
  });
  await controller.playQueue([raw]);
  await metadata.getState().save(key, edited);
  assert.equal(playback.getState().queue[0].title, edited.title); assert.equal(playback.getState().position, 37); assert.equal(playback.getState().playing, true);
  assert.deepEqual(events, [['load', 'Original'], ['metadata', 'New title']], 'Editing never reloads audio or seeks');
  await metadata.getState().reset(key); assert.equal(playback.getState().queue[0].title, raw.title); assert.deepEqual(events.at(-1), ['metadata', 'Original']);
  await metadata.getState().save(key, edited); controller.stopPlayback();
  await controller.restorePlayback([raw], 0, 37, false, false, 'off'); assert.equal(playback.getState().queue[0].title, edited.title);
  controller.stopPlayback();
}
function checkQueries(store) {
  const album = load('src/features/library/album-library.ts'), search = load('src/features/library/search-songs.ts');
  const query = load('src/features/library/queries.ts', {
    react: { useMemo: fn => fn(), useCallback: fn => fn }, '@tanstack/react-query': { useQuery: options => options },
    '@/stores/song-metadata': { useSongMetadataStore: selector => selector(store.getState()) }, '../metadata/rules': rules,
    '@/stores/auth': { useAuthStore: selector => selector({ mode: 'mock', session: null }) },
    '@/stores/hidden-music': { useHiddenMusicStore: selector => selector({ ready: true, profile: { presets: [] } }) },
    '@/stores/local-music': { useLocalMusicStore: selector => selector({ ready: true, source: 'nas', songs: [] }) },
    '@/stores/google-drive': { useGoogleDriveStore: selector => selector({ songs: [] }) },
    '@/stores/library-preferences': { useLibraryPreferences: selector => selector({ ready: true, includeFolderAlbums: true }) },
    '../hidden-music/rules': { privacyScope: () => 'demo', visibleSongs: page => page },
    './album-library': album, './search-songs': search,
    './repository': { libraryIdentity: () => 'demo' }, './load-song-library': { artistName: name => name },
  });
  const page = { items: [raw], total: 1 };
  assert.equal(query.useSongs().select(page).items[0].title, edited.title);
  assert.equal(query.useSearch('new title').select(page).total, 1);
  assert.equal(query.useArtists().select(page).items[0].name, edited.artist);
  assert.equal(query.useAlbums().select(page).items[0].title, edited.album);
  const refreshed = { ...raw, duration: 181 }; assert.equal(query.useSongs().select({ items: [refreshed], total: 1 }).items[0].title, edited.title);
  assert.equal(query.useSongs().select({ items: [refreshed], total: 1 }).items[0].duration, 181);
}
async function checkEditor(store) {
  const states = [], refs = []; let slot = 0, refSlot = 0, closed = 0, saveCalls = 0, fileCalls = 0, failFile = false, failApp = false;
  const alerts = [], cacheWrites = [];
  const auth = create(() => ({ mode: 'mock', session: null })), jsx = (type, props) => ({ type, props });
  const useAuthStore = () => auth.getState(); useAuthStore.getState = auth.getState;
  const uiStore = () => ({ ...store.getState(), save: async (...args) => { saveCalls++; if (failApp) throw Error('app save failed'); return store.getState().save(...args); } });
  const Form = load('src/features/metadata/metadata-editor-form.tsx', {
    react: { useEffect: () => {}, useRef: initial => refs[refSlot++] ??= { current: initial },
      useState: initial => { const i = slot++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
        return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; } },
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': { Platform: { OS: 'android' }, Alert: { alert: (...args) => alerts.push(args) }, View: 'View', TextInput: 'Input', Pressable: 'Button', ScrollView: 'Scroll', ActivityIndicator: 'Spinner', StyleSheet: { create: value => value } },
    '@tanstack/react-query': { useQueryClient: () => ({ getQueryData: () => ({ items: [raw], total: 1 }), setQueryData: (key, update) => cacheWrites.push({ key, page: update({ items: [raw], total: 1 }) }) }) }, '@/components/animated-switch': { AnimatedSwitch: 'Switch' },
    './file-options': load('src/features/metadata/file-options.ts'),
    '@/features/library/repository': { libraryIdentity: () => 'test-account' },
    '@/services/metadata/write-song-file': { writeSongFile: async (song, fields, progress) => { fileCalls++; if (failFile) throw Error('file save failed'); progress('upload'); return { song: { ...song, ...fields }, message: 'file saved' }; } },
    '@/components/text': { Text: 'Text' }, '@/components/scroll-edge-fade': { ScrollEdgeFade: 'Fade' }, '@/theme/tokens': { useColors: () => ({}) },
    '@/components/toast-notice': { ToastNotice: 'Toast' },
    './metadata-web-options': { MetadataWebOptions: 'WebOptions' },
    '@/features/artwork/artwork-editor': { ArtworkEditor: 'ArtworkEditor' },
    '@/stores/song-metadata': { useSongMetadataStore: uiStore }, '@/stores/auth': { useAuthStore },
    '@/features/hidden-music/rules': { privacyScope: mode => mode === 'mock' ? 'demo' : 'other' }, './rules': rules,
  }).MetadataEditorForm;
  const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
  const render = (song = raw) => { slot = 0; refSlot = 0; return nodes(Form({ song, onSaved: () => closed++, onCancel() {} })); };
  const button = (tree, text) => tree.find(node => node.type === 'Button' && nodes(node).some(child => child.type === 'Text' && child.props.children === text));
  let tree = render(); assert.equal(tree.filter(node => node.type === 'Input').length, 7);
  assert.equal(tree.find(node => node.type === 'Switch').props.value, false, 'The file-writing option always starts off');
  assert.equal(tree.find(node => node.type === 'Switch').props.disabled, true, 'Demo music cannot modify files');
  tree.find(node => node.type === 'Input' && node.props.accessibilityLabel === '트랙 번호').props.onChangeText('1.5');
  tree = render(); button(tree, '저장').props.onPress(); await flush(); assert.equal(closed, 0); assert.equal(saveCalls, 0); assert(render().some(node => node.props?.accessibilityRole === 'alert'));
  render().find(node => node.type === 'Input' && node.props.accessibilityLabel === '트랙 번호').props.onChangeText('4');
  tree = render(); const save = button(tree, '저장'); save.props.onPress(); save.props.onPress(); await flush();
  assert.equal(saveCalls, 1); assert.equal(closed, 1); assert.equal(store.getState().patches[key].trackNumber, 4);
  auth.setState({ mode: 'nas' }); tree = render(); assert.equal(button(tree, '저장').props.disabled, true);
  states.length = 0; refs.length = 0; tree = render();
  assert.equal(tree.find(node => node.type === 'Switch').props.disabled, false);
  const beforeFiles = fileCalls, beforeClosed = closed;
  button(tree, '저장').props.onPress(); await flush(); assert.equal(fileCalls, beforeFiles, 'The normal save remains display-only');
  tree = render(); tree.find(node => node.type === 'Switch').props.onValueChange(true); failFile = true;
  button(render(), '저장').props.onPress(); await flush(); assert.equal(closed, beforeClosed + 1, 'Failed file writes leave the editor open');
  assert(render().some(node => node.props?.accessibilityRole === 'alert' && node.props.children.includes('file save failed')));
  failFile = false; failApp = true; button(render(), '저장').props.onPress(); await flush();
  assert(render().some(node => node.props?.accessibilityRole === 'alert' && node.props.children.includes('file saved') && node.props.children.includes('app save failed')), 'Partial success distinguishes a written file from failed app persistence');
  failApp = false; button(render(), '저장').props.onPress(); await flush();
  assert.equal(closed, beforeClosed + 2); assert.equal(alerts.at(-1)[0], '파일 저장 완료'); assert.equal(cacheWrites.at(-1).key[1], 'test-account');
  const beforeReset = fileCalls; button(render(), '앱의 수정 내용 지우기').props.onPress(); await flush();
  assert.equal(fileCalls, beforeReset, 'Removing the app edit never rewrites a file even while its toggle is on');
  states.length = 0; refs.length = 0;
  const driveSong = { ...raw, id: 'drive:A:file', source: 'drive', drive: { accountId: 'A', fileId: 'file', mimeType: 'audio/mpeg' } };
  tree = render(driveSong); const fileSwitch = tree.find(node => node.type === 'Switch');
  assert.equal(fileSwitch.props.value, false); assert.equal(fileSwitch.props.disabled, true);
  tree.find(node => node.type === 'Button' && node.props.accessibilityLabel === 'Google Drive 파일 직접 수정 안내').props.onPress();
  tree = render(driveSong); assert.equal(tree.find(node => node.type === 'Toast').props.message, load('src/features/metadata/file-options.ts').DRIVE_FILE_READ_ONLY_MESSAGE);
  assert.equal(tree.find(node => node.type === 'Switch').props.value, false, 'Attempting Drive file editing leaves the toggle off');
  const fileCallsBeforeDrive = fileCalls;
  tree.find(node => node.type === 'Input' && node.props.accessibilityLabel === '제목').props.onChangeText('Drive display edit');
  button(render(driveSong), '저장').props.onPress(); await flush();
  assert.equal(fileCalls, fileCallsBeforeDrive, 'Drive saves never call a file writer');
  assert.equal(store.getState().patches[rules.metadataKey(driveSong, null)].title, 'Drive display edit');
  assert.equal(driveSong.title, raw.title, 'App display edits never mutate the Drive source metadata');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
