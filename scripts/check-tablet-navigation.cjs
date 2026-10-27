/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
function read(file, modules = {}) {
  const exports = {}, code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'exports', code)(name => { assert(name in modules, name); return modules[name]; }, exports); return exports;
}
const jsx = (type, props) => ({ type, props });
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const flatten = style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
let dimensions = { width: 1280, height: 800, fontScale: 1 }, keyboard = false, canGoBack = true;
let glass = { supported: false, enabled: false, reduceTransparency: false };
const geometry = read('src/theme/layout.ts'), rules = read('src/features/settings/menu-layout.ts'), info = read('src/features/settings/tablet-tab-navigation.ts');
const preferences = rules.defaultMenuLayout(), calls = [];
const base = {
  '@/theme/liquid-glass': { useLiquidGlass: () => glass },
  '@/components/glass-backdrop': { GlassBackdrop: 'GlassBackdrop' },
  './glass-backdrop': { GlassBackdrop: 'GlassBackdrop' },
  '@/components/native-tab-frame': { NativeTabFrame: 'NativeTabFrame' },
  'react/jsx-runtime': { jsx, jsxs: jsx }, react: { useRef: initial => ({ current: initial }) },
  'react-native': { View: 'View', ScrollView: 'Scroll', Pressable: 'Button', StyleSheet: { create: value => value, hairlineWidth: 1, absoluteFill: {} }, useWindowDimensions: () => dimensions },
  '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Icon' }, './text': { Text: 'Text' }, '@/components/text': { Text: 'Text' },
  '@/theme/tokens': { useColors: () => ({ tint: '#FF5C80', text: '#FFFFFF', muted: '#999999', surface: '#222222' }), useAppColorScheme: () => 'dark' },
  '@/theme/layout': geometry, '@/services/haptics': { playHaptic() {} },
  '@/components/content-title-bar': { ContentTitleBar: 'ContentTitleBar' },
  '@/components/content-transition': { ContentTransition: 'ContentTransition' },
  'expo-router': { router: { canGoBack: () => canGoBack, back: () => calls.push('back'), navigate: href => calls.push(href) }, Tabs: { Screen: 'Tab' }, Stack: { Screen: 'StackScreen' } },
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 20, left: 0, right: 0 }) },
  '@/stores/menu-preferences': { useMenuPreferences: select => select({ layout: preferences }) },
  '@/features/settings/menu-layout': rules,
};
const { SidebarHeader } = read('src/components/sidebar-header.tsx', base);
let tree = SidebarHeader();
assert.equal(tree.props.children.type, 'Button', 'The sidebar retains its back button');
assert(!nodes(tree).some(node => node.type === 'Text'), 'The sidebar has no duplicate title');
tree.props.children.props.onPress(); assert.equal(calls.at(-1), 'back');
canGoBack = false; tree.props.children.props.onPress(); assert.equal(calls.at(-1), '/(tabs)/(library)');
const sidebarModule = read('src/components/tablet-sidebar.tsx', { ...base, './sidebar-header': { SidebarHeader: 'SidebarHeader' }, './settings-button': { SettingsButton: 'SettingsButton' } });
preferences.bottom = [{ id: 'search', visible: true }, { id: 'library', visible: true }, { id: 'playlists', visible: false }];
tree = sidebarModule.SidebarAppNavigation({ active: 'library' });
assert.deepEqual(nodes(tree).filter(node => node.type === 'Button').map(node => nodes(node).find(child => child.type === 'Text').props.children), ['검색', '보관함']);
nodes(tree).find(node => node.type === 'Button').props.onPress(); assert.equal(calls.at(-1), '/(tabs)/search');
assert(nodes(tree).some(node => node.type === 'SettingsButton' && node.props.label), 'The settings action remains accessible in the sidebar');
tree = sidebarModule.SidebarAppNavigation({ active: 'library', showSettings: false });
assert(!nodes(tree).some(node => node.type === 'SettingsButton'), 'The library sidebar does not duplicate the title bar action');
preferences.bottom = rules.defaultMenuLayout().bottom;
const { default: TabsLayout } = read('src/components/legacy-tabs.tsx', { ...base,
  'expo-blur': { BlurTargetView: 'BlurTarget', BlurView: 'Blur' },
  'react-native-keyboard-controller': { useKeyboardState: select => select({ isVisible: keyboard }) },
  '@/components/mini-player': { MiniPlayer: 'MiniPlayer', MINI_PLAYER_INSET: 8 },
  '@/components/tab-bar-inset': { TAB_BAR_HEIGHT: 66, TabBarInsetContext: { Provider: 'Inset' } },
  '@/components/screen-blur-target': { ScreenBlurTargetContext: { Provider: 'Target' } },
  '@/features/settings/tab-menu-selection': { TabMenuSelection: 'Selection' },
  '@/stores/blur-preferences': { useBlurIntensity: () => 75 },
  '@/components/tablet-sidebar': { TabletSidebar: 'TabletSidebar' },
  '@/features/settings/tablet-tab-navigation': info,
});
let tabs = TabsLayout();
assert.equal(tabs.props.screenOptions({ route: { name: 'search' } }).tabBarStyle.display, 'none');
assert.equal(tabs.props.screenOptions({ route: { name: 'search' } }).tabBarBackground(), null, 'A hidden tablet bar does not render blur');
const content = tabs.props.screenLayout({ children: 'child', route: { name: 'search' } });
assert.equal(nodes(content).find(node => node.type === 'Inset').props.value, 20, 'Hidden tab bars leave no reserved bar height');
const layout = route => tabs.props.layout({ children: content, state: { index: 0, routes: [route] } });
for (const [route, title] of [[{ name: 'search' }, '검색'], [{ name: '(playlists)' }, '플레이리스트'], [{ name: '(library)', state: { index: 1, routes: [{ name: 'index' }, { name: 'album/[id]' }] } }, '앨범'], [{ name: '(library)', state: { routes: [{ name: 'artist/[id]' }] } }, '아티스트']]) {
  tree = layout(route);
  assert.equal(nodes(tree).find(node => node.type === 'TabletSidebar').props.title, undefined);
  const pane = tree.props.children[2];
  assert.equal(pane.type, 'ContentTransition');
  assert.equal(pane.props.enabled, true);
  assert.equal(pane.props.children[0].type, 'ContentTitleBar');
  assert.equal(pane.props.children[0].props.title, title);
  assert(!nodes(pane).some(node => node.type === 'TabletSidebar'), 'The restored title bar starts after the sidebar');
  const mini = nodes(tree).find(node => node.type === 'MiniPlayer');
  const dock = nodes(tree).find(node => node.props?.children === mini);
  assert.equal(flatten(dock.props.style).bottom, 28);
}
assert(!nodes(layout({ name: '(library)' })).some(node => node.type === 'TabletSidebar'), 'The library home owns its sidebar and tools');
keyboard = true; tabs = TabsLayout(); assert(!nodes(layout({ name: 'search' })).some(node => node.type === 'MiniPlayer'));
keyboard = false; dimensions = { width: 390, height: 844, fontScale: 1 }; tabs = TabsLayout();
assert.notEqual(tabs.props.screenOptions({ route: { name: 'search' } }).tabBarStyle.display, 'none');
assert(!nodes(layout({ name: 'search' })).some(node => node.type === 'TabletSidebar'));
assert(!nodes(layout({ name: 'search' })).some(node => node.type === 'ContentTitleBar'), 'Phone headers are unchanged');
assert.equal(tabs.props.tabBar, undefined, 'The legacy layout retains the platform default tab bar');
for (const file of ['src/app/(tabs)/(library)/_layout.tsx', 'src/app/(tabs)/(playlists)/_layout.tsx']) {
  const Screen = read(file, base).default;
  assert.equal(Screen().props.screenOptions.headerShown, true);
  assert.equal(Screen().props.screenOptions.animation, 'slide_from_right');
  dimensions = { width: 1280, height: 800, fontScale: 1 }; assert.equal(Screen().props.screenOptions.headerShown, false);
  assert.equal(Screen().props.screenOptions.animation, 'none', 'Native transitions must not animate the tablet sidebar');
  assert.equal(Screen().props.screenOptions.gestureEnabled, false, 'Native back gestures must not drag the whole tablet screen');
  dimensions = { width: 390, height: 844, fontScale: 1 };
}
// Exercise focus/route changes without remounting the routed child or running background animations.
let focused = true, reducedMotion = false, effectDeps, cleanup;
const animations = [], cancellations = [];
const opacity = { value: 1, get() { return this.value; }, set(value) { this.value = value; } };
const { ContentTransition } = read('src/components/content-transition.tsx', { ...base,
  react: { useEffect: (effect, deps) => {
    if (!effectDeps || deps.some((value, index) => value !== effectDeps[index])) {
      cleanup?.(); effectDeps = deps; cleanup = effect();
    }
  } },
  'expo-router': { useIsFocused: () => focused },
  'react-native-reanimated': { __esModule: true, default: { View: 'AnimatedPane' },
    useReducedMotion: () => reducedMotion, useSharedValue: () => opacity, useAnimatedStyle: fn => fn(),
    cancelAnimation: value => cancellations.push(value), withTiming: target => { animations.push(target); return target; },
  },
});
const statefulChild = { type: 'StatefulContent', props: {} };
const transition = (enabled = true, transitionKey = 'album-1') => ContentTransition({ enabled, transitionKey, children: statefulChild });
assert.equal(transition().props.children, statefulChild);
assert.equal(animations.length, 1);
transition(); assert.equal(animations.length, 1, 'Ordinary renders do not restart the transition');
assert.equal(transition(true, 'album-2').props.children, statefulChild);
assert.equal(animations.length, 2, 'A second album gets a transition without changing the routed child slot');
focused = false; transition(); assert.equal(animations.length, 2, 'Background screens do not animate');
assert.equal(opacity.get(), 1);
focused = true; transition(); assert.equal(animations.length, 3, 'Returning to the content animates again');
transition(false); assert.equal(animations.length, 3, 'Phone screens use only the native transition');
reducedMotion = true; transition(); assert.equal(animations.length, 3, 'Reduced motion skips the content transition');
assert.equal(opacity.get(), 1); assert(cancellations.length > 0);
glass = { supported: true, enabled: true, reduceTransparency: false };
reducedMotion = false; transition(true, 'glass'); opacity.value = 0;
const glassPaneStyle = flatten(transition(true, 'glass').props.style);
assert.equal(glassPaneStyle.opacity, undefined, 'Modern iPad panes must never fade a native glass ancestor to zero');
assert.equal(glassPaneStyle.transform[0].translateY, 8, 'Glass panes use a small movement transition instead');
console.log('PASS: content-only tablet transitions, cancellation on route/focus changes, reduced motion, retained children, hidden horizontal bars, sidebar back/fallback, custom menus, detail navigation, mini-player insets and phone restoration. Native rendering is mocked.');
