/* global __dirname */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), ts = require('typescript');
const root = path.resolve(__dirname, '..'), jsx = (type, props) => ({ type, props });
function load(file, modules) {
  modules = { '@/services/haptics': { playHaptic() {}, prepareHaptics() {} }, ...modules };
  const exports = {}, code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'exports', code)(name => { if (name in modules) return modules[name]; throw Error(name); }, exports); return exports;
}
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const flatten = value => Object.assign({}, ...[value].flat(Infinity).filter(Boolean));
function hooks() {
  const slots = []; let index = 0;
  return { react: {
    forwardRef: fn => fn, memo: fn => fn, useCallback: fn => fn, useMemo: fn => fn(), useEffect: () => {},
    useState: initial => { const i = index++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef: initial => { const i = index++; return slots[i] ??= { current: initial }; },
    useImperativeHandle: (ref, create) => { if (ref) ref.current = { get native() { return create(); } }; },
  }, render: fn => { index = 0; return fn(); } };
}
const ui = { 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': { View: 'View', Pressable: 'Button', TextInput: 'NativeInput', FlatList: 'List', RefreshControl: 'Refresh',
  StyleSheet: { create: value => value, flatten, hairlineWidth: 1 } },
  '@/components/text': { Text: 'Text' }, '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Icon' }, '@/theme/tokens': { useColors: () => ({ text: '#fff', muted: '#888' }) } };
