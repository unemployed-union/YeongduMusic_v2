/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
const jsx = (type, props) => ({ type, props });
const nodes = tree => !tree || typeof tree !== 'object' ? [] : typeof tree.type === 'function'
  ? nodes(tree.type(tree.props)) : [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
function read(file, dependencies) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (!(name in dependencies)) throw Error('Unexpected dependency ' + name);
    return dependencies[name];
  }, exports);
  return exports;
}
let glass = { supported: true, enabled: true };
const colors = { surface: '#111111', text: '#ffffff', tint: '#ff5588', rowSelected: '#ffffff14' };
const native = { View: 'View', Pressable: 'Pressable', ScrollView: 'ScrollView', Modal: 'Modal', KeyboardAvoidingView: 'KeyboardAvoidingView', StyleSheet: { create: x => x, absoluteFill: {} }, Platform: { OS: 'ios' } };
const shared = {
  '@/theme/liquid-glass': { useLiquidGlass: () => glass },
  '@/theme/tokens': { useColors: () => colors, useAppColorScheme: () => 'dark' },
  'react-native': native, '@/components/text': { Text: 'Text' },
  '@expo/vector-icons/Ionicons': 'Icon', '@/components/glass-backdrop': { GlassBackdrop: 'Glass' },
};
const fallback = jsx('OldSegments', {}), changes = [];
const { LibrarySegments } = read('src/features/library/library-segments.ios.tsx', {
  ...shared, '@expo/ui/swift-ui': { Host: 'Host', Picker: 'Picker', Text: 'NativeText' },
  '@expo/ui/swift-ui/modifiers': Object.fromEntries(['controlSize', 'frame', 'pickerStyle', 'tag'].map(name => [name, value => ({ name, value })])),
  '@/features/settings/menu-layout': { MENU_LABELS: { albums: '앨범', songs: '노래', favorites: '좋아요' } },
});
const props = { tabs: ['favorites', 'songs'], selected: 'songs', onSelect: tab => changes.push(tab), fallback };
let tree = LibrarySegments(props), picker = nodes(tree).find(n => n.type === 'Picker');
assert.equal(tree.props.colorScheme, 'dark');
assert(picker.props.modifiers.some(m => m.name === 'pickerStyle' && m.value === 'segmented'));
assert.equal(picker.props.selection, 'songs');
assert.deepEqual(nodes(picker).filter(n => n.type === 'NativeText').map(n => n.props.modifiers[0].value), ['favorites', 'songs']);
picker.props.onSelectionChange('favorites'); picker.props.onSelectionChange('albums'); picker.props.onSelectionChange('songs');
assert.deepEqual(changes, ['favorites'], 'Accept only visible changed tags');
glass = { supported: true, enabled: false }; assert.notEqual(LibrarySegments(props), fallback, 'Native segmented controls remain native with transparency reduced');
glass = { supported: false, enabled: false }; assert.equal(LibrarySegments(props), fallback);
assert.equal(read('src/features/library/library-segments.tsx', {}).LibrarySegments(props), fallback, 'Android/web import no native SwiftUI');

