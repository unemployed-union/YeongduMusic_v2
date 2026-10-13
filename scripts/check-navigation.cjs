/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));
const requireContext = require(path.join(root, 'node_modules/expo-router/build/testing-library/require-context-ponyfill.js')).default;
const { getRoutes } = require(path.join(root, 'node_modules/expo-router/build/getRoutesCore.js'));
const { getReactNavigationConfig } = require(path.join(root, 'node_modules/expo-router/build/getReactNavigationConfig.js'));
const routeFiles = requireContext(path.join(root, 'src/app'), true, /\.[jt]sx?$/).keys();
// Discover the actual route files with Expo Router, without rendering native screens.
const context = Object.assign(file => {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(root, 'src/app', file), 'utf8'), ts.ScriptTarget.Latest, true);
  const exports = { default: () => null };
  for (const statement of source.statements) if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.name.getText(source) !== 'unstable_settings' || !declaration.initializer || !ts.isObjectLiteralExpression(declaration.initializer)) continue;
      exports.unstable_settings = Object.fromEntries(declaration.initializer.properties.filter(property => ts.isPropertyAssignment(property) && ts.isStringLiteral(property.initializer)).map(property => [property.name.getText(source).replace(/['"]/g, ''), property.initializer.text]));
    }
  }
  return exports;
}, { keys: () => routeFiles, resolve: file => file, id: 'test-routes' });
const tree = getRoutes(context, { platform: 'android', importMode: 'lazy', ignoreRequireErrors: true });
const config = getReactNavigationConfig(tree, false);
const library = config.screens['(tabs)'].screens['(library)'];
assert.equal(library.initialRouteName, 'index');
assert.deepEqual(Object.keys(config.screens['(tabs)'].screens).sort(), ['(library)', '(playlists)', 'search']);
assert.ok(config.screens.settings, 'Settings opens outside the tabs');
assert.ok(library.screens['album/[id]']);
assert.ok(library.screens['artist/[id]']);
const playlists = config.screens['(tabs)'].screens['(playlists)'];
assert.equal(playlists.initialRouteName, 'playlists/index');
assert.ok(playlists.screens['playlists/index']);
assert.equal(playlists.screens['playlists/[id]'].path, 'playlists/:id');
assert.equal(library.screens['playlists/index'], undefined);
assert.equal(library.screens['playlists/[id]'], undefined);
assert.equal(library.screens['album/[id]'].path, 'album/:id');
assert.equal(library.screens['artist/[id]'].path, 'artist/:id');
assert.equal(config.screens['album/[id]'], undefined);
assert.equal(config.screens['artist/[id]'], undefined);
assert.ok(config.screens.player, 'Player remains outside tabs as a full-screen modal');
for (const route of ['settings/cloud', 'settings/cloud/synology', 'settings/cloud/google-drive', 'settings/playback', 'settings/library', 'settings/other', 'settings/playlist-backup']) {
  assert.equal(config.screens[route].path, route, 'Settings destinations resolve through the real route tree');
}

// Render actual tab layout and settings button against native view stubs.
const jsx = (type, props) => ({ type, props });
function renderModule(file, mocks) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => { if (name in mocks) return mocks[name]; throw new Error('Unexpected module: ' + name); }, exports);
  return exports;
}
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== 'object') return [];
  return [node, ...nodes(node.props?.children)];
}
const ui = {
  react: { useRef: initial => ({ current: initial }) },
  'react/jsx-runtime': { jsx, jsxs: jsx },
  '@/components/text': { Text: 'Text' },
  '@/components/text': { Text: 'Text' },
  '@/components/text': { Text: 'Text' },
  'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', StyleSheet: { create: value => value, absoluteFill: {} }, useColorScheme: () => 'dark' },
  'expo-router': { Tabs: { Screen: 'TabScreen' } },
  'expo-blur': { BlurView: 'BlurView', BlurTargetView: 'BlurTargetView' },
  '@expo/vector-icons/Ionicons': { default: 'Icon', __esModule: true },
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 16 }) },
  'react-native-keyboard-controller': { useKeyboardState: selector => selector({ isVisible: false }) },
  '@/components/mini-player': { MINI_PLAYER_INSET: 12, MiniPlayer: 'MiniPlayer' },
  '@/components/tab-bar-inset': { TAB_BAR_HEIGHT: 66, TabBarInsetContext: { Provider: 'TabBarInsetProvider' } },
  '@/theme/tokens': { useColors: () => ({ tint: '#f48' }) },
};
const TabsLayout = renderModule('src/app/(tabs)/_layout.tsx', ui).default;
const tabs = TabsLayout();
assert.deepEqual(nodes(tabs).filter(node => node.type === 'TabScreen').map(node => [node.props.name, node.props.options.title]), [['(library)', '보관함'], ['(playlists)', '플레이리스트'], ['search', '검색']]);
const refs = new Set();
for (const name of ['(library)', '(playlists)', 'search']) {
  const content = tabs.props.screenLayout({ children: jsx('Screen', {}), route: { name } });
  assert.equal(nodes(content).find(node => node.type === 'TabBarInsetProvider').props.value, 82, 'Scroll indicators reserve the tab height and bottom safe area');
  refs.add(content.props.ref);
  const layout = tabs.props.layout({ children: content, state: { routes: [{ name }], index: 0 } });
  assert.equal(nodes(layout).find(node => node.type === 'MiniPlayer').props.blurTarget, content.props.ref, 'Mini player captures the selected tab');
  const background = tabs.props.screenOptions({ route: { name } }).tabBarBackground();
  assert.equal(nodes(background).find(node => node.type === 'BlurView').props.blurTarget, content.props.ref, 'Tab blur captures the selected tab');
}
assert.equal(refs.size, 3);
const keyboardTabs = renderModule('src/app/(tabs)/_layout.tsx', { ...ui,
  'react-native-keyboard-controller': { useKeyboardState: selector => selector({ isVisible: true }) },
}).default();
assert.equal(nodes(keyboardTabs.props.screenLayout({ children: jsx('Screen', {}), route: { name: 'search' } })).find(node => node.type === 'TabBarInsetProvider').props.value, 0, 'Hidden tabs do not shorten the search indicator');
const settingsActions = [];
const SettingsButton = renderModule('src/components/settings-button.tsx', { ...ui,
  react: { ...ui.react, useCallback: fn => fn, useEffect: () => {} },
  '@/stores/hidden-feature-access': { useHiddenFeatureAccess: () => ({ ready: true, enabled: false, quickHideEnabled: true, load: async () => {} }) },
  '@/features/hidden-music/quick-hide': { quickHide: async () => {} },
  '@/components/text': { Text: 'Text' },
  '@/components/text': { Text: 'Text' },
  '@/components/text': { Text: 'Text' },
  'react-native': { ...ui['react-native'], Keyboard: { dismiss: () => settingsActions.push('dismiss') } },
  'expo-router': { router: { push: route => settingsActions.push(route) }, useFocusEffect: () => {} },
}).SettingsButton;
const button = SettingsButton();
assert.equal(button.props.accessibilityLabel, '설정 열기');
button.props.onPress();
assert.deepEqual(settingsActions, ['dismiss', '/settings'], 'Settings dismisses the keyboard and opens its root stack screen');
const ScreenHeader = renderModule('src/components/screen-header.tsx', ui).ScreenHeader;
const header = ScreenHeader({ title: '보관함', action: button });
const titleRow = nodes(header).find(node => node.props?.children?.includes?.(button));
assert.ok(titleRow && titleRow.props.children[1] === button, 'Settings sits to the right of the heading');
assert.ok(!fs.readFileSync(path.join(root, 'src/app/(tabs)/(library)/index.tsx'), 'utf8').includes('내 플레이리스트'), 'Library no longer duplicates the playlist tab');

