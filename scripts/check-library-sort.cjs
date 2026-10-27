/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..'), ts = require(path.join(root, 'node_modules/typescript'));
function load(file, modules = {}) {
  modules = { ...require('./test-cloud-fixtures.cjs').cloudFixtures({}, modules), ...modules };
  const mod = { exports: {} }, code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'module', 'exports', code)(name => { if (!(name in modules)) throw Error('Unexpected import ' + name); return modules[name]; }, mod, mod.exports);
  return mod.exports;
}
const sorting = load('src/features/library/sort-library.ts');
const sort = sorting.sortLibraryItems;
for (const field of ['title', 'name']) {
  const items = Object.freeze(['다', '나 10', '가', '나 2'].map((value, index) => Object.freeze({ id: String(index), [field]: value })));
  assert.equal(sort(items, 'default'), items);
  assert.deepEqual(sort(items, 'ascending').map(item => item[field]), ['가', '나 2', '나 10', '다']);
  assert.deepEqual(sort(items, 'descending').map(item => item[field]), ['다', '나 10', '나 2', '가']);
  assert.deepEqual(items.map(item => item[field]), ['다', '나 10', '가', '나 2']);
}
const mixed = Object.freeze([{ id: 'nas-1', title: 'Same', source: 'nas' }, { id: 'local-1', title: 'same', source: 'local' }]);
for (const order of ['ascending', 'descending']) assert.deepEqual(sort(mixed, order), mixed, 'Equal names retain source order');
assert.deepEqual(sort([], 'ascending'), []);
let memo, calls = 0, queue;
const jsx = (type, props) => ({ type, props });
const modules = {
  react: { memo: fn => fn, useCallback: fn => fn, useState: value => [value, () => {}], useMemo: (fn, deps) => { if (!memo || deps.some((value, index) => value !== memo.deps[index])) memo = { deps, value: fn() }; return memo.value; } },
  './album-properties': { AlbumProperties: 'AlbumProperties' },
  'react/jsx-runtime': { jsx, jsxs: jsx },
  '@/components/text': { Text: 'Text' },
  '@/components/text': { Text: 'Text' },
  '@/components/text': { Text: 'Text' },
  'react-native': { FlatList: 'FlatList', View: 'View', Text: 'Text', Pressable: 'Pressable', RefreshControl: 'RefreshControl', StyleSheet: { create: value => value, hairlineWidth: 1 } },
  'expo-router': { router: { push() {} }, useIsFocused: () => true }, '@expo/vector-icons/Ionicons': 'Ionicons',
  '@/components/tab-scroll-edge-fade': { TabScrollEdgeFade: 'ScrollEdgeFade' }, '@/components/artwork': { Artwork: 'Artwork' },
  '@/components/async-state': { AsyncState: 'AsyncState' }, '@/components/song-row': { SongRow: 'SongRow' },
  '@/components/list-loading': { ListLoading: 'ListLoading' },
  '@/features/playback/play-and-open-player': { playAndOpenPlayer: (items, index) => { queue = { items, index }; } },
  '@/theme/tokens': { useColors: () => ({}) }, './sort-library': { sortLibraryItems: (...args) => { calls++; return sort(...args); } },
};
const { LibraryPage } = load('src/features/library/library-page.tsx', modules);
function find(node, type) {
  if (!node || typeof node !== 'object') return undefined;
  if (node.type === type) return node;
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) { const match = find(child, type); if (match) return match; }
}
const songs = Object.freeze([{ id: 'nas-a', title: 'Z', source: 'nas' }, { id: 'local-b', title: 'A', source: 'local' }]);
const props = { tab: 'songs', sortOrder: 'ascending', width: 400, data: { items: songs, total: 2 }, onRefresh: async () => {} };
let list = find(LibraryPage(props), 'FlatList');
assert.deepEqual(list.props.data.map(item => item.id), ['local-b', 'nas-a']);
list.props.renderItem({ item: list.props.data[0], index: 0 }).props.onPress();
assert.equal(queue.items, list.props.data); assert.equal(queue.items[queue.index].id, 'local-b');
LibraryPage({ ...props, refreshing: true }); assert.equal(calls, 1, 'Unrelated renders do not re-sort');
list = find(LibraryPage({ ...props, sortOrder: 'default' }), 'FlatList'); assert.equal(list.props.data, songs);
assert.deepEqual(songs.map(item => item.id), ['nas-a', 'local-b'], 'Shared cache and existing queue input stay unchanged');
const newSongs = [...songs, { id: 'local-c', title: 'B', source: 'local' }];
list = find(LibraryPage({ ...props, data: { items: newSongs, total: 3 } }), 'FlatList');
assert.deepEqual(list.props.data.map(item => item.id), ['local-b', 'local-c', 'nas-a']);
// Exercise the actual menu selection handlers and selected indicator.
let open = false, selected;
modules.react.useState = () => [open, value => { open = value; }];
modules['@/features/playlists/dialogs'] = { PlaylistSheet: 'Sheet' };
const { LibrarySortControl } = load('src/features/library/library-sort-control.tsx', modules);
const controlProps = { tab: 'artists', order: 'default', onChange: value => { selected = value; } };
let control = LibrarySortControl(controlProps);
control.props.children[0].props.onPress(); assert.equal(open, true);
control = LibrarySortControl(controlProps);
const sheet = control.props.children[1]; assert.equal(sheet.props.visible, true); assert.equal(sheet.props.title, '아티스트 정렬');
const options = sheet.props.children.props.children.at(-1);
assert.equal(options[0].props.accessibilityState.checked, true);
for (let i = 0; i < 3; i++) { options[i].props.onPress(); assert.equal(selected, ['default', 'ascending', 'descending'][i]); assert.equal(open, false); }
// Exercise per-tab state through the actual library screen, including swipe navigation.
let stateSlot = 0, refSlot = 0;
const states = [], refs = [];
modules.react.useState = initial => { const index = stateSlot++; if (states[index] === undefined) states[index] = initial; return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; };
modules.react.useRef = initial => { const index = refSlot++; return refs[index] ??= { current: initial }; };
modules.react.useEffect = () => {};
modules['react-native'].ScrollView = 'ScrollView'; modules['react-native'].useWindowDimensions = () => ({ width: 400 });
modules['@/components/screen-header'] = { ScreenHeader: 'ScreenHeader' };
modules['@/components/settings-button'] = { SettingsButton: 'SettingsButton' };
modules['@/features/library/library-page'] = { LIBRARY_TABS: ['albums', 'songs', 'artists'], LibraryPage: 'LibraryPage' };
modules['@/features/library/library-pager'] = { LibraryPager: 'LibraryPager' };
modules['@/features/library/local-music-controls'] = { LocalMusicControls: 'LocalMusicControls' };
modules['@/features/library/library-sort-control'] = { LibrarySortControl: 'LibrarySortControl' };
modules['@/features/library/queries'] = { useAlbums: () => ({}), useSongs: () => ({}), useArtists: () => ({}) };
modules['@/features/library/use-refresh-library'] = { useRefreshLibrary: () => ({ refresh: async () => {} }) };
modules['react-native-reanimated'] = { __esModule: true, default: { View: 'AnimatedView' } };
let controlsRevealed = 0;
modules['@/features/library/use-library-controls'] = { useLibraryControls: () => ({ hidden: false, show() { controlsRevealed++; }, selectPage() {}, onScroll() {}, onLayout() {}, frameStyle: {}, contentStyle: {} }) };
modules['@/stores/auth'] = { useAuthStore: selector => selector({ mode: 'mock' }) };
const menuRules = load('src/features/settings/menu-layout.ts');
const menuLayout = menuRules.defaultMenuLayout();
modules['@/features/settings/menu-layout'] = menuRules;
modules['@/stores/menu-preferences'] = { useMenuPreferences: selector => selector({ layout: menuLayout }) };
const Screen = load('src/app/(tabs)/(library)/index.tsx', modules).default;
function screen() { stateSlot = 0; refSlot = 0; return Screen(); }
function sortProps(tree) { return find(tree, 'LocalMusicControls').props.sortControl.props; }
function swipe(tree, index) { find(tree, 'LibraryPager').props.onPageChange(index); }
let tree = screen(); assert.equal(sortProps(tree).tab, 'albums'); sortProps(tree).onChange('descending');
tree = screen(); assert.equal(sortProps(tree).order, 'descending'); swipe(tree, 1);
tree = screen(); assert.equal(sortProps(tree).tab, 'songs'); assert.equal(sortProps(tree).order, 'default'); sortProps(tree).onChange('ascending');
tree = screen(); swipe(tree, 2); tree = screen(); assert.equal(sortProps(tree).order, 'default'); swipe(tree, 0);
tree = screen(); assert.equal(sortProps(tree).order, 'descending');
assert.deepEqual(find(tree, 'LibraryPager').props.children.map(page => page.props.sortOrder), ['descending', 'ascending', 'default', 'default']);
const horizontalPager = find(tree, 'LibraryPager');
horizontalPager.props.onSwipeStart(); assert.equal(controlsRevealed, 1, 'An accepted horizontal drag reveals controls immediately');
assert.deepEqual(horizontalPager.props.children.map(page => page.props.active), [true, false, false, false]);
swipe(tree, 3); tree = screen(); assert.equal(sortProps(tree).tab, 'favorites'); sortProps(tree).onChange('ascending');
tree = screen(); assert.equal(find(tree, 'LikedSongsScreen').props.sortOrder, 'ascending');
console.log('PASS: default/order restoration, Korean/numeric names, stable ties, immutable mixed sources, memo reuse, refreshed data, displayed playback queue and sort menu handlers. Native layout is mocked.');
