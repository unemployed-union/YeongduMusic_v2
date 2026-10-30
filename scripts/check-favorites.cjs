/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const { create } = require('zustand');
function load(file, modules = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, exports = {};
  new Function('require', 'exports', ...Object.keys(globals), code)(name => {
    if (name === 'zustand') return { create };
    if (name === '@/theme/layout') return load('src/theme/layout.ts');
    if (name in modules) return modules[name];
    if (['@/services/async/serial-queue', '@/services/preferences/storage', '@/services/preferences/persistence'].includes(name)) return require('./test-source-loader.cjs').loadSource('src/' + name.slice(2) + '.ts', modules, globals);
    throw Error('Unexpected dependency ' + name);
  }, exports, ...Object.values(globals));
  return exports;
}
const metadata = load('src/features/metadata/rules.ts');
const rules = load('src/features/favorites/rules.ts', { '@/features/metadata/rules': metadata });
const displayRules = load('src/features/favorites/display-preferences.ts');
const privacy = load('src/features/hidden-music/rules.ts', { '@/services/music-source': load('src/services/music-source.ts') });
const base = { title: 'Song', artist: 'Artist', album: 'Album', duration: 180 };
const nas = { ...base, id: 'one', artworkUrl: 'https://example.invalid/?_sid=secret' };
const local = { ...base, id: 'local-one', source: 'local', local: { fileName: 'one.mp3', originalName: 'one.mp3', size: 10 } };
const drive = { ...base, id: 'drive-one', source: 'drive', drive: { accountId: 'A', fileId: 'one', mimeType: 'audio/mpeg' } };
const s3 = { ...base, id: 's3-one', source: 's3', s3: { connectionId: 'A', key: 'music/one.mp3', size: 10 } };
const nasKey = rules.favoriteKey(nas, 'demo'), localKey = rules.favoriteKey(local, null);
const flush = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function runtime(platform = 'android', disk = new Map(), display = false) {
  let failRead = false, failWrite = false, gate, reads = 0, writes = 0;
  const storage = {
    getItem: async key => { reads++; if (failRead) throw Error('read failed'); return disk.get(key) ?? null; },
    setItem: async (key, value) => { if (gate) await gate.promise; writes++; if (failWrite) throw Error('write failed'); disk.set(key, value); },
  };
  const module = load(display ? 'src/stores/favorite-display-preferences.ts' : 'src/stores/favorites.ts', {
    'react-native': { Platform: { OS: platform } }, '@/features/favorites/rules': rules, '@/features/metadata/rules': metadata,
    '@/features/favorites/display-preferences': displayRules,
    'expo-sqlite/kv-store': { __esModule: true, default: storage },
  }, { localStorage: {
    getItem: key => { reads++; if (failRead) throw Error('read failed'); return disk.get(key) ?? null; },
    setItem: (key, value) => { writes++; if (failWrite) throw Error('write failed'); disk.set(key, value); },
  } });
  const store = display ? module.useFavoriteDisplayPreferences : module.useFavoritesStore;
  return { store, disk, reads: () => reads, writes: () => writes, failReads: value => { failRead = value; }, failWrites: value => { failWrite = value; }, hold: value => { gate = value; } };
}
async function checkDisplayStorage() {
  for (const platform of ['android', 'ios', 'web']) {
    const r = runtime(platform, new Map(), true), state = () => r.store.getState();
    await Promise.all([state().load(), state().load()]); assert.equal(r.reads(), 1);
    assert.deepEqual(state().preferences, displayRules.DEFAULT_FAVORITE_DISPLAY);
    await Promise.all([state().setOption('songs', false), state().setOption('album', false)]);
    assert.deepEqual(state().preferences, { enabled: true, songs: false, player: true, album: false });
    await state().setOption('enabled', false); await state().setOption('enabled', true);
    assert.deepEqual(state().preferences, { enabled: true, songs: false, player: true, album: false }, 'Master toggles retain individual choices');
    const restart = runtime(platform, r.disk, true).store; await restart.getState().load();
    assert.deepEqual(restart.getState().preferences, state().preferences, 'Display choices survive restart on every platform');
    const previous = state().preferences; r.failWrites(true);
    await assert.rejects(state().setOption('player', false)); assert.deepEqual(state().preferences, previous);
    r.failWrites(false); await state().setOption('player', false); assert.equal(state().preferences.player, false);
    r.failReads(true); await state().load(true); assert.equal(state().loadError, true);
    const writes = r.writes(); await assert.rejects(state().setOption('enabled', false)); assert.equal(r.writes(), writes);
    r.failReads(false); const key = [...r.disk.keys()][0]; r.disk.set(key, '{bad');
    await state().load(true); assert.equal(state().loadError, true); await assert.rejects(state().setOption('enabled', false));
    r.disk.set(key, JSON.stringify(displayRules.DEFAULT_FAVORITE_DISPLAY)); await state().load(true); assert.equal(state().loadError, false);
  }
  for (const value of [null, [], {}, { ...displayRules.DEFAULT_FAVORITE_DISPLAY, enabled: 'false' }]) assert.throws(() => displayRules.parseFavoriteDisplay(value));
}
async function checkStorage() {
  for (const platform of ['android', 'ios', 'web']) {
    const r = runtime(platform), state = () => r.store.getState();
    await Promise.all([state().load(), state().load()]); assert.equal(r.reads(), 1);
    await Promise.all([state().setLiked(nasKey, true), state().setLiked(localKey, true)]);
    assert.deepEqual(Object.keys(state().songs).sort(), [nasKey, localKey].sort(), 'Concurrent likes retain both songs');
    const timestamp = state().songs[nasKey], count = r.writes(); await state().setLiked(nasKey, true);
    assert.equal(state().songs[nasKey], timestamp); assert.equal(r.writes(), count, 'Duplicate set operations are idempotent');
    const restarted = runtime(platform, r.disk).store; await restarted.getState().load(); assert.deepEqual(restarted.getState().songs, state().songs);
    assert(![...r.disk.values()][0].includes('secret'), 'Store contains identities, never artwork/session URLs');
    const previous = state().songs; r.failWrites(true); await assert.rejects(state().setLiked(nasKey, false)); assert.deepEqual(state().songs, previous);
    r.failWrites(false); await state().setLiked(nasKey, false); assert.equal(state().songs[nasKey], undefined);
    await Promise.all([state().setLiked(nasKey, true), state().setLiked(nasKey, false)]); assert.equal(state().songs[nasKey], undefined, 'Queued changes commit in order');
    r.failReads(true); await state().load(true); assert.equal(state().loadError, true); const writes = r.writes();
    await assert.rejects(state().setLiked(nasKey, true)); assert.equal(r.writes(), writes, 'Failed reads never overwrite stored likes');
    r.failReads(false); await state().load(true); assert.equal(state().loadError, false);
    const key = [...r.disk.keys()][0]; r.disk.set(key, '{bad'); await state().load(true); assert.equal(state().loadError, true);
    await assert.rejects(state().setLiked(nasKey, true)); assert.equal(r.disk.get(key), '{bad');
    r.disk.set(key, JSON.stringify({ version: 1, songs: {} })); await state().load(true); await state().setLiked(nasKey, true);
  }
  const r = runtime(), state = () => r.store.getState(); await state().load();
  const gate = deferred(); r.hold(gate); const add = state().setLiked(nasKey, true); await flush();
  assert.equal(state().songs[nasKey], undefined, 'A failed disk write cannot leave a heart falsely selected');
  const addOther = state().setLiked(localKey, true), reload = state().load(true); gate.resolve(); await Promise.all([add, addOther, reload]);
  assert(state().songs[nasKey] && state().songs[localKey], 'Reloads serialize with pending writes');
}
function checkIdentityAndVisibility() {
  assert.notEqual(nasKey, rules.favoriteKey(nas, 'another-account'));
  assert.equal(rules.favoriteKey(nas, null), null);
  for (const song of [drive, s3]) {
    const other = song.source === 'drive' ? { ...song, drive: { ...song.drive, accountId: 'B' } } : { ...song, s3: { ...song.s3, connectionId: 'B' } };
    assert.notEqual(rules.favoriteKey(song, null), rules.favoriteKey(other, null));
  }
  assert.equal(localKey, rules.favoriteKey(local, 'another-nas-account'));
  for (const raw of ['{}', '{"version":2,"songs":{}}', '{"version":1,"songs":{"bad":1}}', JSON.stringify({ version: 1, songs: { [nasKey]: -1 } })]) assert.throws(() => rules.parseFavorites(raw));
  const favorites = { [nasKey]: 10, [localKey]: 20, [rules.favoriteKey(drive, null)]: 30, [rules.favoriteKey(s3, null)]: 40 };
  const visible = privacy.visibleSongs({ items: [nas, local, drive, s3] }, [{ id: 'hidden', enabled: true, songIds: [nas.id], folders: [] }]);
  assert.deepEqual(rules.favoriteSongs(visible.items, favorites, 'demo'), [s3, drive, local], 'Hidden songs cannot appear in the liked queue');
  assert.deepEqual(rules.favoriteSongs([nas], favorites, 'another-account'), [], 'Account changes cannot reuse NAS likes');
  const edited = { ...local, title: 'Edited title', artworkUrl: 'fresh.jpg' };
  assert.equal(rules.favoriteSongs([edited], favorites, null)[0], edited, 'Liked songs use fresh library metadata');
}
const jsx = (type, props) => ({ type, props });
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
function hooks() {
  const slots = []; let cursor = 0;
  return { react: {
    useEffect: fn => fn(),
    useMemo: fn => fn(), useCallback: fn => fn, useRef: current => { const i = cursor++; return slots[i] ??= { current }; },
    useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
  }, render(fn) { cursor = 0; return fn(); } };
}
async function checkUI() {
  const r = runtime(); await r.store.getState().load();
  const d = runtime('android', new Map(), true); await d.store.getState().load();
  const useFavoriteDisplayPreferences = select => select ? select(d.store.getState()) : d.store.getState();
  const useFavoritesStore = select => select ? select(r.store.getState()) : r.store.getState(); useFavoritesStore.getState = r.store.getState;
  const calls = [], alerts = [], h = hooks(), colors = { text: '#fff', muted: '#888', tint: '#f58' };
  const ui = { react: h.react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/theme/liquid-glass': { useLiquidGlass: () => ({ supported: false, enabled: false }) },
    'react-native': { View: 'View', Pressable: 'Button', FlatList: 'List', RefreshControl: 'Refresh', ActivityIndicator: 'Spinner', Alert: { alert: (...args) => alerts.push(args) }, StyleSheet: { create: value => value } },
    '@expo/vector-icons/Ionicons': 'Icon', '@/components/text': { Text: 'Text' }, '@/theme/tokens': { useColors: () => colors },
    '@/stores/favorites': { useFavoritesStore }, '@/stores/auth': { useAuthStore: select => select({ mode: 'mock', session: null }) },
    '@/stores/favorite-display-preferences': { useFavoriteDisplayPreferences },
    '@/services/haptics': { playHaptic: kind => calls.push(kind) }, '@/features/favorites/rules': rules, '@/features/hidden-music/rules': privacy };
  const Button = load('src/components/favorite-button.tsx', ui).FavoriteButton, render = () => h.render(() => Button({ song: nas }));
  for (let mask = 0; mask < 16; mask++) {
    const preferences = { enabled: !!(mask & 1), songs: !!(mask & 2), player: !!(mask & 4), album: !!(mask & 8) };
    d.store.setState({ preferences });
    for (const location of ['songs', 'player', 'album']) {
      assert.equal(h.render(() => Button({ song: nas, location })) !== null, preferences.enabled && preferences[location], `${location} follows its own switch and the master switch`);
    }
    assert.equal(render() !== null, preferences.enabled && preferences.songs, 'Ordinary song rows default to the songs setting');
  }
  d.store.setState({ ready: false }); assert.equal(render(), null, 'Saved-off buttons never flash during startup');
  d.store.setState({ ready: true, loadError: true }); assert.equal(render(), null, 'Unreadable display settings cannot reveal a saved-off button');
  d.store.setState({ ready: true, loadError: false, preferences: { ...displayRules.DEFAULT_FAVORITE_DISPLAY } });
  const Settings = load('src/features/favorites/favorite-display-settings.tsx', { ...ui,
    '@/components/animated-switch': { AnimatedSwitch: 'Switch' }, '@/features/settings/settings-menu-layout': { useSettingsMenuIconStyle: () => ({}), settingsMenuStyles: { row: {}, icon: {} } },
  }).FavoriteDisplaySettings;
  const switches = () => nodes(Settings()).filter(node => node.type === 'Switch');
  assert.equal(switches().length, 4);
  const gate = deferred(); d.hold(gate);
  switches()[1].props.onValueChange(false); await flush();
  assert(switches().every(node => node.props.busy && !node.props.disabled), 'Pending saves block repeat input without changing switch appearance');
  gate.resolve(); await flush(); d.hold(null); assert.equal(render(), null);
  await d.store.getState().setOption('songs', true);
  let button = render(); assert.equal(button.props.accessibilityState.selected, false);
  button.props.onPress(); button.props.onPress(); await flush(); assert.equal(r.writes(), 1, 'Repeated callbacks during saving do not double-toggle');
  button = render(); assert.equal(button.props.accessibilityState.selected, true); assert.equal(calls.at(-1), 'selection');
  r.failWrites(true); button.props.onPress(); await flush(); assert.equal(render().props.accessibilityState.selected, true); assert.equal(alerts.length, 1);
  r.failWrites(false); render().props.onPress(); await flush(); assert.equal(render().props.accessibilityState.selected, false);
  r.failReads(true); await r.store.getState().load(true); render().props.onPress(); await flush();
  assert.equal(alerts.at(-1)[0], '좋아요 불러오기 실패', 'Failed retries remain visible');
  r.failReads(false); render().props.onPress(); await flush(); assert.equal(r.store.getState().loadError, false);
  await r.store.getState().setLiked(localKey, true); await r.store.getState().setLiked(nasKey, true);
  let queue, sourceOverride, queryEnabled;
  const screenHooks = hooks();
  const sorting = load('src/features/library/sort-library.ts');
  const { LibraryPage } = load('src/features/library/library-page.tsx', { ...ui,
    react: { ...screenHooks.react, memo: fn => fn }, 'expo-router': { router: { push() {} } },
    '@/components/song-row': { SongRow: 'Song' }, '@/components/async-state': { AsyncState: 'Async' }, '@/components/tab-scroll-edge-fade': { TabScrollEdgeFade: 'Fade' },
    '@/components/artwork': { Artwork: 'Artwork' }, '@/components/list-loading': { ListLoading: 'Loading' },
    './sort-library': sorting, './album-properties': { AlbumProperties: 'AlbumProperties' }, './prepare-album-colors': { prepareAlbumColors() {} },
    '@/features/playback/play-and-open-player': { playAndOpenPlayer: async (songs, index) => { queue = { songs, index }; } },
  });
  const Screen = load('src/features/favorites/liked-songs-screen.tsx', { ...ui, react: screenHooks.react,
    '@/features/library/library-page': { LibraryPage },
    '@/components/song-row': { SongRow: 'Song' }, '@/components/async-state': { AsyncState: 'Async' }, '@/components/tab-scroll-edge-fade': { TabScrollEdgeFade: 'Fade' },
    '@/features/library/queries': { useSongs: (enabled, source) => { queryEnabled = enabled; sourceOverride = source; return { data: { items: [nas, local] }, isPending: false, refetch: async () => {} }; } },
    '@/features/library/sort-library': load('src/features/library/sort-library.ts'),
    '@/features/playback/play-and-open-player': { playAndOpenPlayer: async (songs, index) => { queue = { songs, index }; } }, './rules': rules,
  }).LikedSongsScreen;
  const renderScreen = props => screenHooks.render(() => { const page = Screen(props); assert.equal(page.type, LibraryPage, 'Favorites use the same list page as the other library tabs'); return page.type(page.props); });
  let screen = renderScreen(), list = nodes(screen).find(node => node.type === 'List');
  assert.equal(sourceOverride, 'all'); assert.equal(list.props.data.length, 2);
  assert.equal(list.props.contentContainerStyle.paddingTop, 12, 'Favorites rows start at the same inset as the other tabs');
  assert.equal(list.props.contentContainerStyle.paddingHorizontal, 22);
  assert(!nodes(list.props.ListHeaderComponent).some(node => node.props?.accessibilityRole === 'header' || node.props?.accessibilityLabel === '좋아요한 곡 전체 재생'), 'The independent-page hero is removed from the embedded tab');
  assert.notEqual(list.props.keyExtractor(local), list.props.keyExtractor({ ...nas, id: local.id }), 'Source/account identities remain distinct in the shared list');
  list.props.renderItem({ item: list.props.data[1], index: 1 }).props.onPress(); assert.deepEqual(queue, { songs: list.props.data, index: 1 });
  await r.store.getState().setLiked(nasKey, false); screen = renderScreen(); list = nodes(screen).find(node => node.type === 'List');
  assert.deepEqual(list.props.data, [local], 'Unliking removes the song from the collection immediately after saving');
  screen = renderScreen({ width: 320, active: false });
  assert.equal(screen.props.accessibilityElementsHidden, true); assert.equal(queryEnabled, false, 'Inactive favorites do not fetch or appear in accessibility navigation');
  let scrolled;
  screen = renderScreen({ width: 320, active: true, sortOrder: 'ascending', onListScroll: tab => { scrolled = tab; } });
  assert.equal(queryEnabled, true); nodes(screen).find(node => node.type === 'List').props.onScroll({}); assert.equal(scrolled, 'favorites');
}
(async () => {
  checkIdentityAndVisibility(); await checkStorage(); await checkDisplayStorage(); await checkUI();
  console.log('PASS: Android/iOS/web persistence and restart, account/source identities, ordered and idempotent writes, corruption/read/write recovery, hidden-song filtering, fresh metadata, favorite buttons, collection removal and playback queue. Native UI/storage are mocked.');
})().catch(error => { console.error(error); process.exitCode = 1; });
