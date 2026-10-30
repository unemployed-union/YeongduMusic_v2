/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const root = path.join(__dirname, '..');
function read(file, modules = {}) {
  modules = { './ios-system-settings': { isIosSystemSettingsAvailable: false }, ...modules };
  const exports = {}, code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'exports', code)(name => { assert(name in modules, name); return modules[name]; }, exports);
  return exports;
}
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const jsx = (type, props, key) => ({ type, props, key });
const geometry = read('src/theme/layout.ts'), navigation = read('src/features/settings/settings-navigation.ts');
let dimensions = { width: 1280, height: 800, fontScale: 1 }, extras = false;
const calls = [], colors = { background: '#111111', surface: '#222222', text: '#FFFFFF', muted: '#999999', tint: '#FF5C80', separator: '#333333', rowPressed: '#FFFFFF0A', rowSelected: '#FFFFFF14' };
const base = {
  './settings-menu-layout': { settingsMenuStyles: { row: {}, icon: {} }, useSettingsMenuIconStyle: () => ({}) },
  '@/theme/liquid-glass': { useLiquidGlass: () => ({ supported: false, enabled: false, reduceTransparency: false }) },
  '@/components/glass-controls': { glassControlStyles: { button: {}, segments: {}, segment: {} } },
  '@/features/library/library-segments': { LibrarySegments: 'LibrarySegments' },
  '@/components/glass-backdrop': { GlassBackdrop: 'GlassBackdrop' },
  'react/jsx-runtime': { jsx, jsxs: jsx }, '@/theme/layout': geometry,
  'react-native': { View: 'View', Pressable: 'Button', ScrollView: 'Scroll', StyleSheet: { create: value => value, hairlineWidth: 1 }, useWindowDimensions: () => dimensions },
  '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Icon' }, '@/components/text': { Text: 'Text' },
  '@/theme/tokens': { useColors: () => colors }, '@/services/haptics': { playHaptic() {} },
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ left: 0, right: 0, bottom: 20, top: 24 }) },
  'expo-router': { router: { navigate: href => calls.push(href) }, useIsFocused: () => true },
  '@/components/sidebar-header': { SidebarHeader: 'SidebarHeader' },
  '@/components/content-title-bar': { ContentTitleBar: 'ContentTitleBar' },
  '@/components/content-transition': { ContentTransition: 'ContentTransition' },
  '@/components/tablet-sidebar': { TabletSidebar: 'TabletSidebar', SidebarAppNavigation: 'SidebarAppNavigation' },
};
for (const [width, height, expanded] of [[390, 844, false], [540, 900, false], [768, 1024, true], [1280, 800, true], [844, 390, false]]) {
  const result = geometry.workspaceLayout(width, height);
  assert.equal(result.expanded, expanded);
  assert.equal(result.sidebarWidth + result.contentWidth, width);
  if (expanded) assert(result.contentWidth >= 480);
}
assert.equal(geometry.workspaceLayout(900, 800, 2).expanded, false, 'Large text gets the full reading width');
assert.equal(navigation.selectedSettingsPath('settings/cloud/google-drive'), 'settings/cloud');
assert.equal(navigation.selectedSettingsPath('settings/colors'), 'settings/playback');
assert.equal(navigation.selectedSettingsPath('settings/player-menu'), 'settings/playback');
assert.equal(navigation.selectedSettingsPath('settings/quick-hide-preset'), 'settings/other');
const { SettingsWorkspace } = read('src/features/settings/settings-workspace.tsx', { ...base,
  './settings-navigation': navigation, '@/stores/hidden-feature-access': { useHiddenFeatureAccess: select => select({ ready: true, enabled: extras }) },
});
const content = { type: 'StatefulSettings', props: {} };
const renderWorkspace = routeName => SettingsWorkspace({ routeName, children: content });
let tree = renderWorkspace('settings/colors');
assert.equal(nodes(tree).find(node => node.type === 'SidebarAppNavigation').props.showSettings, false, 'Settings do not link to themselves from the sidebar');
assert.equal(tree.props.children[1].type, 'ContentTransition');
assert.equal(tree.props.children[1].props.enabled, true);
assert(!nodes(tree.props.children[1]).some(node => node.type === 'SidebarAppNavigation'), 'The settings sidebar is outside the transition');
assert.equal(tree.props.children[1].props.children[1], content, 'The detail screen keeps a fixed child position');
assert.equal(tree.props.children[1].props.children[0].props.title, '색상 설정');
assert.equal(tree.props.children[1].props.children[0].props.maxWidth, 840, 'Settings detail titles follow the content width');
assert.equal(renderWorkspace('settings').props.children[1].props.children[0].props.maxWidth, 1160, 'Settings overview titles follow the wider card layout');
assert.equal(renderWorkspace('settings/licenses').props.children[1].props.children[0].props.maxWidth, undefined, 'Uncapped settings screens retain matching title margins');
assert(!nodes(tree.props.children[0]).some(node => node.type === 'ContentTitleBar'), 'The title bar belongs only to the content pane');
assert.equal(nodes(tree).filter(node => node.type === 'Scroll').length, 1);
let buttons = nodes(tree).filter(node => node.type === 'Button');
assert(!buttons.some(node => nodes(node).some(child => child.props?.children === '기타')));
const playback = buttons.find(node => nodes(node).some(child => child.props?.children === '재생 및 화면'));
assert.equal(playback.props.accessibilityState.selected, true); playback.props.onPress(); assert.equal(calls.at(-1), '/settings/playback');
calls.length = 0; tree = renderWorkspace('settings/playback');
nodes(tree).find(node => node.type === 'Button' && node.props.accessibilityState.selected).props.onPress(); assert.equal(calls.length, 0, 'Selecting the current route does not add history entries');
extras = true; tree = renderWorkspace('settings/other'); assert(nodes(tree).some(node => node.type === 'Button' && nodes(node).some(child => child.props?.children === '기타')));
dimensions = { ...dimensions, width: 540 }; tree = renderWorkspace('settings/colors');
assert.equal(nodes(tree).filter(node => node.type === 'Scroll').length, 0);
assert.equal(tree.props.children[1].props.children[1], content, 'Resizing preserves the settings subtree');
assert(!nodes(tree).some(node => node.type === 'ContentTitleBar'), 'Phone settings retain their native header');
assert.equal(tree.props.children[1].props.enabled, false, 'Phone screens retain their native transition');

