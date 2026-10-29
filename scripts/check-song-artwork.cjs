/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const crypto = require('node:crypto'), { create } = require('zustand');
function load(file, modules = {}, globals = {}) {
  modules = { ...require('./test-cloud-fixtures.cjs').cloudFixtures(globals, modules), ...modules };
  const exports = {}, code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'exports', ...Object.keys(globals), code)(name => {
    if (name === 'zustand') return { create };
    if (name in modules) return modules[name];
    throw Error('Unexpected artwork dependency ' + name);
  }, exports, ...Object.values(globals));
  return exports;
}
const metadata = load('src/features/metadata/rules.ts'), albums = load('src/features/library/album-library.ts');
const rules = load('src/features/artwork/rules.ts', { '@/features/metadata/rules': metadata, '@/features/library/album-library': albums });
const request = load('src/services/cloud-music/request.ts');
const original = { id: 'one', title: 'One', artist: 'Artist', album: 'Album', albumId: 'album', albumSource: 'tag', duration: 180,
  path: '/music/one.mp3', artworkUrl: 'https://example.invalid/original.jpg', palette: ['#111111', '#222222'] };
const second = { ...original, id: 'two', title: 'Two', path: '/music/two.mp3' };
const key = metadata.metadataKey(original, 'demo'), nextKey = metadata.metadataKey(second, 'demo');
const image = 'art-' + 'a'.repeat(32) + '.jpg', base = 'file:///documents/album-art/';
const id = '12345678-1234-1234-1234-123456789012';
const tick = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function freshStore(storage) {
  return load('src/stores/song-artwork.ts', { 'react-native': { Platform: { OS: 'android' } },
    'expo-sqlite/kv-store': { __esModule: true, default: storage }, '@/features/artwork/rules': rules,
    '@/features/metadata/rules': metadata, '@/services/artwork/files': { artworkBaseUri: () => base },
  }).useSongArtworkStore;
}
async function main() {
  const page = { items: [original, second], total: 2, stale: true };
  assert.equal(rules.applyArtworkLibrary(page, {}, 'demo', base), page);
  const changed = rules.applyArtworkLibrary(page, { [nextKey]: image }, 'demo', base);
  assert.equal(changed.items[0], original); assert.equal(changed.items[1].artworkUrl, base + image);
  assert.equal(changed.items[1].palette, undefined); assert.equal(changed.stale, true);
  assert.equal(albums.albumsFromSongs(changed).items[0].artworkUrl, base + image, 'Custom art on a later track becomes the album thumbnail');
  assert.equal(rules.applySongArtwork(changed.items[1], image, base), changed.items[1]);
  const reset = rules.applySongArtwork(JSON.parse(JSON.stringify(changed.items[1])), undefined, base);
  assert.equal(reset.artworkUrl, second.artworkUrl); assert.deepEqual(reset.palette, second.palette); assert.equal(reset.artworkOriginal, undefined);
  const empty = rules.applySongArtwork({ ...original, artworkUrl: undefined, palette: undefined }, image, base);
  const emptyReset = rules.applySongArtwork(JSON.parse(JSON.stringify(empty)), undefined, base);
  assert.equal(emptyReset.artworkUrl, undefined, 'A missing original image remains missing after restart/reset');
  assert.equal(rules.applyArtworkLibrary(page, { [key]: image }, 'other-account', base), page);
  assert.deepEqual(rules.artworkTargets(original, [second, second], 'demo', true), [key, nextKey]);
  assert.deepEqual(rules.artworkTargets(original, [], 'demo', true), [key], 'Only visible album songs participate');
  assert.deepEqual(rules.artworkTargets({ ...original, albumSource: 'fallback' }, [second], 'demo', true), [key]);
  const guest = { ...second, artist: 'Guest', albumId: 'another-group' }, unrelated = { ...second, id: 'unrelated', album: 'Other', albumId: 'other' };
  assert.deepEqual(rules.albumArtworkTargets(original, [original, guest, unrelated], 'demo', albums.albumId(original, true)), [key, nextKey], 'An explicit merged album includes all its visible artists and no other titles');
  assert.deepEqual(rules.artworkTargets(original, [guest], 'demo', true), [key], 'Display grouping does not widen song-level bulk edits');
  for (const value of ['../original.jpg', 'https://example.invalid/art.jpg', 'data:image/svg+xml;base64,YQ==', 'art-bad.jpg']) assert.throws(() => rules.validateArtwork(value));
  assert.throws(() => rules.parseArtworkStorage('{broken'));
  assert.throws(() => rules.parseArtworkStorage(JSON.stringify({ version: 1, patches: { wrong: image } })));
  await checkFiles(); await checkSearch();
  const disk = new Map(); let failRead = false, failWrite = false, gate = null, reads = 0;
  const storage = { getItem: async k => { reads++; if (failRead) throw Error('read failed'); return disk.get(k) ?? null; },
    setItem: async (k, v) => { if (gate) await gate.promise; if (failWrite) throw Error('disk full'); disk.set(k, v); } };
  const store = freshStore(storage); await Promise.all([store.getState().load(), store.getState().load()]); assert.equal(reads, 1);
  await Promise.all([store.getState().save([key], image), store.getState().save([nextKey], image)]);
  assert.equal(Object.keys(store.getState().patches).length, 2, 'Concurrent saves retain both tracks');
  const restart = freshStore(storage); await restart.getState().load(); assert.deepEqual(restart.getState().patches, store.getState().patches);
  const before = store.getState().patches; failWrite = true; await assert.rejects(store.getState().save([key], undefined));
  assert.equal(store.getState().patches, before); assert.equal(store.getState().busy, false); failWrite = false;
  await store.getState().save([key, nextKey], undefined); assert.deepEqual(store.getState().patches, {});
  gate = deferred(); let allowed = true;
  const late = store.getState().save([key, nextKey], image, () => allowed); await tick(); allowed = false; gate.resolve(); gate = null;
  await assert.rejects(late); assert.deepEqual(store.getState().patches, {});
  const afterRace = freshStore(storage); await afterRace.getState().load(); assert.deepEqual(afterRace.getState().patches, {}, 'Late cancellation rolls back disk writes');
  failRead = true; await store.getState().load(true); await assert.rejects(store.getState().save([key], image)); failRead = false;
  disk.set('yeongdumusic-song-artwork-v1', '{broken'); await store.getState().load(true); assert.equal(store.getState().loadError, true);
  disk.delete('yeongdumusic-song-artwork-v1'); await store.getState().load(true); assert.equal(store.getState().loadError, false);
  const webStore = load('src/stores/song-artwork.ts', { 'react-native': { Platform: { OS: 'web' } }, '@/features/artwork/rules': rules,
    '@/features/metadata/rules': metadata }, { localStorage: { getItem: k => disk.get(k) ?? null, setItem: (k, v) => disk.set(k, v) } }).useSongArtworkStore;
  const dataImage = 'data:image/png;base64,iVBORw0KGgo='; await webStore.getState().save([key], dataImage);
  await webStore.getState().load(true); assert.equal(webStore.getState().patches[key], dataImage);
  await webStore.getState().save([key], undefined); await store.getState().load(true);
  checkPreview(); await checkPlayback(store); await checkEditor(store); await checkQueries(store);
  console.log('PASS: artwork lookup/escaping/shared throttle, validated image import/download/cleanup, persistent scoped song/album edits/reset, storage failures/races, explicit preview/apply UI and live queue/lock-screen updates without audio reload/seek. Native files, rendering and network are mocked.');
}
async function checkSearch() {
  const calls = [], groups = { 'release-groups': [{ id, title: 'Album', score: '100', 'artist-credit': [{ name: 'Artist' }], 'first-release-date': '2026-10-14' },
    { id: '../bad', title: 'Unsafe', 'artist-credit': [{ name: 'Artist' }] }, { id, title: 'Duplicate', 'artist-credit': [{ name: 'Artist' }] },
    { id: 'abcdefab-1234-1234-1234-123456789012', title: 'Malformed', 'artist-credit': [{ name: {} }] }] };
  const web = load('src/services/metadata/web-search.ts', { '@/services/cloud-music/request': request,
    '@/features/metadata/rules': metadata, '@/features/metadata/web-rules': load('src/features/metadata/web-rules.ts', { './rules': metadata }) },
  { fetch: async (url, options) => { calls.push({ url, options, time: Date.now() }); return { ok: true, json: async () => url.includes('/release-group?') ? groups : { recordings: [] } }; } });
  const search = load('src/services/artwork/search.ts', { '@/services/metadata/web-search': web, '@/services/cloud-music/request': request });
  const result = await search.searchArtwork(' A "B" / C ', 'Artist+Name'); assert.equal(result.length, 1); assert.equal(result[0].year, '2026');
  assert.equal(result[0].uri, `https://coverartarchive.org/release-group/${id}/front-500`);
  assert.equal(new URL(calls[0].url).searchParams.get('query'), 'releasegroup:"A \\"B\\" \\/ C" AND artist:"Artist\\+Name"');
  assert.equal(calls[0].options.headers.Accept, 'application/json'); assert.throws(() => search.coverArtUrl('../bad'));
  assert.throws(() => search.parseArtworkCandidates({ recordings: [] })); assert.throws(() => search.searchArtwork('', 'Artist'));
  await web.searchWebMetadata('Song', 'Artist'); assert(calls[1].time - calls[0].time >= 1000, 'Artwork and song metadata share one request throttle');
  const canceled = new AbortController(); canceled.abort(); await assert.rejects(search.searchArtwork('Album', 'Artist', canceled.signal)); assert.equal(calls.length, 2);
}
async function checkFiles() {
  const files = new Map(), jpeg = Buffer.from([255, 216, 255, 0, 1, 2, 3]), downloaded = [], copied = [];
  let selection = { canceled: true }, dimensions = { width: 500, height: 500 }, downloadOversize = false;
  const uriOf = parts => parts.map(p => typeof p === 'string' ? p : p.uri).reduce((uri, part) => uri.replace(/\/$/, '') + '/' + part.replace(/^\//, ''));
  class Directory {
    constructor(...parts) { this.uri = uriOf(parts).replace(/\/?$/, '/'); }
    create() {} delete() { for (const key of files.keys()) if (key.startsWith(this.uri)) files.delete(key); }
  }
  class File {
    constructor(...parts) { this.uri = uriOf(parts); }
    get exists() { return files.has(this.uri); } get size() { return files.get(this.uri)?.length ?? 0; }
    open() { return { readBytes: count => new Uint8Array(files.get(this.uri).subarray(0, count)), close() {} }; }
    delete() { files.delete(this.uri); }
    static async downloadFileAsync(uri, target, options) {
      downloaded.push(uri); files.set(target.uri, jpeg); options.onProgress({ bytesWritten: 7, totalBytes: downloadOversize ? 9 * 1024 * 1024 : 7 });
      if (options.signal.aborted) throw Error('aborted'); return target;
    }
  }
  const legacy = { getInfoAsync: async uri => files.has(uri) ? { exists: true, size: files.get(uri).length, md5: crypto.createHash('md5').update(files.get(uri)).digest('hex') } : { exists: false },
    copyAsync: async ({ from, to }) => { copied.push(to); files.set(to, Buffer.from(files.get(from))); }, deleteAsync: async uri => files.delete(uri) };
  const copy = load('src/services/local-music/file-copy.ts', { 'expo-file-system/legacy': legacy });
  const modules = { 'react-native': { Platform: { OS: 'android' }, Image: { getSize: async () => dimensions } },
    'expo-file-system': { File, Directory, FileMode: { ReadOnly: 'r' }, Paths: { document: { uri: 'file:///documents/' }, cache: { uri: 'file:///cache/' } } },
    'expo-document-picker': { getDocumentAsync: async options => { assert.equal(options.multiple, false); assert.equal(options.copyToCacheDirectory, true); return selection; } },
    '@/services/cloud-music/request': request, '@/services/local-music/file-copy': copy,
    './search': { coverArtUrl: value => { assert.equal(value, id); return 'https://coverartarchive.org/release-group/' + id + '/front-500'; } }, '@/features/artwork/rules': rules };
  const service = load('src/services/artwork/files.ts', modules); assert.equal(await service.pickArtwork(), null);
  const digest = crypto.createHash('md5').update(jpeg).digest('hex'), filename = 'art-' + digest + '.jpg';
  files.set('file:///cache/picked', jpeg); selection = { canceled: false, assets: [{ uri: 'file:///cache/picked', size: 7 }] };
  assert.equal(await service.pickArtwork(), filename); assert.equal(files.has('file:///cache/picked'), false);
  assert.deepEqual(files.get(base + filename), jpeg);
  const embedded = await service.readArtworkForTags(filename); assert.deepEqual(Buffer.from(embedded.bytes), jpeg); assert.equal(embedded.mime, 'image/jpeg'); assert.equal(embedded.width, 500);
  await assert.rejects(service.readArtworkForTags('../outside/original.jpg'));
  files.set('file:///outside/original.jpg', jpeg); selection = { canceled: false, assets: [{ uri: 'file:///outside/original.jpg', size: 7 }] };
  assert.equal(await service.pickArtwork(), filename); assert.equal(copied.length, 1, 'Repeated images reuse the verified app copy'); assert(files.has(selection.assets[0].uri));
  selection = { canceled: false, assets: [{ uri: 'file:///cache/too-large', size: 9 * 1024 * 1024 }] }; files.set(selection.assets[0].uri, jpeg);
  await assert.rejects(service.pickArtwork(), /너무 큽니다/); assert.equal(files.has(selection.assets[0].uri), false);
  assert.throws(() => service.imageFormat(new TextEncoder().encode('<svg/>')));
  dimensions = { width: 10000, height: 10000 }; selection = { canceled: false, assets: [{ uri: 'file:///outside/original.jpg', size: 7 }] };
  await assert.rejects(service.pickArtwork(), /1,600만/); dimensions = { width: 500, height: 500 };
  assert.equal(await service.downloadArtwork(id), filename); assert.equal(downloaded.length, 1);
  assert([...files.keys()].every(uri => !uri.startsWith('file:///cache/')), 'Download staging is cleaned up');
  downloadOversize = true; await assert.rejects(service.downloadArtwork(id), /너무 큽니다/);
  assert.deepEqual(files.get(base + filename), jpeg, 'Failed downloads preserve previously saved art and source images');
  const web = load('src/services/artwork/files.ts', { ...modules, 'react-native': { Platform: { OS: 'web' }, Image: { getSize: async () => dimensions } } });
  selection = { canceled: false, assets: [{ uri: 'blob:picker', size: 7, file: { arrayBuffer: async () => jpeg } }] };
  assert.equal(await web.pickArtwork(), 'data:image/jpeg;base64,' + jpeg.toString('base64'));
}
async function checkPlayback(artwork) {
  const playback = load('src/stores/playback.ts').usePlaybackStore, events = [], backgrounds = [];
  class Engine {
    subscribe(listener) { this.listener = listener; } subscribeRemoteNavigation() {} pause() {} getPosition() { return 37; } release() {}
    async load(_, song) { events.push(['load', song.artworkUrl]); this.listener({ playing: true, buffering: false, position: 37, duration: 180, ended: false, error: null }); }
    updateMetadata(song) { events.push(['metadata', song.artworkUrl]); }
  }
  const controller = load('src/services/playback/controller.ts', { '@/stores/song-artwork': { useSongArtworkStore: artwork }, '@/features/artwork/rules': rules,
    '@/stores/playback': { usePlaybackStore: playback }, './audio-engine': { ExpoAudioEngine: Engine }, '@/stores/auth': { useAuthStore: create(() => ({ mode: 'mock', session: null })) },
    '@/features/hidden-music/rules': { privacyScope: () => 'demo', hiddenMatcher: () => () => false },
    '@/stores/hidden-music': { useHiddenMusicStore: create(() => ({ ready: true, scope: 'demo', profile: { presets: [] } })) },
    '@/stores/player-background': { usePlayerBackgroundStore: { getState: () => ({ selectArtwork: song => backgrounds.push(song.artworkUrl), reset() {} }) } },
    '@/features/library/repository': { musicRepository: () => ({ streamSource: async () => ({ uri: 'https://example.invalid/music' }) }) },
    '@/services/synology/api': { SessionExpiredError: class extends Error {}, SynologyError: class extends Error {} } });
  await artwork.getState().save([key], image);
  await controller.restorePlayback([original, second], 0, 37, false, false, 'off');
  assert.equal(backgrounds.at(-1), base + image, 'Paused restore selects the reconciled artwork instead of the stale saved cover');
  assert.equal(playback.getState().playing, false);
  assert.deepEqual(events, [], 'Preparing restored artwork does not load or start audio');
  await artwork.getState().save([key], undefined);
  assert.equal(backgrounds.at(-1), original.artworkUrl, 'Artwork hydration/edits update a restored player before a native source exists');
  const beforeProgress = backgrounds.length;
  playback.getState().setStatus({ position: 38 });
  assert.equal(backgrounds.length, beforeProgress, 'Playback progress never triggers color preparation');
  assert.deepEqual(events, []);
  controller.stopPlayback();
  await controller.playQueue([original, second]); await artwork.getState().save([key, nextKey], image);
  assert.equal(playback.getState().queue[0].artworkUrl, base + image); assert.equal(playback.getState().queue[1].artworkUrl, base + image);
  assert.equal(playback.getState().position, 37); assert.equal(playback.getState().playing, true);
  assert.deepEqual(events, [['load', original.artworkUrl], ['metadata', base + image]], 'Changing art updates native metadata without loading/seeking audio');
  assert.equal(backgrounds.at(-1), base + image, 'Player background follows the new image');
  await artwork.getState().save([key, nextKey], undefined); assert.equal(playback.getState().queue[0].artworkUrl, original.artworkUrl);
  assert.deepEqual(events.at(-1), ['metadata', original.artworkUrl]); controller.stopPlayback();
}
async function checkQueries(store) {
  await store.getState().save([nextKey], image);
  const queries = load('src/features/library/queries.ts', {
    react: { useMemo: fn => fn(), useCallback: fn => fn }, '@tanstack/react-query': { useQuery: options => options },
    '@/stores/song-artwork': { useSongArtworkStore: selector => selector(store.getState()) }, '../artwork/rules': rules,
    '@/stores/auth': { useAuthStore: selector => selector({ mode: 'mock', session: null }) },
    '@/stores/hidden-music': { useHiddenMusicStore: selector => selector({ ready: true, profile: { presets: [] } }) },
    '@/stores/local-music': { useLocalMusicStore: selector => selector({ ready: true, source: 'nas', songs: [] }) },
    '@/stores/google-drive': { useGoogleDriveStore: selector => selector({ songs: [] }) },
    '@/stores/library-preferences': { useLibraryPreferences: selector => selector({ ready: true, includeFolderAlbums: true }) },
    '../hidden-music/rules': { privacyScope: () => 'demo', visibleSongs: page => page },
    './album-library': albums, './search-songs': load('src/features/library/search-songs.ts'),
    './repository': { libraryIdentity: () => 'demo' }, './load-song-library': { artistName: name => name },
  });
  const page = { items: [original, second], total: 2 };
  assert.equal(queries.useSongs().select(page).items[1].artworkUrl, base + image);
  assert.equal(queries.useAlbums().select(page).items[0].artworkUrl, base + image);
  assert.equal(queries.useSearch('Two').select(page).items[0].artworkUrl, base + image);
  await store.getState().save([nextKey], undefined);
  assert.equal(queries.useAlbums().select(page).items[0].artworkUrl, original.artworkUrl);
}
function checkPreview() {
  const jsx = (type, props) => ({ type, props });
  const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
  const flatten = value => Object.assign({}, ...[value].flat(Infinity).filter(Boolean));
  const palette = load('src/theme/tokens.ts', { 'react-native': {}, '@/stores/theme-preferences': {}, './mode': {} }).palette;
  for (const mode of ['light', 'dark']) {
    const slots = []; let cursor = 0;
    const Preview = load('src/features/artwork/artwork-preview.tsx', {
      react: { useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = value; }]; } },
      'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': { View: 'View', Image: 'Image', ActivityIndicator: 'Spinner', StyleSheet: { create: value => value } },
      '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Icon' }, '@/components/text': { Text: 'Text' }, '@/theme/tokens': { useColors: () => palette[mode] },
    }).ArtworkPreview;
    const render = uri => { cursor = 0; return nodes(Preview({ uri })); };
    let tree = render(undefined);
    assert(tree.some(node => node.type === 'Text' && node.props.children === '앨범아트 없음'));
    assert(tree.some(node => node.type === 'Icon')); assert(!tree.some(node => node.type === 'Image' || node.type === 'Spinner'));
    assert.equal(flatten(tree[0].props.style).backgroundColor, palette[mode].background);
    slots.length = 0; tree = render('https://example.invalid/cover');
    assert(tree.some(node => node.type === 'Spinner'), 'Preview distinguishes loading from no artwork');
    tree.find(node => node.type === 'Image').props.onLoad(); assert(!render('https://example.invalid/cover').some(node => node.type === 'Spinner'));
    slots.length = 0; tree = render('https://example.invalid/broken'); tree.find(node => node.type === 'Image').props.onError();
    tree = render('https://example.invalid/broken');
    assert(!tree.some(node => node.type === 'Image' || node.type === 'Spinner'), 'A failed image cannot leave a blank frame or endless spinner');
    const error = tree.find(node => node.type === 'Text' && node.props.children === '표지를 불러오지 못했습니다');
    assert(error); assert.equal(flatten(error.props.style).color, palette[mode].text);
  }
}
async function checkEditor(store) {
  const states = [], refs = [], jsx = (type, props) => ({ type, props }); let slot = 0, refSlot = 0, lookups = 0, downloads = 0, searchGate = null, downloadGate = null, fileGate = null, editingSong = original, fileCalls = 0, failFileAt = 0, visible = [original, second], editingAlbum = false;
  const auth = create(() => ({ mode: 'mock', session: null })), useAuthStore = () => auth.getState(); useAuthStore.getState = auth.getState;
  const hidden = create(() => ({ ready: true, scope: 'demo', profile: { presets: [] } }));
  const Editor = load('src/features/artwork/artwork-editor.tsx', {
    react: { useEffect() {}, useMemo: fn => fn(), useRef: initial => refs[refSlot++] ??= { current: initial },
      useState: initial => { const i = slot++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
        return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; } },
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': { Image: 'Image', ActivityIndicator: 'Spinner', Platform: { OS: 'android' },
      Pressable: 'Button', TextInput: 'Input', View: 'View', StyleSheet: { create: value => value } },
    '@/components/text': { Text: 'Text' }, '@/components/animated-switch': { AnimatedSwitch: 'Switch' }, '@/theme/tokens': { useColors: () => ({}) },
    '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Icon' }, './artwork-preview': { ArtworkPreview: 'Preview' },
    '@/components/toast-notice': { ToastNotice: 'Toast' },
    '@tanstack/react-query': { useQueryClient: () => ({ setQueryData() {} }) },
    '@/features/metadata/file-options': load('src/features/metadata/file-options.ts'),
    '@/features/library/repository': { libraryIdentity: () => 'demo' },
    '@/services/metadata/write-song-file': { writeSongArtworkFile: async (song, image, progress) => { fileCalls++; progress('음악 파일에 표지 기록 중…'); if (fileGate) await fileGate.promise; if (fileCalls === failFileAt) throw Error('file failed'); return { song, message: 'saved' }; } },
    '@/stores/auth': { useAuthStore }, '@/stores/song-artwork': { useSongArtworkStore: () => store.getState() }, '@/stores/hidden-music': { useHiddenMusicStore: hidden },
    '@/features/library/queries': { useSongs: () => ({ data: { items: visible }, isPending: false, isFetching: false }) },
    '@/features/hidden-music/rules': { privacyScope: mode => mode === 'mock' ? 'demo' : 'changed', hiddenMatcher: presets => song => presets.some(preset => preset.songIds.includes(song.id)) },
    '@/features/metadata/rules': metadata, './rules': rules,
    '@/services/artwork/files': { pickArtwork: async () => image, downloadArtwork: async () => { downloads++; if (downloadGate) await downloadGate.promise; return image; } },
    '@/services/artwork/search': { searchArtwork: async () => { lookups++; if (searchGate) await searchGate.promise; return [{ id, uri: 'https://example.invalid/candidate', album: 'Album', artist: 'Artist', year: '2026' }]; } },
  }).ArtworkEditor;
  const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
  const render = () => { slot = 0; refSlot = 0; return nodes(Editor({ song: editingSong, album: 'Album', artist: 'Artist', disabled: false, onBusyChange() {}, albumSongs: editingAlbum ? visible : undefined })); };
  const button = text => render().find(node => node.type === 'Button' && nodes(node).some(child => child.type === 'Text' && child.props.children === text));
  assert.equal(render().filter(node => node.type === 'Input').length, 0); assert.equal(lookups, 0);
  render().find(node => node.type === 'Button').props.onPress(); assert.equal(render().find(node => node.type === 'Switch').props.value, false);
  const fileSwitch = () => render().find(node => node.type === 'Switch' && node.props.accessibilityLabel === '파일에도 앨범아트 저장');
  assert.equal(fileSwitch().props.value, false); assert.equal(fileSwitch().props.disabled, true, 'Demo music never writes source files');
  button('이미지 파일 선택').props.onPress(); await tick(); assert.deepEqual(store.getState().patches, {}, 'Selecting/previews never auto-save');
  button('앨범아트 적용').props.onPress(); await tick(); assert.equal(store.getState().patches[key], image); assert.equal(store.getState().patches[nextKey], undefined);
  searchGate = deferred(); button('웹에서 앨범아트 찾기').props.onPress(); await tick(); assert.equal(lookups, 1); assert.equal(downloads, 0);
  let pending = render(), searchTitle = pending.find(node => node.type === 'Text' && node.props.children === '앨범아트를 찾는 중…');
  assert(searchTitle); assert.equal(pending.filter(node => node.type === 'Spinner').length, 1);
  // Compare within one render; every render creates fresh element objects.
  const indexOfButton = (tree, label) => tree.findIndex(node => node.type === 'Button' && nodes(node).some(child => child.type === 'Text' && child.props.children === label));
  assert(pending.indexOf(searchTitle) < indexOfButton(pending, '웹에서 앨범아트 찾기'), 'Search progress remains above the initiating button');
  assert(pending.indexOf(searchTitle) < indexOfButton(pending, '앨범아트 적용'), 'Search feedback appears next to search, before the save controls');
  searchGate.resolve(); searchGate = null; await tick();
  render().find(node => node.type === 'Button' && node.props.accessibilityState?.selected === false).props.onPress();
  render().find(node => node.type === 'Switch').props.onValueChange(true);
  downloadGate = deferred(); button('앨범아트 적용').props.onPress(); await tick(); assert.equal(downloads, 1);
  pending = render(); const appTitle = pending.find(node => node.type === 'Text' && node.props.children === '앱에 앨범아트를 적용하는 중…');
  assert(appTitle); assert(pending.indexOf(appTitle) < indexOfButton(pending, '앨범아트 적용'), 'Save feedback appears above Apply');
  const flatten = value => Object.assign({}, ...[value].flat(Infinity).filter(Boolean));
  assert.equal(flatten(appTitle.props.style).fontSize, 14);
  assert.equal(flatten(searchTitle.props.style).fontSize, flatten(appTitle.props.style).fontSize);
  downloadGate.resolve(); downloadGate = null; await tick(); assert.equal(store.getState().patches[nextKey], image);
  button('원래 앨범아트로 되돌리기').props.onPress(); await tick(); assert.deepEqual(store.getState().patches, {});
  button('이미지 파일 선택').props.onPress(); await tick(); hidden.setState({ profile: { presets: [{ songIds: ['two'] }] } });
  button('앨범아트 적용').props.onPress(); await tick(); assert.deepEqual(store.getState().patches, {}, 'Songs hidden while the editor is open block album publication');
  hidden.setState({ profile: { presets: [] } }); searchGate = deferred(); button('웹에서 앨범아트 찾기').props.onPress(); await tick();
  button('앨범아트 작업 취소').props.onPress(); searchGate.resolve(); await tick(); assert.equal(render().find(node => node.type === 'Spinner'), undefined);
  searchGate = null; auth.setState({ mode: 'nas' }); assert.equal(button('앨범아트 적용').props.disabled, true, 'The original editor cannot write into a different account');
  hidden.setState({ scope: 'changed' });
  states.length = 0; refs.length = 0; render().find(node => node.type === 'Button').props.onPress();
  assert.equal(fileSwitch().props.value, false); assert.equal(fileSwitch().props.disabled, false);
  button('이미지 파일 선택').props.onPress(); await tick(); fileSwitch().props.onValueChange(true);
  fileGate = deferred(); button('앨범아트 적용').props.onPress(); await tick(); assert.equal(fileCalls, 1);
  pending = render(); const fileTitle = pending.find(node => node.type === 'Text' && node.props.children === '파일과 앱에 앨범아트를 저장하는 중…');
  const fileProgress = pending.find(node => node.type === 'Text' && String(node.props.children).includes('1/1곡 · 음악 파일에 표지 기록 중'));
  assert(fileTitle && fileProgress); assert(pending.indexOf(fileTitle) < indexOfButton(pending, '앨범아트 적용'));
  assert.equal(flatten(fileTitle.props.style).fontSize, flatten(appTitle.props.style).fontSize, 'App-only and source-file status use the same typography');
  assert.equal(flatten(fileProgress.props.style).fontSize, flatten(fileTitle.props.style).fontSize);
  assert.equal(flatten(fileProgress.props.style).lineHeight, 20);
  fileGate.resolve(); fileGate = null; await tick(); assert.equal(store.getState().patches[metadata.metadataKey(original, 'changed')], image);
  render().find(node => node.type === 'Switch' && node.props.accessibilityLabel === '같은 앨범의 곡에도 앨범아트 적용').props.onValueChange(true);
  failFileAt = fileCalls + 2; button('앨범아트 적용').props.onPress(); await tick();
  assert(render().some(node => node.props.accessibilityRole === 'alert' && node.props.children.includes('1곡의 파일')));
  assert.equal(store.getState().patches[metadata.metadataKey(second, 'changed')], undefined, 'A failed later file leaves only confirmed earlier writes applied');
  states.length = 0; refs.length = 0; editingSong = { ...original, source: 'drive', drive: { accountId: 'A', fileId: 'file' } };
  render().find(node => node.type === 'Button').props.onPress(); assert.equal(fileSwitch().props.disabled, true);
  render().find(node => node.type === 'Button' && node.props.accessibilityLabel === 'Google Drive 앨범아트 파일 직접 수정 안내').props.onPress();
  assert(render().some(node => node.type === 'Toast' && node.props.message.includes('Google Drive 파일은 직접 수정할 수 없습니다')));
  const beforeDrive = fileCalls; button('이미지 파일 선택').props.onPress(); await tick(); button('앨범아트 적용').props.onPress(); await tick();
  assert.equal(fileCalls, beforeDrive, 'Drive cover edits only change app display');
  states.length = 0; refs.length = 0; const mixedDrive = { ...editingSong, id: 'drive-three' }; editingSong = original; visible = [original, mixedDrive]; failFileAt = 0;
  render().find(node => node.type === 'Button').props.onPress();
  render().find(node => node.type === 'Switch' && node.props.accessibilityLabel === '같은 앨범의 곡에도 앨범아트 적용').props.onValueChange(true);
  fileSwitch().props.onValueChange(true); const beforeMixed = fileCalls;
  button('앨범아트 적용').props.onPress(); await tick(); assert.equal(fileCalls, beforeMixed + 1, 'Mixed album writes skip Drive originals');
  assert.equal(store.getState().patches[metadata.metadataKey(mixedDrive, 'changed')], image, 'Drive songs in a mixed album receive display edits');
  states.length = 0; refs.length = 0; visible = [original, { ...second, path: '/music/two.wav' }];
  render().find(node => node.type === 'Button').props.onPress();
  render().find(node => node.type === 'Switch' && node.props.accessibilityLabel === '같은 앨범의 곡에도 앨범아트 적용').props.onValueChange(true);
  assert.equal(fileSwitch().props.disabled, true, 'An unsupported file in a bulk selection keeps file saving off');
  states.length = 0; refs.length = 0; editingAlbum = true;
  editingSong = { ...original, albumSource: 'fallback' };
  const folderSecond = { ...second, albumSource: 'fallback' }, other = { ...second, id: 'other-album', album: 'Other album' };
  visible = [editingSong, folderSecond, other];
  assert(render().some(node => node.type === 'Input'), 'Album selection opens the editor immediately');
  assert.equal(render().some(node => node.type === 'Switch' && node.props.accessibilityLabel === '같은 앨범의 곡에도 앨범아트 적용'), false, 'Album-level editing always targets the album');
  assert.equal(fileSwitch().props.value, false, 'Album-level source writes stay opt-in');
  const folderKeys = [editingSong, folderSecond].map(song => metadata.metadataKey(song, 'changed'));
  await store.getState().save(folderKeys, undefined);
  button('이미지 파일 선택').props.onPress(); await tick(); assert(folderKeys.every(key => !store.getState().patches[key]), 'File selection still requires explicit apply');
  button('앨범아트 적용').props.onPress(); await tick(); assert(folderKeys.every(key => store.getState().patches[key] === image), 'Explicit folder album selection updates every matching displayed song');
  assert.equal(store.getState().patches[metadata.metadataKey(other, 'changed')], undefined, 'Unrelated albums cannot join an explicit album edit');
  button('원래 앨범아트로 되돌리기').props.onPress(); await tick(); assert(folderKeys.every(key => !store.getState().patches[key]));
  button('웹에서 앨범아트 찾기').props.onPress(); await tick();
  render().find(node => node.type === 'Image').props.onError();
  const failedCandidate = render().find(node => node.type === 'Button' && node.props.accessibilityState?.selected === false);
  assert(failedCandidate.props.disabled); assert(nodes(failedCandidate).some(node => node.type === 'Icon'), 'Failed search thumbnails show an explicit placeholder');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
