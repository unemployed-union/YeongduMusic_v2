/* global __dirname */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const ts = require('typescript'), { create } = require('zustand');
const root = path.resolve(__dirname, '..');
function load(file, mocks = {}, globals = {}) {
  mocks = { '@/services/haptics': { playHaptic() {}, prepareHaptics() {} }, ...mocks };
  const exports = {}, code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'exports', ...Object.keys(globals), code)(name => {
    if (name === '@/theme/layout') return load('src/theme/layout.ts');
    if (name in mocks) return mocks[name];
    if (name === '@/services/preferences/persistence') return require('./test-source-loader.cjs').loadSource('src/services/preferences/persistence.ts', mocks, globals); throw Error('Unexpected dependency ' + name);
  }, exports, ...Object.values(globals));
  return exports;
}
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
const jsx = (type, props) => ({ type, props });
const native = { Platform: { OS: 'android' }, View: 'View', Pressable: 'Pressable', Image: 'Image', FlatList: 'List', RefreshControl: 'Refresh', ActivityIndicator: 'Spinner',
  StyleSheet: { create: value => value }, useWindowDimensions: () => ({ width: 400 }) };
function nodes(value) { return Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === 'object' ? [value, ...nodes(value.props?.children)] : []; }
const style = value => Object.assign({}, ...[value].flat(Infinity).filter(Boolean));
const request = load('src/services/cloud-music/request.ts');
const detailRules = load('src/features/library/detail-preferences.ts');
const palette = load('src/features/playback/artwork-colors.ts');
const artistId = '11111111-1111-4111-8111-111111111111', otherId = '22222222-2222-4222-8222-222222222222';
const candidate = (name = '가수', id = artistId) => ({ id, name, score: 100 });
const relations = { id: artistId, relations: [{ type: 'wikidata', url: { resource: 'https://www.wikidata.org/wiki/Q123' } }] };
const entity = { entities: { Q123: { claims: { P18: [{ rank: 'normal', mainsnak: { datatype: 'commonsMedia', snaktype: 'value', datavalue: { value: '가수 & Live.jpg' } } }] } } } };
const commons = { query: { pages: { 1: { imageinfo: [{ thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/photo.jpg/512px-photo.jpg',
  mime: 'image/jpeg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Photo.jpg', extmetadata: {
    Artist: { value: '<a href="https://example.invalid">Photographer &amp; Co</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' },
  } }] } } } };