const childrenApi = { toArray: value => [value].flat(Infinity).filter(Boolean) };
const { SettingsPage } = read('src/features/settings/settings-ui.tsx', { ...base, react: { Children: childrenApi },
  './settings-menu-layout': { useSettingsMenuIconStyle: () => ({}), settingsMenuStyles: {} }, 'react-native-keyboard-controller': { KeyboardAwareScrollView: 'KeyboardScroll' }, '@/components/scroll-edge-fade': { ScrollEdgeFade: 'Fade' },
});
const sections = [1, 2, 3, 4].map(id => ({ type: 'Section', props: { id } }));
dimensions = { ...dimensions, width: 1280 };
tree = SettingsPage({ overview: true, children: sections });
let cards = nodes(tree).find(node => node.type === 'View' && node.props.style?.flexWrap === 'wrap');
assert.equal(cards.props.children.length, 4); assert.equal(cards.props.children[0].props.style.width, (1032 - 68) / 2);
dimensions = { ...dimensions, width: 768, height: 1024 };
tree = SettingsPage({ overview: true, children: sections });
assert(!nodes(tree).some(node => node.props?.style?.flexWrap === 'wrap'), 'Narrower detail panes use one column');
assert.deepEqual(nodes(tree).filter(node => node.type === 'Section').map(node => node.props.id), [1, 2, 3, 4]);

const sourceLabels = read('src/services/music-source.ts').musicSourceLabels, menuRules = read('src/features/settings/menu-layout.ts');
let source = 'nas', selectedTab;
let visibleSources = ['all', 'nas', 'local'];
const { LibrarySidebar } = read('src/features/library/library-sidebar.tsx', { ...base,
  '@/services/music-source': { musicSourceLabels: sourceLabels }, '@/features/settings/menu-layout': menuRules,
  '@/stores/local-music': { useLocalMusicStore: select => select({ source, setSource: value => { source = value; } }) },
  './use-music-sources': { useMusicSources: () => visibleSources },
});
const sidebarProps = { tabs: ['artists', 'songs', 'favorites'], selected: 'songs', width: 248, onSelect: value => { selectedTab = value; } };
tree = LibrarySidebar(sidebarProps);
assert.equal(tree.props.showSettings, false, 'The library settings action moves to the title bar');
assert.deepEqual(nodes(tree).filter(node => node.props?.accessibilityRole === 'tab').map(node => nodes(node).find(child => child.type === 'Text').props.children), ['아티스트', '노래', '좋아요']);
assert.deepEqual(nodes(tree).filter(node => node.props?.accessibilityRole === 'button').map(node => nodes(node).find(child => child.type === 'Text').props.children), ['전체 음악', 'NAS 음악', '이 기기 음악'], 'The tablet hides unconnected sources');
visibleSources = ['all', 'nas', 'local', 'drive']; tree = LibrarySidebar(sidebarProps);
nodes(tree).find(node => node.type === 'Button' && nodes(node).some(child => child.props?.children === 'Google Drive')).props.onPress(); assert.equal(source, 'drive');
nodes(tree).find(node => node.props?.accessibilityRole === 'tab').props.onPress(); assert.equal(selectedTab, 'artists');
tree = LibrarySidebar({ ...sidebarProps, selected: 'favorites' });
assert.equal(nodes(tree).filter(node => node.props?.accessibilityRole === 'button').length, 0, 'Favorites do not pretend to follow source filters');

