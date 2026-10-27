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
glass = { supported: true, enabled: false }; assert.equal(LibrarySegments(props), fallback);
glass = { supported: false, enabled: false }; assert.equal(LibrarySegments(props), fallback);
assert.equal(read('src/features/library/library-segments.tsx', {}).LibrarySegments(props), fallback, 'Android/web import no native SwiftUI');

let slot = 0; const slots = [], imports = [], sources = [];
const local = { source: 'all', songs: [], importFiles: kind => imports.push(kind), setSource: source => sources.push(source), load() {} };
const controls = read('src/features/library/local-music-controls.tsx', {
  ...shared,
  react: { useState: initial => { const i = slot++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = value; }]; } },
  'expo-router': { router: { push() {} } },
  '@/features/playlists/dialogs': { PlaylistSheet: 'Sheet' },
  '@/stores/local-music': { useLocalMusicStore: () => local },
  '@/stores/google-drive': { useGoogleDriveStore: () => ({}) }, '@/stores/drive-documents': { useDriveDocumentsStore: () => ({}) },
  '@/stores/s3': { useS3Store: () => ({}) }, '@/stores/mybox': { useMyboxStore: () => ({}) },
  '@/stores/auth': { useAuthStore: select => select({ mode: 'setup' }) },
  '@/stores/offline-music': { useOfflineMusicStore: select => select({ busy: false }) },
  '@/services/music-source': { musicSourceLabels: { all: '전체 음악', nas: 'NAS', local: '기기', drive: 'Drive', s3: 'S3', mybox: 'MYBOX' } },
  '@/features/offline-music/download-status': { DownloadStatus: 'DownloadStatus' },
  '@/components/glass-controls': { glassControlStyles: { button: {} } },
}).LocalMusicControls;
const render = () => { slot = 0; return controls({}); };
const button = (tree, label) => nodes(tree).find(n => n.type === 'Pressable' && nodes(n).some(c => c.type === 'Text' && c.props.children === label));
glass = { supported: true, enabled: true };
tree = render(); nodes(tree).find(n => n.props?.accessibilityLabel === '음악 소스 및 가져오기 메뉴').props.onPress(); tree = render();
assert(nodes(tree).find(n => n.type === 'Sheet').props.glassSurface);
assert(nodes(tree).find(n => n.type === 'Sheet').props.visible);
button(tree, '기기').props.onPress(); tree = render();
assert.deepEqual(sources, ['local']); assert.equal(nodes(tree).find(n => n.type === 'Sheet').props.visible, false);
button(tree, '파일 선택').props.onPress(); tree = render();
assert.deepEqual(imports, [], 'iOS file picker waits for native modal dismissal');
nodes(tree).find(n => n.type === 'Sheet').props.onDismiss(); assert.deepEqual(imports, ['files']);
native.Platform.OS = 'android'; tree = render(); button(tree, '기기의 음악 전체 가져오기').props.onPress();
assert.deepEqual(imports, ['files', 'device'], 'Android imports retain immediate behavior');
const { PlaylistSheet } = read('src/features/playlists/dialogs.tsx', {
  ...shared, react: {},
  '@react-native-masked-view/masked-view': { __esModule: true, default: 'MaskedView' },
  'expo-linear-gradient': { LinearGradient: 'LinearGradient' },
  '@/components/scroll-edge-fade': {}, '@/components/text-input': {},
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ left: 0, right: 0, bottom: 34 }) },
  '@/services/playback/controller': {}, './rules': {}, '@/stores/playlists': {},
  '@/stores/hidden-music': {}, '@/features/hidden-music/rules': {},
});
const sheetProps = { title: '음악 소스', children: jsx('Body', {}), onClose() {}, glassSurface: true };
tree = PlaylistSheet(sheetProps);
assert.equal(nodes(tree).filter(n => n.type === 'Glass').length, 1, 'Source sheet uses one glass surface without stacking glass buttons');
const background = tree => nodes(tree).find(n => n.props?.accessibilityViewIsModal).props.style[1].backgroundColor;
assert.equal(background(tree), 'transparent');
glass = { supported: true, enabled: false }; tree = PlaylistSheet(sheetProps);
assert.equal(nodes(tree).filter(n => n.type === 'Glass').length, 0); assert.equal(background(tree), colors.surface);
glass = { supported: false, enabled: false }; assert.equal(background(PlaylistSheet(sheetProps)), colors.surface);
console.log('PASS: native segmented tags/selection/visibility, theme, opaque fallback and Android isolation; source glass surface, source selection and iOS import-after-dismiss sequencing. Rendering is mocked.');
