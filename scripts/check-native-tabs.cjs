/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
function read(file, modules = {}) {
  const exports = {}, code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'exports', code)(name => { assert(name in modules, name); return modules[name]; }, exports);
  return exports;
}
const jsx = (type, props) => ({ type, props });
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const flatten = style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
const runtime = { 'react/jsx-runtime': { jsx, jsxs: jsx } };
const fallback = read('src/components/platform-tabs.tsx', runtime);
assert.equal(fallback.PlatformTabs({ fallback: 'Legacy' }).type, 'Legacy', 'Android/web never load native tabs');
assert.equal(read('src/components/native-tab-frame.tsx').NativeTabFrame({ children: 'legacy-content' }), 'legacy-content');
const rules = read('src/features/settings/menu-layout.ts'), geometry = read('src/theme/layout.ts');
const info = read('src/features/settings/tablet-tab-navigation.ts');
let glass = { supported: false, enabled: false, reduceTransparency: false }, keyboard = false;
let dimensions = { width: 390, height: 844, fontScale: 1 }, segments = ['(tabs)', '(library)'];
let bottom = rules.defaultMenuLayout().bottom, nativeEnabled = true, insets = { top: 62, bottom: 84, left: 0, right: 0 };
let focused = true, displayedBottom, hasSong = false;
const NativeTabs = { Trigger: { Icon: 'Symbol', Label: 'Label' }, BottomAccessory: 'Accessory' }, events = [];
const base = { ...runtime,
  'react-native': { View: 'View', StyleSheet: { create: value => value }, useWindowDimensions: () => dimensions },
  'react-native-keyboard-controller': { useKeyboardState: select => select({ isVisible: keyboard }) },
  '@/theme/liquid-glass': { useLiquidGlass: () => glass }, '@/theme/tokens': { useColors: () => ({ tint: '#FF5C80', muted: '#999999', surface: '#222222', background: '#111111' }) },
  '@/theme/layout': geometry, '@/features/settings/menu-layout': rules,
  '@/stores/menu-preferences': { useMenuPreferences: select => select({ layout: { bottom } }) },
  '@/services/haptics': { playHaptic: value => events.push(value) },
  '@/stores/playback': { usePlaybackStore: select => select({ queue: hasSong ? [{ id: 'restored' }] : [], index: 0 }) },
  './mini-player': { MiniPlayer: 'MiniPlayer', MINI_PLAYER_INSET: 8 },
  './native-tabs-context': { NativeTabsEnabledContext: { Provider: 'NativeProvider' } },
};
const { PlatformTabs, SystemTabs } = read('src/components/platform-tabs.ios.tsx', { ...base,
  react: { useRef: current => ({ current }), useState: initial => { displayedBottom ??= initial; return [displayedBottom, next => { displayedBottom = next; }]; } },
  'expo-router': { Redirect: 'Redirect', useSegments: () => segments, useIsFocused: () => focused }, 'expo-router/unstable-native-tabs': { NativeTabs },
});
assert.equal(PlatformTabs({ fallback: 'Legacy' }).type, 'Legacy', 'iOS 18/unsupported builds keep their original navigator');
glass = { supported: true, enabled: true, reduceTransparency: false };
assert.equal(PlatformTabs({ fallback: 'Legacy' }).type, SystemTabs);
let tree = SystemTabs(), tabs = nodes(tree).find(node => node.type === NativeTabs);
assert(tabs, 'Modern iOS uses the real UIKit tab controller, including its draggable liquid selection lens');
assert.equal(tabs.props.backgroundColor, undefined); assert.equal(tabs.props.blurEffect, undefined);
assert.equal(tabs.props.indicatorColor, undefined, 'Do not paint over UIKit selection effects');
assert.equal(tabs.props.minimizeBehavior, 'never', 'Keep the existing persistent mini-player layout stable');
assert.equal(tabs.props.hidden, false);
assert(!nodes(tree).some(node => node.type === 'Accessory'), 'No empty accessory before queue hydration');
hasSong = true;
tree = SystemTabs();
assert.equal(nodes(tree).filter(node => node.type === 'Accessory').length, 1, 'Restoring a queue attaches one UIKit-owned accessory');
assert.equal(nodes(tree).find(node => node.type === 'MiniPlayer').props.embedded, true, 'UIKit supplies the background and placement; no second floating glass shell');
const triggers = value => nodes(value).filter(node => node.type === NativeTabs.Trigger);
assert.deepEqual(triggers(tree).map(node => node.props.name), ['(library)', '(playlists)', 'search']);
assert(triggers(tree).every(node => node.props.disableAutomaticContentInsets), 'Existing list and safe-area handling stays explicit');
tabs.props.screenListeners.tabPress(); assert.equal(events.at(-1), 'selection');
focused = false; segments = ['settings', 'bottom-menu'];
bottom = bottom.map(item => item.id === 'library' ? { ...item, visible: false } : item);
assert.equal(triggers(SystemTabs()).find(node => node.props.name === '(library)').props.hidden, false, 'Defer hiding the selected native tab while Settings is open');
focused = true; segments = ['(tabs)', '(library)'];
assert.equal(SystemTabs().type, 'Redirect', 'Resolve the hidden selection before applying native menu changes');
segments = ['(tabs)', 'search'];
bottom = [{ id: 'playlists', visible: false }, { id: 'search', visible: true }, { id: 'library', visible: true }];
tree = SystemTabs();
assert.deepEqual(triggers(tree).map(node => node.props.name), ['search', '(library)', '(playlists)']);
assert.equal(triggers(tree)[2].props.hidden, true);
segments = ['(tabs)', '(playlists)', 'playlists']; tree = SystemTabs();
assert.equal(tree.type, 'Redirect'); assert.equal(tree.props.href, '/(tabs)/search', 'Hiding the selected native tab resolves to the first visible tab');
segments = ['(tabs)', 'search']; keyboard = true;
assert.equal(nodes(SystemTabs()).find(node => node.type === NativeTabs).props.hidden, true);
assert(!nodes(SystemTabs()).some(node => node.type === 'Accessory'), 'Keyboard hides the accessory too');
keyboard = false; dimensions = { width: 1280, height: 800, fontScale: 1 };
assert.equal(nodes(SystemTabs()).find(node => node.type === NativeTabs).props.hidden, true, 'Expanded iPad layouts retain their sidebar');
assert(!nodes(SystemTabs()).some(node => node.type === 'Accessory'), 'Tablet frame owns the mini-player when tabs are hidden');
glass = { supported: true, enabled: false, reduceTransparency: true };
assert.equal(nodes(SystemTabs()).find(node => node.type === NativeTabs).props.backgroundColor, '#222222');
assert.equal(nodes(SystemTabs()).find(node => node.type === NativeTabs).props.blurEffect, 'none');