const slots = []; let cursor = 0;
const hooks = { useMemo: fn => fn(), useEffect() {}, useCallback: fn => fn, useRef: initial => slots[cursor++] ??= { current: initial }, useState: initial => {
  const index = cursor++; if (!(index in slots)) slots[index] = initial;
  return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
} };
const enabledQueries = {}, preferences = menuRules.defaultMenuLayout();
const leafNames = { '@/components/screen-header': 'ScreenHeader', '@/components/settings-button': 'SettingsButton', '@/features/library/library-sidebar': 'LibrarySidebar', '@/features/library/library-pager': 'LibraryPager', '@/features/library/library-page': 'LibraryPage', '@/features/library/local-music-controls': 'LocalMusicControls', '@/features/library/library-sort-control': 'LibrarySortControl', '@/features/favorites/liked-songs-screen': 'LikedSongsScreen' };
const modules = Object.fromEntries(Object.entries(leafNames).map(([name, component]) => [name, { [component]: component }]));
const Screen = read('src/app/(tabs)/(library)/index.tsx', { ...base, ...modules, react: hooks,
  'react-native-reanimated': { __esModule: true, default: { View: 'AnimatedView' } },
  '@/features/library/use-library-controls': { useLibraryControls: () => ({ selectPage() {} }) },
  '@/features/library/use-refresh-library': { useRefreshLibrary: () => ({ refreshing: false }) },
  '@/stores/menu-preferences': { useMenuPreferences: select => select({ layout: preferences }) },
  '@/features/settings/menu-layout': menuRules,
  '@/features/library/queries': Object.fromEntries(['Albums', 'Songs', 'Artists'].map(name => ['use' + name, enabled => { enabledQueries[name] = enabled; return {}; }])),
}).default;
const renderLibrary = () => { cursor = 0; return Screen(); };
dimensions = { width: 1280, height: 800, fontScale: 1 }; tree = renderLibrary();
let pager = nodes(tree).find(node => node.type === 'LibraryPager'); assert.equal(pager.props.width, 984);
assert(pager.props.children.every(page => page.props.width === 984 && page.props.spacious));
nodes(tree).find(node => node.type === 'LibrarySidebar').props.onSelect('songs'); tree = renderLibrary();
assert.deepEqual(enabledQueries, { Albums: false, Songs: true, Artists: false });
assert(!nodes(tree).some(node => node.type === 'ScreenHeader'), 'The phone header stays hidden on tablets');
const libraryRow = tree.props.children[1], libraryTransition = libraryRow.props.children[1], libraryPane = libraryTransition.props.children;
assert.equal(libraryTransition.type, 'ContentTransition');
assert.equal(libraryTransition.props.enabled, true);
assert.equal(libraryPane.props.style.width, 984);
assert.equal(libraryPane.props.style.alignSelf, 'center');
assert.equal(libraryPane.props.children[0].type, 'ContentTitleBar');
assert.equal(libraryPane.props.children[0].props.title, '보관함');
assert.equal(libraryPane.props.children[0].props.action.type, 'SettingsButton');
assert.equal(libraryPane.props.children[1].type, 'LocalMusicControls', 'Import, connections and sort appear immediately below the title');
assert.equal(libraryPane.props.children[1].props.menuLabel, '가져오기·연결');
assert(!nodes(libraryPane).some(node => node.type === 'LibrarySidebar'), 'Library title bars do not span the sidebar');
assert(!nodes(tree).some(node => node.type === 'AnimatedView'), 'Horizontal library tabs are unmounted on tablets');
const sort = nodes(tree).find(node => node.type === 'LocalMusicControls').props.sortControl;
sort.props.onChange('descending');

dimensions = { width: 1920, height: 1080, fontScale: 1 }; tree = renderLibrary();
assert.equal(nodes(tree).find(node => node.type === 'LibraryPager').props.width, 1112, 'Wide tablets cap and center the library instead of stretching cards edge to edge');
dimensions = { width: 540, height: 900, fontScale: 1 }; tree = renderLibrary();
pager = nodes(tree).find(node => node.type === 'LibraryPager'); assert.equal(pager.props.width, 540);
assert(pager.props.children.every(page => !page.props.spacious));
assert(!nodes(tree).some(node => node.type === 'LibrarySidebar'));
assert.equal(pager.props.children.find(page => page.props.tab === 'songs').props.active, true);
assert.equal(nodes(tree).find(node => node.type === 'LocalMusicControls').props.sortControl.props.order, 'descending');
console.log('PASS: responsive library/settings sidebars, pane widths, source filters, favorite scope, hidden menu protection, nested route selection, card columns and selection/sort retention across resizing. Native rendering is mocked.');
