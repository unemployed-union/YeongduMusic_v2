/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file, modules) {
  modules = { '@/features/settings/ios-system-settings': { isIosSystemSettingsAvailable: false }, '@/features/settings/ios-system-settings-link': { IosSystemSettingsLink: 'IosSystemSettingsLink' }, ...modules };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => {
    if (name === '@/theme/layout') return load('src/theme/layout.ts');
    if (name === '@/features/library/library-sidebar') return { LibrarySidebar: 'LibrarySidebar' };
    if (name === '@/components/content-title-bar') return { ContentTitleBar: 'ContentTitleBar' };
    if (name === '@/components/content-transition') return { ContentTransition: 'ContentTransition' };
    if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
    if (name in modules) return modules[name];
    if (['@/services/async/serial-queue', '@/services/preferences/storage', '@/services/preferences/persistence'].includes(name)) return require('./test-source-loader.cjs').loadSource('src/' + name.slice(2) + '.ts', modules, {});
    throw Error('Unexpected import: ' + name);
  }, exports);
  return exports;
}
const rules = load('src/features/settings/menu-layout.ts', {});
async function main() {
  const saved = new Map();
  let reads = 0, writes = 0, failWrite = false, failRead = false;
  const storage = {
    getItemAsync: async key => { reads++; if (failRead) throw Error('read'); return saved.get(key) ?? null; },
    setItemAsync: async (key, value) => { writes++; if (failWrite) throw Error('write'); saved.set(key, value); },
  };
  const modules = { zustand: require('zustand'), 'react-native': { Platform: { OS: 'android' } },
    'expo-secure-store': storage, '@/features/settings/menu-layout': rules };
  const createStore = () => load('src/stores/menu-preferences.ts', modules).useMenuPreferences;
  let store = createStore();
  await Promise.all([store.getState().load(), store.getState().load()]);
  assert.equal(reads, 1);
  assert.deepEqual(store.getState().layout, rules.defaultMenuLayout());
  for (const group of ['bottom', 'library', 'player']) {
    const ids = rules.visibleMenuIds(store.getState().layout[group]);
    const last = ids.at(-1);
    await Promise.all(ids.map(id => store.getState().setVisible(group, id, false)));
    assert.deepEqual(rules.visibleMenuIds(store.getState().layout[group]), [last], 'Rapid toggles must leave one menu visible');
    assert.match(store.getState().error, /최소 하나/);
    const writesBefore = writes;
    await store.getState().setVisible(group, last, false);
    assert.equal(writes, writesBefore, 'An invalid toggle never reaches storage');
    await store.getState().setVisible(group, ids[0], true);
    for (let i = 1; i < ids.length; i++) await store.getState().move(group, last, -1);
    assert.deepEqual(rules.visibleMenuIds(store.getState().layout[group]), [last, ids[0]]);
    assert.equal(rules.selectedMenuId(store.getState().layout[group], ids[1]), last, 'Hidden selection falls back to first visible item');
    assert.equal(rules.selectedMenuId(store.getState().layout[group], ids[0]), ids[0], 'Reorder preserves visible selection');
  }
  const before = store.getState().layout;
  failWrite = true;
  await store.getState().move('bottom', 'search', 1);
  assert.deepEqual(store.getState().layout, before, 'Failed saves preserve visible order');
  assert(store.getState().error); assert.equal(store.getState().saving, false);
  failWrite = false;
  store = createStore(); await store.getState().load();
  assert.deepEqual(store.getState().layout, before, 'Both groups survive restart');
  failRead = true; await store.getState().load(true);
  assert(store.getState().error); assert.deepEqual(store.getState().layout, before);
  failRead = false; await store.getState().load(true); assert.equal(store.getState().error, null);
  const key = [...saved.keys()][0]; saved.set(key, '{broken');
  await store.getState().load(true); assert(store.getState().ready); assert(store.getState().error);
  assert.deepEqual(store.getState().layout, before, 'Corrupt persisted data preserves the last usable settings');
  await store.getState().restore(rules.defaultMenuLayout());
  assert.equal(store.getState().error, null);
  for (const group of ['bottom', 'library', 'player']) {
    const invalid = rules.defaultMenuLayout(); invalid[group].forEach(item => { item.visible = false; });
    assert.throws(() => rules.parseMenuLayout(invalid), /최소 하나/);
    const duplicate = rules.defaultMenuLayout(); duplicate[group][1] = duplicate[group][0];
    assert.throws(() => rules.parseMenuLayout(duplicate));
  }
  const legacy = rules.defaultMenuLayout(); delete legacy.player;
  assert.deepEqual(rules.parseMenuLayout(legacy).player, rules.defaultMenuLayout().player, 'Existing settings migrate to a complete player menu');
  const beforeFavorites = rules.defaultMenuLayout(); beforeFavorites.library = beforeFavorites.library.filter(item => item.id !== 'favorites').reverse();
  beforeFavorites.library[1].visible = false;
  assert.deepEqual(rules.parseMenuLayout(beforeFavorites).library, [...beforeFavorites.library, { id: 'favorites', visible: true }], 'Favorites migration preserves existing order and visibility');
  const beforeSpeed = rules.defaultMenuLayout(); beforeSpeed.player = beforeSpeed.player.filter(item => !['playback-speed', 'edit-metadata'].includes(item.id)).reverse();
  beforeSpeed.player[1].visible = false;
  const migrated = rules.parseMenuLayout(beforeSpeed);
  assert.deepEqual(migrated.player.slice(0, -2), beforeSpeed.player, 'Adding new actions preserves previous menu order and visibility');
  assert.deepEqual(migrated.player.slice(-2), [{ id: 'playback-speed', visible: true }, { id: 'edit-metadata', visible: true }]);
  const beforeMetadata = rules.defaultMenuLayout(); beforeMetadata.player = beforeMetadata.player.filter(item => item.id !== 'edit-metadata').reverse();
  beforeMetadata.player[1].visible = false;
  assert.deepEqual(rules.parseMenuLayout(beforeMetadata).player, [...beforeMetadata.player, { id: 'edit-metadata', visible: true }]);
  checkSettingsUI(store);
  checkLibraryPager();
  console.log('PASS: persistent menu order/visibility, rapid toggles, minimum-one invariant, save failure, corrupt storage/retry, ordinary settings access, library pager order/swipe/selection fallback. Native rendering is not exercised.');
}