const { NativeTabFrame } = read('src/components/native-tab-frame.ios.tsx', { ...base,
  react: { useContext: () => nativeEnabled, useRef: value => ({ current: value }) },
  'expo-blur': { BlurTargetView: 'Target' }, 'react-native-safe-area-context': { useSafeAreaInsets: () => insets },
  './screen-blur-target': { ScreenBlurTargetContext: { Provider: 'TargetProvider' } },
  './tab-bar-inset': { TabBarInsetContext: { Provider: 'Inset' } }, './mini-player': { MiniPlayer: 'MiniPlayer', MINI_PLAYER_INSET: 8 },
  './content-title-bar': { ContentTitleBar: 'Title' }, './content-transition': { ContentTransition: 'Transition' }, './tablet-sidebar': { TabletSidebar: 'Sidebar' },
  '@/features/settings/tablet-tab-navigation': info,
});
const props = { active: 'library', detail: { name: 'album/[id]', key: 'album-1' }, children: 'child' };
nativeEnabled = false; assert.equal(NativeTabFrame(props), 'child', 'The legacy navigator does not receive a second sidebar or mini player');
nativeEnabled = true;
const frame = options => { const element = NativeTabFrame(options); return element.type(element.props); };
tree = frame(props);
assert(nodes(tree).some(node => node.type === 'Sidebar'));
assert.equal(nodes(tree).find(node => node.type === 'Title').props.title, '앨범');
assert.equal(nodes(tree).find(node => node.type === 'Inset').props.value, 84, 'Use UIKit measured safe areas rather than a guessed floating-bar height');
const mini = nodes(tree).find(node => node.type === 'MiniPlayer');
assert.equal(flatten(nodes(tree).find(node => node.props.children === mini).props.style).bottom, 92);
assert.equal(mini.props.blurTarget, nodes(tree).find(node => node.type === 'Target').props.ref);
assert(!nodes(frame({ ...props, detail: { name: 'index' } })).some(node => node.type === 'Sidebar'), 'Library home owns its existing sidebar');
dimensions = { width: 390, height: 844, fontScale: 1 };
assert(!nodes(frame(props)).some(node => node.type === 'Sidebar'));
for (const bottom of [0, 34, 84, 150]) {
  insets = { ...insets, bottom };
  assert(!nodes(frame(props)).some(node => node.type === 'MiniPlayer'), 'Phone content must never overlay a mini-player, including before UIKit measures the tab bar');
  assert.equal(nodes(SystemTabs()).filter(node => node.type === 'Accessory').length, 1, 'The accessory survives safe-area updates and cold-start queue restoration');
}
keyboard = true; tree = frame(props);
assert(!nodes(tree).some(node => node.type === 'MiniPlayer')); assert.equal(nodes(tree).find(node => node.type === 'Inset').props.value, 0);
console.log('PASS: real native-tab selection, platform fallback, SF Symbols, visibility/order/hidden-route recovery, UIKit safe areas, mini-player targets, keyboard hiding and iPad sidebars. UIKit motion must also be verified on iOS.');