async function checkPhotos() {
  const calls = [], mbCalls = []; let status = 200, slow;
  const service = load('src/services/artwork/artist-photo.ts', {
    'react-native': native, '@/services/cloud-music/request': request,
    '@/services/metadata/web-search': { musicBrainzRequest: async (url, parse, signal) => {
      assert(!signal.aborted); mbCalls.push(url);
      return parse(url.includes('inc=url-rels') ? relations : { count: 1, artists: [candidate(new URL(url).searchParams.get('query').includes('Other') ? 'Other' : '가수')] });
    } },
  }, { fetch: async (url, options) => {
    calls.push({ url, options });
    if (slow) return slow.promise;
    return new Response(JSON.stringify(url.includes('wbgetentities') ? entity : commons), { status, headers: { 'Retry-After': '60' } });
  } });
  for (const name of ['', ' ', '알 수 없는 아티스트', 'Unknown Artist', 'Various Artists']) {
    assert.equal(service.searchableArtist(name), false); assert.equal(await service.findArtistPhoto(name, new AbortController().signal), null);
  }
  assert.equal(mbCalls.length, 0);
  const query = new URL(service.artistSearchUrl('AC/DC "x" +')).searchParams.get('query');
  assert(query.includes('AC\\/DC \\"x\\" \\+')); assert(query.includes(' OR alias:'));
  assert.equal(service.matchingArtistId({ count: 1, artists: [{ ...candidate('Singer'), aliases: [{ name: '가수' }] }] }, '가수'), artistId);
  assert.equal(service.matchingArtistId({ artists: [candidate(), candidate('가수', otherId)] }, '가수'), null);
  assert.equal(service.matchingArtistId({ count: 21, artists: [candidate()] }, '가수'), null);
  assert.equal(service.matchingArtistId({ artists: [candidate('다른 가수')] }, '가수'), null);
  assert.deepEqual(service.artistSearchNames('헤이즈 (Heize)'), ['헤이즈 (Heize)', '헤이즈', 'Heize']);
  assert.equal(service.matchingArtistId({ artists: [{ ...candidate('Heize'), aliases: [{ name: '헤이즈' }] }] }, '헤이즈 (Heize)'), artistId, 'Multilingual parenthetical tags resolve to one artist');
  assert.equal(service.matchingArtistId({ artists: [candidate('真田 アサミ')] }, '真田アサミ'), artistId, 'CJK spacing does not exclude an exact identity');
  assert.equal(service.matchingArtistId({ artists: [candidate('헤이즈'), candidate('Heize', otherId)] }, '헤이즈 (Heize)'), null, 'Conflicting parenthetical identities remain ambiguous');
  const imageRelation = { id: artistId, relations: [{ type: 'image', url: { resource: 'https://web.archive.org/web/0/https://i.scdn.co/image/artist-photo' } }] };
  assert.equal(service.linkedArtistPhoto(imageRelation, artistId).uri, 'https://i.scdn.co/image/artist-photo', 'Curated archived CDN links can resolve to the current public image');
  assert.equal(service.linkedArtistPhoto(imageRelation, otherId), null);
  assert.equal(service.linkedCommonsFile({ id: artistId, relations: [{ type: 'image', url: { resource: 'https://commons.wikimedia.org/wiki/File:Artist_Profile.jpg' } }] }, artistId), 'Artist Profile.jpg', 'A curated Commons image does not require a separate Wikidata relationship');
  for (const resource of ['https://127.0.0.1/photo', 'https://i.scdn.co.evil.invalid/photo', 'https://web.archive.org/web/0/https://example.invalid/photo', 'https://user:password@i.scdn.co/photo']) {
    assert.equal(service.linkedArtistPhoto({ id: artistId, relations: [{ type: 'image', url: { resource } }] }, artistId), null);
  }
  assert.throws(() => service.matchingArtistId({}, '가수'));
  assert.equal(service.artistWikidataId(relations, artistId), 'Q123');
  assert.throws(() => service.artistWikidataId(relations, otherId));
  assert.equal(service.artistWikidataId({ ...relations, relations: [{ type: 'wikidata', url: { resource: 'https://www.wikidata.org.evil.invalid/wiki/Q123' } }] }, artistId), null);
  assert.equal(service.artistImageFile(entity, 'Q123'), '가수 & Live.jpg');
  const deprecated = JSON.parse(JSON.stringify(entity)); deprecated.entities.Q123.claims.P18[0].rank = 'deprecated';
  assert.equal(service.artistImageFile(deprecated, 'Q123'), null);
  const badImage = JSON.parse(JSON.stringify(commons)); badImage.query.pages[1].imageinfo[0].thumburl = 'https://example.invalid/pixel';
  assert.equal(service.parseArtistPhoto(badImage), null);
  delete badImage.query.pages[1].imageinfo[0].extmetadata.Artist; assert.equal(service.parseArtistPhoto(badImage), null);
  assert.throws(() => service.parseArtistPhoto({ error: { code: 'maxlag' } }));
  const photo = await service.findArtistPhoto('가수', new AbortController().signal);
  assert.equal(photo.credit, 'Photographer & Co'); assert.equal(photo.license, 'CC BY-SA 4.0');
  assert.equal(mbCalls.length, 2); assert.equal(calls.length, 2);
  assert.equal(new URL(calls[1].url).searchParams.get('titles'), 'File:가수 & Live.jpg');
  assert(calls.every(call => call.options.headers['User-Agent'].includes('YeongduMusic')));
  assert.deepEqual(await service.findArtistPhoto(' 가수 ', new AbortController().signal), photo); assert.equal(calls.length, 2);
  const cancel = new AbortController(); cancel.abort(); await assert.rejects(service.findArtistPhoto('가수', cancel.signal), /취소/);
  slow = deferred(); const abort = new AbortController();
  const pending = service.findArtistPhoto('Other', abort.signal); await flush(); abort.abort();
  await assert.rejects(pending, /취소/); slow.resolve(new Response(JSON.stringify(entity))); await flush(); slow = null;
  const count = calls.length; await service.findArtistPhoto('Other', new AbortController().signal);
  assert.equal(calls.length, count + 2, 'Cancelled work is never cached');
  status = 429; await assert.rejects(service.findArtistPhoto('Other', new AbortController().signal, true), /가져오지/);
  const throttled = calls.length; await assert.rejects(service.findArtistPhoto('Other', new AbortController().signal, true), /혼잡/);
  assert.equal(calls.length, throttled, 'Wikimedia Retry-After prevents repeated requests');
  for (const os of ['android', 'ios', 'web']) {
    const platformService = load('src/services/artwork/artist-photo.ts', {
      'react-native': { Platform: { OS: os } }, '@/services/cloud-music/request': request, '@/services/metadata/web-search': {},
    });
    const sourceProp = platformService.artistPhotoSource(photo.uri);
    assert.equal(Array.isArray(sourceProp), os === 'android', 'RN 0.86 Android requires an array source to forward headers to the native Image');
    const source = Array.isArray(sourceProp) ? sourceProp[0] : sourceProp;
    assert.equal(source.uri, photo.uri);
    if (os === 'web') assert.equal(source.headers, undefined, 'Browser images retain the browser User-Agent');
    else assert.equal(source.headers['User-Agent'], calls[0].options.headers['User-Agent'], 'Native image bytes identify the app just like metadata requests');
  }
  return service;
}
async function checkPreferences() {
  const saved = new Map(); let failRead = false, failWrite = false;
  const mocks = { 'react-native': native, zustand: { create }, '@/features/library/detail-preferences': detailRules,
    'expo-sqlite/kv-store': { __esModule: true, default: {
      getItem: async key => { if (failRead) throw Error('read'); return saved.get(key) ?? null; },
      setItem: async (key, value) => { if (failWrite) throw Error('write'); saved.set(key, value); },
    } } };
  const fresh = () => load('src/stores/library-detail-preferences.ts', mocks).useLibraryDetailPreferences;
  const store = fresh(); await store.getState().load(); assert.deepEqual(store.getState().preferences, { artistPhotos: true, albumColors: true });
  await Promise.all([store.getState().setOption('artistPhotos', false), store.getState().setOption('albumColors', false)]);
  assert.deepEqual(store.getState().preferences, { artistPhotos: false, albumColors: false }, 'Queued edits preserve both options');
  const restart = fresh(); await restart.getState().load(); assert.deepEqual(restart.getState().preferences, store.getState().preferences);
  failWrite = true; await assert.rejects(store.getState().setOption('albumColors', true)); assert.equal(store.getState().preferences.albumColors, false); failWrite = false;
  failRead = true; const failed = fresh(); await failed.getState().load(); assert.equal(failed.getState().loadError, true);
  await assert.rejects(failed.getState().setOption('albumColors', true)); failRead = false; await failed.getState().load(true); assert.equal(failed.getState().loadError, false);
  assert.throws(() => detailRules.parseDetailPreferences({ artistPhotos: 'true', albumColors: true }));
  const webStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
  const web = load('src/stores/library-detail-preferences.ts', { ...mocks, 'react-native': { Platform: { OS: 'web' } } }, { localStorage: webStorage }).useLibraryDetailPreferences;
  await web.getState().setOption('artistPhotos', true); assert.equal(JSON.parse([...saved.values()][0]).artistPhotos, true);
  return store;
}
function hooks() {
  const slots = []; let index = 0, effects = [], focused = true;
  const changed = (a, b) => !a || a.length !== b.length || b.some((value, i) => value !== a[i]);
  const useEffect = (fn, deps) => { const i = index++, previous = slots[i];
    if (changed(previous?.deps, deps)) effects.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); };
  return { react: {
    useState: initial => { const i = index++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef: initial => { const i = index++; return slots[i] ??= { current: initial }; },
    useEffect, useMemo: fn => fn(), useCallback: (fn, deps) => { const i = index++; if (changed(slots[i]?.deps, deps)) slots[i] = { deps, fn }; return slots[i].fn; },
  }, focus: fn => useEffect(() => focused ? fn() : undefined, [fn, focused]), blur: () => { focused = false; },
  render: fn => { index = 0; const tree = fn(); effects.splice(0).forEach(effect => effect()); return tree; } };
}
const colors = { background: '#ffffff', text: '#111111', muted: '#777777', tint: '#bb2255' };
const uiMocks = { 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native, '@/components/text': { Text: 'Text' },
  '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Icon' }, '@/theme/tokens': { useColors: () => colors, useAppColorScheme: () => 'light' } };