function checkInput() {
  const h = hooks(), ref = {}; let value = '검색어', changes = [], focused = 0, cleared = 0;
  const Input = load('src/components/text-input.tsx', { ...ui, react: h.react }).TextInput;
  const native = { focus: () => { focused++; }, clear: () => { cleared++; } };
  const render = (props = {}) => h.render(() => Input({ value, onChangeText: next => { value = next; changes.push(next); }, accessibilityLabel: '검색',
    style: [{ flex: 1, marginTop: 8, minHeight: 46, paddingHorizontal: 12, color: '#fff', borderWidth: 1 }], ...props }, ref));
  let tree = render(), field = nodes(tree).find(node => node.type === 'NativeInput'); field.props.ref.current = native;
  assert.equal(ref.current.native, native, 'Login refs still target the native input');
  assert.equal(flatten(tree.props.style).marginTop, 8); assert.equal(flatten(field.props.style).marginTop, undefined, 'Outer layout margins are applied once');
  assert.equal(flatten(field.props.style).paddingRight, 50, 'Clear control cannot cover the entered text');
  nodes(tree).find(node => node.type === 'Button').props.onPress(); assert.deepEqual(changes, ['']); assert.equal(focused, 1); assert.equal(cleared, 0);
  assert(!nodes(render()).some(node => node.type === 'Button'), 'Empty inputs hide the clear button');
  value = 'secret'; assert(!nodes(render({ editable: false })).some(node => node.type === 'Button')); assert(!nodes(render({ readOnly: true })).some(node => node.type === 'Button'));
  const submit = () => {}; tree = render({ secureTextEntry: true, onSubmitEditing: submit, maxLength: 60, keyboardType: 'url' });
  field = nodes(tree).find(node => node.type === 'NativeInput'); assert.equal(field.props.secureTextEntry, true); assert.equal(field.props.onSubmitEditing, submit); assert.equal(field.props.maxLength, 60); assert.equal(field.props.keyboardType, 'url');
  field.props.onChangeText('replacement'); assert.equal(value, 'replacement');
  const uncontrolled = hooks(), Free = load('src/components/text-input.tsx', { ...ui, react: uncontrolled.react }).TextInput;
  const renderFree = () => uncontrolled.render(() => Free({ defaultValue: 'initial' }));
  tree = renderFree(); nodes(tree).find(node => node.type === 'NativeInput').props.ref.current = native;
  nodes(tree).find(node => node.type === 'Button').props.onPress(); assert.equal(cleared, 1); assert(!nodes(renderFree()).some(node => node.type === 'Button'));
}
function checkSongMenu() {
  const h = hooks(); let played = 0;
  const SongRow = load('src/components/song-row.tsx', { ...ui, react: h.react, './artwork': { Artwork: 'Artwork' }, '@/features/library/song-properties': { SongProperties: 'Menu' } }).SongRow;
  const song = { id: 'song', title: 'Title', artist: 'Artist', album: 'Album' }, render = () => h.render(() => SongRow({ song, onPress: () => { played++; } }));
  let tree = render(); const touch = nodes(tree).find(node => node.props?.onLongPress);
  touch.props.onLongPress(); assert.equal(played, 0, 'Opening properties never starts playback');
  const menu = nodes(render()).find(node => node.type === 'Menu'); assert.deepEqual(menu.props.song, song);
  menu.props.onClose(); assert(!nodes(render()).some(node => node.type === 'Menu')); nodes(render()).find(node => node.props?.onLongPress).props.onPress(); assert.equal(played, 1);
}
function checkAlbumMenu() {
  const h = hooks(); let navigated = 0;
  const Page = load('src/features/library/library-page.tsx', { ...ui, react: h.react,
    'expo-router': { router: { push: () => { navigated++; } } }, '@/components/tab-scroll-edge-fade': { TabScrollEdgeFade: 'Fade' }, '@/components/artwork': { Artwork: 'Artwork' },
    '@/components/async-state': { AsyncState: 'Async' }, '@/components/list-loading': { ListLoading: 'Loading' }, '@/components/song-row': { SongRow: 'Song' },
    '@/features/playback/play-and-open-player': {}, './sort-library': { sortLibraryItems: values => values }, './album-properties': { AlbumProperties: 'Properties' },
  }).LibraryPage;
  const album = { id: 'album', title: 'Album', artist: 'Artist' }, render = () => h.render(() => Page({ tab: 'albums', sortOrder: 'title', data: { items: [album], total: 1 }, width: 400, onRefresh() {} }));
  let tree = render(), list = nodes(tree).find(node => node.type === 'List'), card = list.props.renderItem({ item: album, index: 0 });
  card.props.onLongPress(); assert.equal(navigated, 0); const properties = nodes(render()).find(node => node.type === 'Properties'); assert.deepEqual(properties.props.album, album);
  properties.props.onClose(); assert(!nodes(render()).some(node => node.type === 'Properties')); card.props.onPress(); assert.equal(navigated, 1);
  let query = { isPending: true, data: undefined, isError: false }, action = null;
  const Properties = load('src/features/library/album-properties.tsx', { ...ui, react: h.react, 'expo-router': {},
    '@/components/action-menu': { ActionMenu: 'Menu', useMenuAction: () => ({ action, visible: !action, select: value => { action = value; } }) },
    '@/features/playlists/dialogs': { AddToPlaylistDialog: 'Playlist' }, '@/features/artwork/album-artwork-editor': { AlbumArtworkEditor: 'Editor' }, './queries': { useAlbumSongs: () => query } }).AlbumProperties;
  const popup = Properties({ album }); assert.equal(popup.type, 'Menu', 'Long press first offers album actions');
  assert(popup.props.items.find(item => item.id === 'playlist').disabled); popup.props.onSelect('artwork');
  assert.equal(Properties({ album }).props.loading, true);
  query = { data: { items: [{ id: 'visible' }] }, isPending: false, isError: false }; assert.deepEqual(Properties({ album }).props.songs, query.data.items);
  query = { data: undefined, isPending: false, isError: true, error: { message: 'offline' } }; assert.equal(Properties({ album }).props.error, 'offline');
}
checkInput(); checkSongMenu(); checkAlbumMenu();
console.log('PASS: controlled/uncontrolled/empty/disabled/secure input clearing, native refs/focus/submit/layout preservation; long-press properties without playback/navigation, retained normal taps, scoped album editing and loading/error states. Native rendering and touch dispatch are mocked.');