const jsx = (type, props) => ({ type, props });
const native = { View: 'View', Text: 'Text', Pressable: 'Pressable', ActivityIndicator: 'Spinner', ScrollView: 'ScrollView',
  StyleSheet: { create: styles => styles }, useWindowDimensions: () => ({ width: 400 }) };
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  return node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];
}
function checkSettingsUI(store) {
  const ui = load('src/features/settings/menu-layout-settings.tsx', {
    react: { useEffect: () => {} }, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native,
    '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Icon' }, '@/components/text': { Text: 'Text' },
    '@/components/animated-switch': { AnimatedSwitch: 'Switch' }, '@/stores/menu-preferences': { useMenuPreferences: () => store.getState() },
    '@/theme/tokens': { useColors: () => ({}) }, './menu-layout': rules,
  }).MenuLayoutSettings;
  for (const group of ['bottom', 'library', 'player']) {
    const layout = rules.defaultMenuLayout(); layout[group].forEach((item, index) => { item.visible = index === 1; });
    store.setState({ layout });
    const switches = nodes(ui({ group })).filter(node => node.type === 'Switch');
    assert.deepEqual(switches.map(node => node.props.disabled), layout[group].map((_, index) => index === 1));
    assert.deepEqual(switches.map(node => node.props.value), layout[group].map((_, index) => index === 1));
    const before = nodes(ui({ group })).filter(node => node.type === 'Icon').map(node => node.props.color);
    store.setState({ saving: true });
    const pending = nodes(ui({ group })), pendingSwitches = pending.filter(node => node.type === 'Switch');
    assert(pendingSwitches.every(node => node.props.busy), 'Saving prevents repeated toggle input');
    assert.deepEqual(pendingSwitches.map(node => node.props.disabled), switches.map(node => node.props.disabled), 'Saving does not change the permanent disabled appearance');
    assert.deepEqual(pending.filter(node => node.type === 'Icon').map(node => node.props.color), before, 'Reorder arrows do not flash while toggling');
    store.setState({ saving: false });
  }
  const settings = load('src/app/settings.tsx', {
    react: { useEffect: () => {}, useState: initial => [initial, () => {}] },
    '@/components/toast-notice': { ToastNotice: 'Toast' },
    'react/jsx-runtime': { jsx, jsxs: jsx }, '@/features/settings/settings-ui': { SettingsPage: 'Page', SettingsLink: 'Link', SettingsSection: 'Section' },
    '@/features/settings/version-settings': { VersionSettings: 'Version' }, '@/stores/hidden-feature-access': { useHiddenFeatureAccess: selector => selector({ ready: true, enabled: false }) },
  }).default;
  const links = nodes(settings()).filter(node => node.type === 'Link').map(node => node.props.href);
  assert(links.includes('/settings/bottom-menu')); assert(links.includes('/settings/library')); assert(!links.includes('/settings/player-menu')); assert(!links.includes('/settings/other'));
  assert(links.includes('/settings/playback'), 'Playback settings remain available while hidden settings are off');
  const playback = load('src/app/settings/playback.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx }, '@/features/settings/settings-ui': { SettingsPage: 'Page', SettingsLink: 'Link', SettingsSection: 'Section' },
    '@/features/settings/theme-settings': { ThemeSettings: 'ThemeSettings' },
    '@/features/settings/blur-settings': { BlurSettings: 'BlurSettings' },
    '@/features/lyrics/translation-settings': { LyricsTranslationSettings: 'LyricsTranslationSettings' },
    '@/features/playback/streaming-quality-settings': { StreamingQualitySettings: 'StreamingQualitySettings' },
    '@/features/playback/playback-options-settings': { PlaybackOptionsSettings: 'PlaybackOptionsSettings' },
  }).default;
  assert.equal(nodes(playback()).filter(node => node.type === 'Link' && node.props.href === '/settings/player-menu').length, 1, 'The player menu settings appear once in the playback submenu');
  assert(nodes(playback()).some(node => node.type === 'BlurSettings'), 'Playback/display settings expose the global blur switch');
  assert(nodes(playback()).some(node => node.type === 'Link' && node.props.href === '/settings/colors'), 'App and mini-player colors have a settings entry');
}