function headerModule(h) {
  let previous = null, reaction; const changes = [];
  const run = () => { if (!reaction) return; const next = reaction.prepare(); reaction.react(next, previous); previous = next; };
  return { changes, module: load('src/features/library/use-album-header.ts', { react: h.react,
    'react-native-worklets': { scheduleOnRN: (fn, value) => { changes.push(value); fn(value); } },
    'react-native-reanimated': {
      useSharedValue: initial => h.react.useRef({ value: initial, get() { return this.value; }, set(value) { this.value = value; run(); } }).current,
      useAnimatedReaction: (prepare, react) => { reaction = { prepare, react }; run(); },
      useAnimatedStyle: fn => ({ get opacity() { return fn().opacity; } }),
    },
  }) };
}
async function checkPhotoLifecycle(service) {
  const h = hooks(), pending = [];
  const Component = load('src/features/library/artist-photo.tsx', { ...uiMocks, react: h.react, 'expo-router': { useFocusEffect: h.focus }, 'expo-linking': { openURL: async () => {} },
    '@/services/artwork/artist-photo': { artistPhotoSource: service.artistPhotoSource, searchableArtist: name => !!name, findArtistPhoto: (name, signal, refresh) => { const work = deferred(); pending.push({ name, signal, refresh, ...work }); return work.promise; } },
  }).ArtistPhoto;
  let enabled = false, name = 'A'; const render = () => h.render(() => Component({ name, enabled }));
  render(); assert.equal(pending.length, 0);
  enabled = true; render(); assert.equal(pending.length, 1);
  enabled = false; render(); assert.equal(pending[0].signal.aborted, true);
  pending[0].resolve({ uri: 'https://upload.wikimedia.org/a', sourceUrl: 'https://commons.wikimedia.org/wiki/File:A', credit: 'A', license: 'CC BY' }); await flush();
  assert.equal(nodes(render()).some(node => node.type === 'Image'), false, 'Disabling cannot reveal a late photo');
  enabled = true; render(); name = 'B'; render(); assert.equal(pending[1].signal.aborted, true);
  pending[2].resolve({ uri: 'https://upload.wikimedia.org/b', sourceUrl: 'https://commons.wikimedia.org/wiki/File:B', credit: 'B', license: 'CC BY' }); await flush();
  let tree = render(); const image = nodes(tree).find(node => node.type === 'Image');
  assert(Array.isArray(image.props.source), 'The Android Image receives the array form so RN forwards the request headers');
  assert.equal(image.props.source[0].uri, 'https://upload.wikimedia.org/b');
  assert(image.props.source[0].headers['User-Agent'].startsWith('YeongduMusic/'), 'The rendered Image sends the app identification to avoid Wikimedia 403 errors');
  const spinner = nodes(tree).find(node => node.type === 'Spinner'); assert(spinner, 'The spinner remains until the image bytes finish loading');
  const overlay = nodes(tree).find(node => node.props?.children === spinner);
  assert.equal(overlay.props.style.alignItems, 'center'); assert.equal(overlay.props.style.justifyContent, 'center'); assert.equal(overlay.props.style.left, 0); assert.equal(overlay.props.style.right, 0);
  image.props.onLoad(); tree = render(); assert(!nodes(tree).some(node => node.type === 'Spinner'), 'Successful image loading stops the centered spinner');
  image.props.onError(); assert(!nodes(render()).some(node => node.type === 'Image'), 'Broken images expose a retry control and fallback icon');
  nodes(render()).find(node => node.type === 'Pressable' && node.props.accessibilityRole === 'button').props.onPress();
  render(); assert(pending[2].signal.aborted); assert.equal(pending[3].refresh, true);
  pending[3].resolve({ uri: image.props.source[0].uri, sourceUrl: 'https://commons.wikimedia.org/wiki/File:B', credit: 'B', license: 'CC BY' }); await flush();
  const retriedImage = nodes(render()).find(node => node.type === 'Image');
  assert(retriedImage, 'Retry can display the same URL after a failed download');
  assert.deepEqual(retriedImage.props.source, image.props.source, 'Retry also includes the required native request header');
  retriedImage.props.onLoad(); assert(!nodes(render()).some(node => node.type === 'Spinner'));
  h.blur(); render(); assert(pending[3].signal.aborted);
}
async function checkAlbumColors() {
  let available = true, calls = 0, gate = null, fail = false;
  const result = { platform: 'android', dominant: '#ff0000', vibrant: '#00ff00' };
  const service = load('src/services/artwork/palette.ts', { 'react-native': native, expo: { requireOptionalNativeModule: () => available ? { getColors: async () => { calls++; if (gate) await gate.promise; if (fail) throw Error('extract'); return result; } } : null },
    '@/services/cloud-music/request': request, '@/features/playback/artwork-colors': palette });
  assert.deepEqual(await service.readArtworkColors('file:///art', new AbortController().signal), palette.gradientFromImageColors(result));
  assert.deepEqual(service.cachedArtworkColors('file:///art'), palette.gradientFromImageColors(result));
  await service.readArtworkColors('file:///art', new AbortController().signal); assert.equal(calls, 1, 'Reopening an album reuses extracted colors');
  available = false; assert.equal(await service.readArtworkColors('file:///unsupported', new AbortController().signal), null);
  const cancel = new AbortController(); cancel.abort(); await assert.rejects(service.readArtworkColors('file:///art', cancel.signal)); assert.equal(calls, 1);
  available = true; gate = deferred();
  const waiter = new AbortController(), first = service.readArtworkColors('file:///shared', waiter.signal), second = service.readArtworkColors('file:///shared', new AbortController().signal);
  await flush(); assert.equal(calls, 2, 'Touch prewarming and the screen share one extraction');
  waiter.abort(); await assert.rejects(first); gate.resolve(); await second; await flush(); gate = null;
  assert.deepEqual(service.cachedArtworkColors('file:///shared'), palette.gradientFromImageColors(result), 'Canceling one screen does not cancel shared preparation');
  fail = true; await assert.rejects(service.readArtworkColors('file:///failure', new AbortController().signal));
  assert.equal(service.cachedArtworkColors('file:///failure'), undefined, 'Failed extraction stays retryable');
  fail = false; await service.readArtworkColors('file:///failure', new AbortController().signal);
  const h = hooks(), pending = [], cached = new Map();
  const useColors = load('src/features/library/use-album-colors.ts', { react: h.react, 'expo-router': { useFocusEffect: h.focus }, '@/features/playback/artwork-colors': palette,
    '@/services/artwork/palette': { cachedArtworkColors: uri => cached.get(uri), readArtworkColors: (uri, signal) => { const work = deferred(); pending.push({ uri, signal, ...work }); return work.promise; } },
  }).useAlbumColors;
  let enabled = false, uri = 'file:///one'; const render = () => h.render(() => useColors(uri, undefined, enabled));
  assert.equal(render().ready, true); assert.equal(pending.length, 0); enabled = true;
  assert.equal(render().ready, false, 'The album waits for its first palette instead of displaying an unrelated gradient');
  uri = 'file:///two'; assert.equal(render().ready, false); assert(pending[0].signal.aborted);
  const red = palette.createArtworkGradient('#ff0000', '#ff0000'), blue = palette.createArtworkGradient('#0000ff', '#0000ff');
  pending[1].resolve(blue); await flush(); pending[0].resolve(red); await flush(); assert.deepEqual(render(), { colors: blue, ready: true });
  cached.set('file:///cached', red); uri = 'file:///cached'; assert.deepEqual(render(), { colors: red, ready: true }, 'A warm album has final colors on the very first render');
  assert.equal(pending.length, 2);
  uri = 'file:///error'; assert.equal(render().ready, false); pending[2].reject(Error('failed')); await flush();
  assert.deepEqual(render(), { colors: palette.DEFAULT_PLAYER_COLORS, ready: true }, 'Extraction failure cannot leave the album stuck loading');
  enabled = false; assert.deepEqual(render(), { colors: palette.DEFAULT_PLAYER_COLORS, ready: true }); assert(pending[2].signal.aborted);
  let hidden = false, enabledPreference = true, reads = 0;
  const prepare = load('src/features/library/prepare-album-colors.ts', {
    '@/stores/display-preferences': { useDisplayPreferences: { getState: () => ({ hideArtwork: hidden }) } },
    '@/stores/library-detail-preferences': { useLibraryDetailPreferences: { getState: () => ({ load: async () => {}, loadError: false, preferences: { albumColors: enabledPreference } }) } },
    '@/services/artwork/palette': { readArtworkColors: async () => { reads++; } },
  }).prepareAlbumColors;
  await prepare(undefined); hidden = true; await prepare('file:///a'); hidden = false; enabledPreference = false; await prepare('file:///a'); assert.equal(reads, 0);
  enabledPreference = true; await prepare('file:///a'); assert.equal(reads, 1, 'Touch prewarming respects artwork visibility and album-color preferences');
}
function checkAlbumScreen(store) {
  const h = hooks(); let hidden = false, enabled, colorsReady = true;
  const albumHelpers = load('src/features/library/album-library.ts'), params = { id: 'album', title: 'Album', artist: 'Artist' };
  const header = headerModule(h);
  store.setState({ ready: true, loadError: false, preferences: { artistPhotos: true, albumColors: true } });
  const songs = [{ id: 'one', artworkUrl: 'file:///cover' }];
  const Screen = load('src/app/(tabs)/(library)/album/[id].tsx', { ...uiMocks, react: h.react,
    'expo-router': { Stack: { Screen: 'StackScreen' }, useIsFocused: () => true, useLocalSearchParams: () => params },
    '@/features/library/album-library': albumHelpers,
    'expo-router/react-navigation': { useHeaderHeight: () => 96 },
    'expo-status-bar': { StatusBar: 'StatusBar' },
    'react-native-reanimated': { __esModule: true, default: { View: 'AnimatedView' } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 24 }) },
    'expo-linear-gradient': { LinearGradient: 'Gradient' }, '@/components/tab-scroll-edge-fade': { TabScrollEdgeFade: 'ScrollFade' }, '@/components/artwork': { Artwork: 'Artwork' },
    '@/components/async-state': { AsyncState: 'Async' }, '@/components/song-row': { SongRow: 'Song' }, '@/features/library/mock-repository': { mockAlbums: [] },
    '@/features/artwork/album-artwork-editor': { AlbumArtworkEditor: 'AlbumArtworkEditor' },
    '@/features/library/queries': { useAlbumSongs: () => ({ data: { items: songs, total: 1 } }) }, '@/features/playback/play-and-open-player': { playAndOpenPlayer: async () => {} },
    '@/stores/library-detail-preferences': { useLibraryDetailPreferences: () => store.getState() }, '@/stores/display-preferences': { useDisplayPreferences: selector => selector({ hideArtwork: hidden }) },
    '@/features/library/use-album-colors': { useAlbumColors: (uri, p, value) => { enabled = value; return { colors: palette.DEFAULT_PLAYER_COLORS, ready: colorsReady }; } },
    '@/features/library/use-album-header': header.module,
  }).default;
  const render = () => h.render(Screen);
  let tree = render(), list = nodes(tree).find(node => node.type === 'List');
  const renderSong = list.props.renderItem;
  assert.equal(list.props.initialNumToRender, 6, 'Album entry limits the initial native row mount');
  assert.equal(list.props.maxToRenderPerBatch, 6);
  assert.equal(nodes(render()).find(node => node.type === 'List').props.renderItem, renderSong, 'Album layout changes retain the row renderer');
  const hasBackdrop = tree => nodes(tree).some(node => node.type === 'Gradient' && node.props.start);
  assert(enabled); assert(hasBackdrop(tree));
  colorsReady = false; tree = render(); assert(!hasBackdrop(tree));
  assert.equal(nodes(tree).find(node => node.type === 'Async').props.loading, true, 'The first content frame waits for matching colors');
  colorsReady = true; tree = render(); assert(hasBackdrop(tree));
  store.setState({ ready: false }); tree = render(); assert(!hasBackdrop(tree)); assert.equal(nodes(tree).find(node => node.type === 'Async').props.loading, true);
  store.setState({ ready: true }); tree = render();
  assert.equal(nodes(tree).find(node => node.type === 'ScrollFade').props.topEnabled, false, 'The album header supplies the top fade without tinting the cover while it scrolls');
  assert.equal(list.props.contentInsetAdjustmentBehavior, 'never');
  assert.equal(list.props.scrollIndicatorInsets.top, 96);
  const hero = nodes(list.props.ListHeaderComponent).find(node => node.props?.onLayout);
  assert.equal(style(hero.props.style).paddingTop, 123, 'The artwork starts below the measured transparent native header');
  hero.props.onLayout({ nativeEvent: { layout: { height: 520 } } }); tree = render(); list = nodes(tree).find(node => node.type === 'List');
  const gradientOpacity = tree => style(nodes(tree).find(node => node.type === 'AnimatedView').props.style).opacity;
  const scroll = offset => { list.props.onScroll({ nativeEvent: { contentOffset: { y: offset }, contentInset: { top: 0 } } }); tree = render(); list = nodes(tree).find(node => node.type === 'List'); };
  assert.equal(gradientOpacity(tree), 0, 'Top of album has no separate header background');
  assert.equal(nodes(tree).find(node => node.type === 'StackScreen').props.options.headerTintColor, '#FFFFFF');
  assert.equal(nodes(tree).find(node => node.type === 'StatusBar').props.style, 'light');
  scroll(100); assert.equal(gradientOpacity(tree), 0, 'Scrolling within the artwork area does not introduce a top tint');
  scroll(396); assert.equal(gradientOpacity(tree), 0.5, 'The header fades as the song surface approaches it');
  scroll(450); assert.equal(gradientOpacity(tree), 1);
  assert.equal(nodes(tree).find(node => node.type === 'StackScreen').props.options.headerTintColor, colors.tint);
  assert.equal(nodes(tree).find(node => node.type === 'StatusBar').props.style, 'dark', 'A light theme keeps dark status icons over the list gradient');
  const updates = header.changes.length; scroll(460); scroll(470); assert.equal(header.changes.length, updates, 'Scrolling only updates React when the header color boundary is crossed');
  scroll(-60); assert.equal(gradientOpacity(tree), 0, 'Return to top and pull-to-refresh restore full transparency');
  assert(nodes(list.props.ListHeaderComponent).some(node => node.type === 'Artwork'), 'Artwork scrolls in the same virtualized list');
  assert.equal(style(list.props.renderItem({ item: songs[0], index: 0 }).props.style).backgroundColor, colors.background, 'Full-width song surface covers the fixed gradient');
  assert.equal(list.props.ListFooterComponent.props.style.backgroundColor, colors.background, 'Short albums and bottom spacing never expose the hero behind the list');
  assert.equal(nodes(list.props.renderItem({ item: songs[0], index: 0 })).find(node => node.type === 'Song').props.favoriteLocation, 'album', 'Album rows use the independent album favorite display setting');
  const selectImage = nodes(list.props.ListHeaderComponent).find(node => node.props?.accessibilityLabel === '앨범 이미지 선택');
  selectImage.props.onLongPress();
  const editor = nodes(render()).find(node => node.type === 'AlbumArtworkEditor');
  assert.deepEqual(editor.props.songs, songs, 'Album image editing targets only the current album songs');
  editor.props.onClose(); assert(!nodes(render()).some(node => node.type === 'AlbumArtworkEditor'));
  songs.push({ id: 'two', artworkUrl: 'file:///selected-cover', artworkOriginal: { artworkUrl: 'file:///old' } });
  list = nodes(render()).find(node => node.type === 'List');
  assert.equal(nodes(list.props.ListHeaderComponent).find(node => node.type === 'Artwork').props.item.artworkUrl, 'file:///selected-cover', 'A chosen cover takes priority over earlier original artwork');
  songs.pop();
  hidden = true; assert(!hasBackdrop(render())); assert.equal(enabled, false);
  hidden = false; store.setState({ preferences: { artistPhotos: true, albumColors: false } }); assert(!hasBackdrop(render()));
  store.setState({ preferences: { artistPhotos: true, albumColors: true } }); songs[0].artworkUrl = undefined; assert(!hasBackdrop(render()));
  songs[0].artist = 'One'; songs.push({ id: 'two', artist: 'Two' });
  params.id = albumHelpers.albumId({ album: 'Album' }, true);
  list = nodes(render()).find(node => node.type === 'List');
  assert(nodes(list.props.ListHeaderComponent).some(node => node.type === 'Text' && node.props.children === '여러 아티스트'), 'Merged album headers describe all the artists, including entry from the player');
}
function checkAlbumEditor() {
  const h = hooks(), songs = [{ id: 'drive', source: 'drive' }, { id: 'nas', source: 'nas' }]; let closed = 0;
  const Editor = load('src/features/artwork/album-artwork-editor.tsx', { ...uiMocks, react: h.react,
    '@/components/scroll-edge-fade': { ScrollEdgeFade: 'Fade' }, '@/components/async-state': { AsyncState: 'Async' }, '@/features/playlists/dialogs': { PlaylistSheet: 'Sheet' }, './artwork-editor': { ArtworkEditor: 'Editor' },
  }).AlbumArtworkEditor;
  const render = () => h.render(() => Editor({ album: { id: 'album', title: 'Album', artist: 'Artist' }, songs, onClose: () => { closed++; } }));
  let tree = render(), child = nodes(tree).find(node => node.type === 'Editor');
  assert.equal(child.props.song.id, 'nas', 'Mixed albums retain source-writing options for non-Drive songs');
  assert.equal(child.props.albumSongs, songs);
  child.props.onBusyChange(true); tree = render(); tree.props.onClose(); assert.equal(closed, 0, 'Backdrop and back presses cannot dismiss an active file operation');
  nodes(tree).find(node => node.type === 'Editor').props.onBusyChange(false); tree = render(); tree.props.onClose(); assert.equal(closed, 1);
}
(async () => {
  const service = await checkPhotos(); const store = await checkPreferences(); await checkPhotoLifecycle(service); await checkAlbumColors(); checkAlbumScreen(store); checkAlbumEditor();
  console.log('PASS: artist identity/alias/ambiguity checks, Wikidata and Commons image/credit parsing, safe origins, caching, cancellation, retry backoff, persistent independent native/web options and failed writes, photo focus/disable/late responses, palette fallback/cancellation, scrollable album hero and opaque list/footer. Network, native palette and rendering are mocked.');
})().catch(error => { console.error(error); process.exitCode = 1; });