const settingsUI = { SettingsLink: 'SettingsLink', SettingsPage: 'SettingsPage', SettingsSection: 'SettingsSection' };
let extrasEnabled = false;
const settingsMocks = { ...ui,
  '@/features/settings/settings-ui': settingsUI,
  '@/features/settings/version-settings': { VersionSettings: 'VersionSettings' },
  '@/features/library/album-display-settings': { AlbumDisplaySettings: 'AlbumDisplaySettings' },
  '@/stores/hidden-feature-access': { useHiddenFeatureAccess: selector => selector({ ready: true, enabled: extrasEnabled }) },
};
const Settings = renderModule('src/app/settings.tsx', settingsMocks).default;
const links = tree => nodes(tree).filter(node => node.type === 'SettingsLink').map(node => [node.props.title, node.props.href]);
assert.deepEqual(links(Settings()), [['클라우드 연결', '/settings/cloud'], ['재생 및 화면', '/settings/playback'], ['보관함', '/settings/library'], ['설정 백업 및 복구', '/settings/backup'], ['플레이리스트 백업 및 복구', '/settings/playlist-backup'], ['오픈소스 라이선스', '/settings/licenses']]);
extrasEnabled = true;
assert.deepEqual(links(Settings()).find(([title]) => title === '기타'), ['기타', '/settings/other']);
assert.ok(nodes(Settings()).some(node => node.type === 'VersionSettings'), 'Version activation stays on the main settings page');
const CloudSettings = renderModule('src/app/settings/cloud.tsx', { ...settingsMocks,
  '@/stores/auth': { useAuthStore: select => select({ mode: 'setup', session: null }) },
  '@/stores/google-drive': { useGoogleDriveStore: select => select({ account: null }) },
}).default;
assert.deepEqual(links(CloudSettings()), [['Synology', '/settings/cloud/synology'], ['Google Drive', '/settings/cloud/google-drive']]);
const openedSettings = [];
const SettingsLink = renderModule('src/features/settings/settings-ui.tsx', { ...ui,
  './settings-menu-layout': { settingsMenuStyles: { row: {}, icon: {} } },
  'expo-router': { router: { push: href => openedSettings.push(href) } },
  'react-native-keyboard-controller': { KeyboardAwareScrollView: 'Scroll' },
  '@/components/scroll-edge-fade': { ScrollEdgeFade: 'Fade' },
}).SettingsLink;
for (const [title, href] of [...links(Settings()), ...links(CloudSettings())]) {
  const row = SettingsLink({ title, href, icon: 'cloud-outline' }); row.props.onPress();
  assert.equal(openedSettings.at(-1), href, 'Settings rows open their advertised screen');
}
for (const [file, modulePath, component] of [
  ['src/app/settings/cloud/synology.tsx', '@/features/settings/synology-settings', 'SynologySettings'],
  ['src/app/settings/cloud/google-drive.tsx', '@/features/google-drive/settings', 'GoogleDriveSettings'],
  ['src/app/settings/library.tsx', '@/features/library/folder-exclusion-settings', 'FolderExclusionSettings'],
]) {
  const Screen = renderModule(file, { ...settingsMocks, [modulePath]: { [component]: component } }).default;
  assert.ok(nodes(Screen()).some(node => node.type === component), 'Detailed settings reuse the existing controls');
}