function checkLibraryPager() {
  const slots = [], effects = [], selections = [];
  let slot = 0, layout = rules.defaultMenuLayout(), width = 400, focused = true;
  const queryActive = {};
  const react = {
    useCallback: fn => fn,
    useState: initial => { const i = slot++; slots[i] ??= initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef: initial => { const i = slot++; return slots[i] ??= { current: initial }; },
    useMemo: (fn, deps) => { const i = slot++; if (!slots[i] || deps.some((dep, index) => dep !== slots[i].deps[index])) slots[i] = { value: fn(), deps }; return slots[i].value; },
    useEffect: (fn, deps) => { const i = slot++; if (!slots[i] || deps.some((dep, index) => dep !== slots[i][index])) effects.push(fn); slots[i] = deps; },
  };
  const controls = { selectPage: id => selections.push(id), show: () => {} };
  const query = { data: { items: [] } };
  const screen = load('src/app/(tabs)/(library)/index.tsx', {
    'expo-router': { useIsFocused: () => focused },
    '@/theme/liquid-glass': { useLiquidGlass: () => ({ supported: false, enabled: false, reduceTransparency: false }) },
    '@/components/glass-controls': { glassControlStyles: { segments: {}, segment: {} } },
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': { ...native, useWindowDimensions: () => ({ width }) },
    'react-native-reanimated': { __esModule: true, default: { View: 'AnimatedView' } },
    '@/components/text': { Text: 'Text' }, '@/components/screen-header': { ScreenHeader: 'Header' }, '@/components/settings-button': { SettingsButton: 'Settings' },
    '@/features/favorites/liked-songs-screen': { LikedSongsScreen: 'LikedSongsScreen' },
    '@/features/library/library-page': { LibraryPage: 'LibraryPage' }, '@/features/library/local-music-controls': { LocalMusicControls: 'Controls' },
    '@/features/library/library-pager': { LibraryPager: 'LibraryPager' },
    '@/features/library/library-segments': { LibrarySegments: 'LibrarySegments' },
    '@/features/library/library-sort-control': { LibrarySortControl: 'Sort' }, '@/features/library/queries': {
      useAlbums: enabled => { queryActive.albums = enabled; return query; },
      useSongs: enabled => { queryActive.songs = enabled; return query; },
      useArtists: enabled => { queryActive.artists = enabled; return query; },
    },
    '@/features/library/use-refresh-library': { useRefreshLibrary: () => ({}) }, '@/theme/tokens': { useColors: () => ({}) },
    '@/features/library/use-library-controls': { useLibraryControls: () => controls }, '@/stores/menu-preferences': { useMenuPreferences: selector => selector({ layout }) },
    '@/features/settings/menu-layout': rules,
  }).default;
  const render = () => { slot = 0; const tree = screen(); effects.splice(0).forEach(effect => effect()); return tree; };
  const pager = tree => nodes(tree).find(node => node.type === 'LibraryPager');
  const pages = tree => nodes(tree).filter(node => ['LibraryPage', 'LikedSongsScreen'].includes(node.type)).map(node => node.type === 'LikedSongsScreen' ? 'favorites' : node.props.tab);
  let tree = render();
  assert.deepEqual(pages(tree), ['albums', 'songs', 'artists', 'favorites']); assert.equal(pager(tree).props.pageCount, 4);
  const segments = tree => nodes(tree).find(node => node.type === 'LibrarySegments');
  assert.deepEqual(segments(tree).props.tabs, ['albums', 'songs', 'artists', 'favorites']);
  segments(tree).props.onSelect('songs'); tree = render();
  assert.equal(pager(tree).props.pageIndex, 1, 'Native segment selection moves the pager');
  assert.equal(segments(tree).props.selected, 'songs');
  segments(tree).props.onSelect('albums'); tree = render();
  assert.equal(nodes(tree).find(node => node.type === 'Header').props.action.type, 'Settings', 'Header only has the settings action');
  focused = false; render();
  assert.deepEqual(queryActive, { albums: false, songs: false, artists: false }, 'Eager native-tab mounting must not fetch an unfocused library');
  focused = true; render(); assert.equal(queryActive.albums, true);
  pager(tree).props.onPageChange(3); tree = render();
  assert.equal(segments(tree).props.selected, 'favorites', 'Pager swipes update the native selected tag');
  assert.equal(nodes(tree).find(node => node.type === 'LikedSongsScreen').props.active, true);
  assert.equal(nodes(tree).find(node => node.type === 'Controls').props.sortControl.props.tab, 'favorites');
  layout = { ...layout, library: [{ id: 'artists', visible: true }, { id: 'songs', visible: true }, { id: 'albums', visible: false }, { id: 'favorites', visible: false }] };
  tree = render();
  assert.deepEqual(pages(tree), ['artists', 'songs']); assert.equal(selections.at(-1), 'artists'); assert.equal(pager(tree).props.pageIndex, 0);
  assert.deepEqual(segments(tree).props.tabs, ['artists', 'songs'], 'Native segments follow menu order and visibility');
  pager(tree).props.onPageChange(1); tree = render();
  assert.equal(nodes(tree).find(node => node.type === 'Controls').props.sortControl.props.tab, 'songs');
  layout = { ...layout, library: [...layout.library].reverse() }; tree = render();
  assert.equal(nodes(tree).find(node => node.type === 'Controls').props.sortControl.props.tab, 'songs'); assert.equal(pager(tree).props.pageIndex, 0);
  width = 500; tree = render(); assert.equal(pager(tree).props.width, 500); assert.equal(pager(tree).props.pageIndex, 0);
  layout = { ...layout, library: layout.library.map(item => ({ ...item, visible: item.id === 'artists' })) }; tree = render();
  assert.deepEqual(pages(tree), ['artists']); assert.equal(pager(tree).props.pageCount, 1);
  assert.equal(nodes(tree).find(node => node.type === 'Controls').props.sortControl.props.tab, 'artists'); assert.equal(pager(tree).props.pageIndex, 0);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