let slot = 0; const slots = [], imports = [], sources = [], routes = [];
const local = { source: 'all', songs: [], importFiles: kind => imports.push(kind), setSource: source => sources.push(source), load() {} };
let visibleSources = ['all', 'local'];
const { loadSource } = require('./test-source-loader.cjs');
const swiftUI = Object.fromEntries(['List', 'Picker', 'Section', 'Label', 'Button', 'Text'].map(name => [name, 'Native' + name]));
const nativeMenu = loadSource('src/features/library/music-source-menu-content.ios.tsx', {
  ...shared,
  '@expo/ui/swift-ui': swiftUI,
  '@expo/ui/swift-ui/modifiers': Object.fromEntries(['disabled', 'foregroundStyle', 'listStyle', 'pickerStyle', 'tag', 'labelsHidden', 'accessibilityLabel'].map(name => [name, value => ({ name, value })])),
  'react/jsx-runtime': { jsx, jsxs: jsx },
});
const legacyMenu = loadSource('src/features/library/music-source-menu-content.tsx', { ...shared, 'react/jsx-runtime': { jsx, jsxs: jsx } });
let authMode = 'setup';
const controls = read('src/features/library/local-music-controls.tsx', {
  ...shared,
  react: { useState: initial => { const i = slot++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = value; }]; }, useRef: initial => { const i = slot++; return slots[i] ??= { current: initial }; } },
  'expo-router': { router: { push: href => routes.push(href) } },
  './music-source-sheet': { MusicSourceSheet: 'Sheet' },
  './music-source-trigger': { MusicSourceTrigger: props => jsx('Pressable', { ...props, accessibilityLabel: '음악 소스 및 가져오기 메뉴' }) },
  './music-source-menu-content': { MusicSourceMenuContent: props => native.Platform.OS === 'ios' ? nativeMenu.MusicSourceMenuContent(props) : legacyMenu.MusicSourceMenuContent(props) },
  '@/stores/local-music': { useLocalMusicStore: () => local },
  '@/stores/google-drive': { useGoogleDriveStore: () => ({}) }, '@/stores/drive-documents': { useDriveDocumentsStore: () => ({}) },
  '@/stores/s3': { useS3Store: () => ({}) }, '@/stores/mybox': { useMyboxStore: () => ({}) },
  '@/stores/auth': { useAuthStore: select => select({ mode: authMode }) },
  '@/stores/offline-music': { useOfflineMusicStore: select => select({ busy: false }) },
  '@/services/music-source': read('src/services/music-source.ts', {}),
  '@/features/offline-music/download-status': { DownloadStatus: 'DownloadStatus' },
  '@/components/glass-controls': { glassControlStyles: { button: {} } },
  './use-music-sources': { useMusicSources: () => visibleSources },
}).LocalMusicControls;
const render = () => { slot = 0; return controls({}); };
const button = (tree, label) => nodes(tree).find(n => (n.type === 'NativeButton' && n.props.label === label) || (n.type === 'Pressable' && nodes(n).some(c => c.type === 'Text' && c.props.children === label)));
glass = { supported: true, enabled: true };
tree = render();
assert.equal(nodes(tree).find(n => n.type === 'Sheet').props.visible, false);
assert(!button(tree, 'NAS 로그인'), 'NAS login belongs in Synology settings, not the main library');
for (const mode of ['nas', 'mock']) {
  authMode = mode;
  assert(!button(render(), 'NAS 로그인'), 'The main screen has no login button in any auth mode');
}
authMode = 'setup';
tree = render(); nodes(tree).find(n => n.props?.accessibilityLabel === '음악 소스 및 가져오기 메뉴').props.onPress(); tree = render();
assert(nodes(tree).find(n => n.type === 'Sheet').props.glassSurface);
assert(nodes(tree).find(n => n.type === 'Sheet').props.visible);
assert.deepEqual(nodes(tree).filter(n => n.type === 'NativeText' && n.props.modifiers?.some(m => m.name === 'tag')).map(n => n.props.children), ['전체 음악', '이 기기 음악'], 'Unconnected source filters are hidden');
assert(button(tree, 'Google Drive 연결 관리'), 'Connection management remains available');
visibleSources = ['all', 'nas', 'local', 'drive', 's3', 'mybox']; tree = render();
assert.equal(nodes(tree).filter(n => n.type === 'NativeText' && n.props.modifiers?.some(m => m.name === 'tag')).length, 6, 'Connected source filters appear');
nodes(tree).find(n => n.type === 'NativePicker').props.onSelectionChange('local'); tree = render();
assert.deepEqual(sources, ['local']); assert.equal(nodes(tree).find(n => n.type === 'Sheet').props.visible, false);
button(tree, '파일 선택').props.onPress(); tree = render();
assert.deepEqual(imports, [], 'iOS file picker waits for native modal dismissal');
nodes(tree).find(n => n.type === 'Sheet').props.onDismiss(); assert.deepEqual(imports, ['files']);
button(tree, 'Google Drive 연결 관리').props.onPress(); tree = render();
assert.deepEqual(routes, [], 'Connection navigation waits for iOS sheet dismissal');
nodes(tree).find(n => n.type === 'Sheet').props.onDismiss();
assert.deepEqual(routes, ['/settings/cloud/google-drive']);
nodes(tree).find(n => n.type === 'Sheet').props.onDismiss();
assert.equal(routes.length, 1, 'A pending route is consumed exactly once');
assert.equal(imports.length, 1, 'Opening a connection cannot replay a completed import');
glass = { supported: false, enabled: false }; tree = render();
assert(nodes(tree).some(n => n.type === 'NativeSection' && n.props.title === '음악 보관함'), 'Older iOS uses standard grouped sections without requiring Liquid Glass');
native.Platform.OS = 'android'; tree = render(); button(tree, '기기의 음악 전체 가져오기').props.onPress();
assert(!button(tree, 'NAS 로그인'), 'Android retains its existing connection entry');
assert.deepEqual(imports, ['files', 'device'], 'Android imports retain immediate behavior');
button(tree, 'Google Drive 연결 관리').props.onPress();
assert.deepEqual(routes, ['/settings/cloud/google-drive', '/settings/cloud/google-drive'], 'Android connection navigation remains immediate');
glass = { supported: true, enabled: true };
const { PlaylistSheet } = read('src/features/playlists/dialogs.tsx', {
  ...shared, react: {},
  '@react-native-masked-view/masked-view': { __esModule: true, default: 'MaskedView' },
  'expo-linear-gradient': { LinearGradient: 'LinearGradient' },
  '@/components/scroll-edge-fade': {}, '@/components/text-input': {},
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ left: 0, right: 0, bottom: 34 }) },
  '@/services/playback/controller': {}, './rules': {}, '@/stores/playlists': {},
  '@/stores/hidden-music': {}, '@/features/hidden-music/rules': {},
});
native.Platform.OS = 'ios';
const sheetProps = { title: '음악 소스', children: jsx('Body', {}), onClose() {}, glassSurface: true };
tree = PlaylistSheet(sheetProps);
assert.equal(nodes(tree).filter(n => n.type === 'Glass').length, 0, 'iOS content sheets use ordinary opaque surfaces');
const background = tree => nodes(tree).find(n => n.props?.accessibilityViewIsModal).props.style[1].backgroundColor;
assert.equal(background(tree), colors.surface);
glass = { supported: true, enabled: false }; tree = PlaylistSheet(sheetProps);
assert.equal(nodes(tree).filter(n => n.type === 'Glass').length, 0); assert.equal(background(tree), colors.surface);
glass = { supported: false, enabled: false }; assert.equal(background(PlaylistSheet(sheetProps)), colors.surface);
console.log('PASS: native segmented tags/selection/visibility, theme, opaque fallback and Android isolation; source glass surface, source selection and iOS import-after-dismiss sequencing. Rendering is mocked.');