let state = { queue: [], index: -1 }, calls = [], navigation = [], finish;
let action = async (songs, index) => { state = { queue: songs, index }; };
const modules = {
  'expo-router': { router: { navigate: route => navigation.push(route) } },
  '@/services/playback/controller': { playQueue: async (...args) => { calls.push(args); await action(...args); } },
  '@/stores/playback': { usePlaybackStore: { getState: () => state } },
};
const code = ts.transpileModule(fs.readFileSync(path.join(root, 'src/features/playback/play-and-open-player.ts'), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const actions = {};
new Function('require', 'exports', code)(name => modules[name], actions);
async function main() {
  // Run the real dismissal callback in isolation from native player rendering.
  const playerSource = ts.createSourceFile('player.tsx', fs.readFileSync(path.join(root, 'src/app/player.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let dismissCallback;
  function findDismiss(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(playerSource) === 'dismissPlayer') dismissCallback = node.initializer.arguments[0].getText(playerSource);
    ts.forEachChild(node, findDismiss);
  }
  findDismiss(playerSource);
  assert.ok(dismissCallback, 'Player provides an animated dismissal callback');
  const detailTarget = { current: null }, dismissCalls = [];
  let history = [];
  const dismissRouter = {
    canGoBack: () => history.length > 1,
    back: () => { history.pop(); dismissCalls.push(['back', history.at(-1)]); },
    replace: route => dismissCalls.push(['replace', route]),
    dismissTo: route => dismissCalls.push(['detail', route]),
  };
  const dismissPlayer = new Function('router', 'detailTarget', `return (${dismissCallback});`)(dismissRouter, detailTarget);
  for (const origin of ['/album/selected-album', '/artist/selected-artist', '/search', '/(tabs)/(library)']) {
    history = [origin, '/player']; dismissPlayer();
    assert.deepEqual(dismissCalls.at(-1), ['back', origin], 'Closing returns to the actual selection screen');
  }
  history = ['/player']; dismissPlayer();
  assert.deepEqual(dismissCalls.at(-1), ['replace', '/(tabs)/(library)'], 'Direct player entry falls back to the library');
  detailTarget.current = { pathname: '/(tabs)/(library)/album/[id]', params: { id: 'another-album' } };
  history = ['/artist/original', '/player']; dismissPlayer();
  assert.deepEqual(dismissCalls.at(-1), ['detail', detailTarget.current], 'Explicit album/artist menu navigation retains its target');
  const songs = [{ id: 'one' }, { id: 'two' }];
  await actions.playAndOpenPlayer(songs, 1);
  assert.equal(calls[0][0], songs);
  assert.equal(calls[0][1], 1);
  assert.deepEqual(navigation, ['/player']);
  navigation = [];
  await actions.playAndOpenPlayer([], 0);
  assert.equal(calls.length, 1);
  action = async () => { state = { queue: [], index: -1 }; };
  await actions.playAndOpenPlayer(songs, 0);
  assert.deepEqual(navigation, [], 'Rejected hidden selection or logout must not open the player');
  action = () => new Promise(resolve => { finish = resolve; });
  const oldSelection = actions.playAndOpenPlayer(songs, 0);
  state = { queue: songs, index: 1 };
  finish();
  await oldSelection;
  assert.deepEqual(navigation, [], 'Late completion must not open the player for an obsolete selection');
  action = async () => { throw new Error('mock failure'); };
  await assert.rejects(actions.playAndOpenPlayer(songs, 0), /mock failure/);
  assert.deepEqual(navigation, []);
  console.log('PASS: actual Expo Router library/playlist stacks, retained detail links and initial routes; library/playlist/search tab order, selected-tab mini player and blur targets; top-right settings action/keyboard dismissal and root settings route; song/queue selection and stale playback guards. Native rendering and playback are not exercised.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
