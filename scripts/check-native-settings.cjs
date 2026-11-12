const assert = require('node:assert/strict');
const { loadSource } = require('./test-source-loader.cjs');
const jsx = (type, props) => ({ type, props });
const nodes = (tree) =>
  Array.isArray(tree)
    ? tree.flatMap(nodes)
    : tree && typeof tree === 'object'
      ? [tree, ...nodes(tree.props?.children)]
      : [];
let inNativeForm = true;
let glassEnabled = false;
const routes = [],
  haptics = [];
const nativeNames = [
  'Button',
  'List',
  'Group',
  'Host',
  'HStack',
  'Image',
  'Label',
  'ProgressView',
  'RNHostView',
  'Section',
  'Spacer',
  'Text',
  'VStack',
];
const boundaries = {
  react: {
    Children: { toArray: (children) => [children].flat(Infinity).filter(Boolean) },
    createContext: (value) => ({ value, Provider: 'ContextProvider' }),
    useContext: () => inNativeForm,
    isValidElement: (child) => !!child?.type,
  },
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'react-native': {
    View: 'View',
    PlatformColor: (name) => name,
    Switch: 'Switch',
    StyleSheet: { absoluteFill: { position: 'absolute' } },
  },
  '@expo/ui/swift-ui': Object.fromEntries(nativeNames.map((name) => [name, name])),
  '@expo/ui/swift-ui/modifiers': Object.fromEntries(
    [
      'disabled',
      'font',
      'foregroundStyle',
      'listRowInsets',
      'buttonStyle',
      'accessibilityLabel',
      'listStyle',
      'scrollContentBackground',
      'environment',
    ].map((name) => [name, (...args) => ({ name, args })]),
  ),
  'expo-router': { router: { push: (href) => routes.push(href) } },
  '@/theme/tokens': {
    useColors: () => ({ tint: '#FF5588', text: '#000000', muted: '#8A8A8E' }),
    useAppColorScheme: () => 'dark',
  },
  '@/theme/liquid-glass': { useLiquidGlass: () => ({ supported: true, enabled: glassEnabled }) },
  '@/components/glass-backdrop': { GlassBackdrop: 'GlassBackdrop' },
  '@/services/haptics': { playHaptic: (kind) => haptics.push(kind) },
};
const settings = loadSource('src/features/settings/settings-ui.ios.tsx', boundaries);
const props = {
  title: '클라우드 연결',
  description: 'Synology · Google Drive',
  icon: 'cloud-outline',
  href: '/settings/cloud',
};
let link = settings.SettingsLink(props);
assert.equal(link.type, 'Button');
assert(
  !nodes(link).some((node) => node.props?.children === props.description),
  'iOS menu rows do not enumerate their child settings',
);
assert(!nodes(link).some((node) => node.type === 'Label'), 'Menu rows have no leading icons');
assert.equal(
  nodes(link).filter((node) => node.type === 'Image').length,
  1,
  'Only the navigation chevron remains',
);
assert(
  nodes(link)
    .filter((node) => node.type === 'Text')
    .every((node) =>
      node.props.modifiers.some(
        (mod) => mod.name === 'foregroundStyle' && mod.args[0] === '#000000',
      ),
    ),
);
link.props.onPress();
assert.deepEqual(routes, ['/settings/cloud']);
assert.deepEqual(haptics, ['menu']);
link = settings.SettingsLink({ ...props, disabled: true });
link.props.onPress();
assert.equal(routes.length, 1);
assert(link.props.modifiers.some((modifier) => modifier.name === 'disabled' && modifier.args[0]));
link = settings.SettingsLink({ ...props, busy: true });
assert(nodes(link).some((node) => node.type === 'ProgressView'));
link.props.onPress();
assert.equal(routes.length, 1);
const nativeSection = settings.SettingsSection({
  title: '앱 설정',
  children: [jsx(settings.SettingsLink, props)],
});
assert.equal(nativeSection.type, 'Section');
assert.equal(
  nativeSection.props.children[0].type,
  settings.SettingsLink,
  'Native links remain direct List rows',
);
const editor = jsx('ExistingEditor', {});
const customSection = settings.SettingsSection({ title: '편집', children: editor });
const bridge = customSection.props.children[0].type(customSection.props.children[0].props);
assert.equal(bridge.props.children.type, 'RNHostView');
assert.deepEqual(bridge.props.children.props.matchContents, { vertical: true });
assert.equal(
  bridge.props.children.props.children.props.value,
  false,
  'Embedded editors re-enter the RN context',
);
const mixedSection = settings.SettingsSection({
  title: '정보',
  children: [jsx(settings.SettingsLink, props), editor],
});
assert.equal(mixedSection.props.children[0].type, settings.SettingsLink);
assert.equal(mixedSection.props.children[1].type, settings.SettingsRowContent);
const nativeVersion = jsx(settings.SettingsNativeContent, { children: jsx('VersionSettings', {}) });
const infoSection = settings.SettingsSection({
  title: '정보',
  children: [jsx(settings.SettingsLink, props), nativeVersion],
});
assert.equal(
  infoSection.props.children[1],
  nativeVersion,
  'Information native rows are never wrapped in RNHostView',
);
const page = settings.SettingsPage({
  children: jsx(settings.SettingsSection, {
    title: '앱 설정',
    children: jsx(settings.SettingsLink, props),
  }),
  overlay: jsx('Toast', {}),
});
assert(nodes(page).some((node) => node.type === 'List'));
const systemPage = settings.SettingsPage({ children: [], systemAppearance: true });
assert.equal(
  systemPage.props.style.backgroundColor,
  undefined,
  'The native List owns its background',
);
assert(
  !nodes(systemPage)
    .find((node) => node.type === 'List')
    .props.modifiers.some((mod) => mod.name === 'scrollContentBackground'),
  'The native List retains its automatic sheet background',
);
assert.equal(nodes(systemPage).find((node) => node.type === 'Host').props.seedColor, '#FF5588');
assert(
  nodes(systemPage)
    .find((node) => node.type === 'List')
    .props.modifiers.some((mod) => mod.name === 'listStyle' && mod.args[0] === 'insetGrouped'),
  'Settings use the same native grouped List style as the music-source window',
);
for (const enabled of [false, true]) {
  glassEnabled = enabled;
  const section = settings.SettingsSection({
    title: '목록',
    children: [jsx(settings.SettingsLink, props), editor],
  });
  assert.equal(section.props.children[0].type, settings.SettingsLink);
  assert.equal(section.props.children[1].type, settings.SettingsRowContent);
  assert(
    !section.props.modifiers?.length,
    'System sections own grouped row backgrounds and separators',
  );
  assert(
    !nodes(section).some((node) =>
      node.props?.modifiers?.some((mod) => mod.name === 'glassEffect'),
    ),
    'Rows have no individual glass button surfaces',
  );
}
glassEnabled = false;
assert(!nodes(page).some((node) => node.type === 'KeyboardAwareScrollView'));
assert.equal(
  page.props.children[1].type,
  'Toast',
  'Existing overlays remain outside native scroll content',
);
inNativeForm = false;
assert.equal(
  settings.SettingsLink(props).type,
  'Host',
  'Links in existing editors receive their own native host',
);
const { AnimatedSwitch } = loadSource('src/components/animated-switch.ios.tsx', boundaries);
const changes = [];
let control = AnimatedSwitch({ value: false, onValueChange: (next) => changes.push(next) });
assert.equal(control.type, 'Switch', 'iOS uses UIKit UISwitch instead of a drawn track/thumb');
assert.equal(control.props.trackColor.true, '#FF5588', 'UIKit switches use the app accent too');
assert.equal(
  AnimatedSwitch({ trackColor: { false: '#333333', true: '#FFFFFF' } }).props.trackColor.false,
  '#333333',
  'The existing off-state track is preserved',
);
control.props.onValueChange(true);
assert.deepEqual(changes, [true]);
for (const state of [{ busy: true }, { disabled: true }]) {
  control = AnimatedSwitch({ ...state, onValueChange: (next) => changes.push(next) });
  assert.equal(control.props.disabled, true);
  control.props.onValueChange(false);
}
assert.deepEqual(changes, [true]);
const previousHaptics = haptics.length;
AnimatedSwitch({ haptics: false, onValueChange() {} }).props.onValueChange(true);
assert.equal(haptics.length, previousHaptics);

let activated = 0;
let creatorOpened = 0;
let creatorClosed = 0;
const versionState = {
  ready: true,
  busy: false,
  version: '20261111A',
  error: null,
  creatorOpen: false,
  activateVersion: () => activated++,
  activateCreatorName: () => activated++,
  tapCreator: () => creatorOpened++,
  closeCreator: () => creatorClosed++,
};
const VersionSettings = loadSource('src/features/settings/version-settings.ios.tsx', {
  ...boundaries,
  './use-version-settings': { useVersionSettings: () => versionState },
  './settings-ui': { SettingsNativeContent: 'NativeContent' },
  './creator-dialog': { CreatorDialog: 'CreatorDialog' },
}).VersionSettings;
let versionTree = VersionSettings({ onToast() {} });
const versionButtons = nodes(versionTree).filter((node) => node.type === 'Button');
assert.deepEqual(
  versionButtons.map((node) => node.props.label),
  ['버전', '20261111A'],
);
assert(
  !nodes(versionTree).some((node) => node.type === 'Image'),
  'Information has no leftover icon tile',
);
versionButtons[0].props.onPress();
assert.equal(activated, 0);
assert.equal(creatorOpened, 1);
versionButtons[1].props.onPress();
assert.equal(activated, 0);
assert.equal(creatorOpened, 2, 'Both parts of the iOS version row open the creator dialog');
versionState.busy = true;
versionState.creatorOpen = true;
versionTree = VersionSettings({ onToast() {} });
assert(
  nodes(versionTree)
    .find((node) => node.type === 'Button')
    .props.modifiers.some((mod) => mod.name === 'disabled' && mod.args[0]),
);
const creatorDialog = nodes(versionTree).find((node) => node.type === 'CreatorDialog');
assert.equal(creatorDialog.props.nameDisabled, true);
creatorDialog.props.onPressName();
assert.equal(activated, 1, 'Hidden-menu activation belongs to the nickname in the dialog');
creatorDialog.props.onClose();
assert.equal(creatorClosed, 1);

const modalPlatform = { OS: 'ios' };
const { settingsPresentationOptions } = loadSource(
  'src/features/settings/settings-presentation.tsx',
  {
    'react-native': { Platform: modalPlatform },
  },
);
const sheetOptions = settingsPresentationOptions();
assert.equal(sheetOptions.presentation, 'formSheet');
assert.deepEqual(sheetOptions.sheetAllowedDetents, [0.5, 1]);
assert.equal(sheetOptions.headerShown, false, 'Only the inner stack supplies a header');
modalPlatform.OS = 'android';
assert.deepEqual(settingsPresentationOptions(), {}, 'Android keeps card navigation');
const Stack = Object.assign(function Stack() {}, { Screen: 'StackScreen' });
const actions = [];
let rootIndex = 1;
const { SettingsNavigator } = loadSource('src/features/settings/settings-navigator.ios.tsx', {
  ...boundaries,
  'expo-router': {
    Stack,
    router: { replace: (href) => actions.push(href) },
    useNavigation: (path) => {
      assert.equal(path, '/');
      return {
        getState: () => ({ key: 'root-stack', index: rootIndex }),
        dispatch: (action) => actions.push(action),
      };
    },
  },
});
glassEnabled = true;
let navigatorTree = SettingsNavigator();
assert(
  !nodes(navigatorTree).some((node) => node.type === 'GlassBackdrop'),
  'The native sheet owns its material without an additional backdrop',
);
const settingsStack = nodes(navigatorTree).find((node) => node.type === Stack);
assert.equal(
  settingsStack.props.screenOptions.headerStyle,
  undefined,
  'The native header uses its system appearance at every detent',
);
assert.equal(
  settingsStack.props.screenOptions.headerTransparent,
  undefined,
  'Expo Router enables the system bar appearance',
);
assert.equal(settingsStack.props.screenOptions.contentStyle.backgroundColor, 'transparent');
assert.equal(
  settingsStack.props.screenOptions.presentation,
  'card',
  'Children push inside the single sheet',
);
assert(
  nodes(settingsStack)
    .filter((node) => node.type === 'StackScreen')
    .every((node) => !node.props.options.presentation),
);
assert.equal(
  nodes(settingsStack).find((node) => node.props?.name === 'settings/index').props.options
    .headerBackVisible,
  false,
  'The first settings screen uses X without a redundant back button',
);
assert.equal(
  nodes(settingsStack).find((node) => node.props?.name === 'settings/cloud').props.options
    .headerBackVisible,
  true,
);
const rootScreen = nodes(settingsStack).find((node) => node.props?.name === 'settings/index');
const childScreen = nodes(settingsStack).find((node) => node.props?.name === 'settings/cloud');
assert.equal(childScreen.props.options.unstable_headerLeftItems, undefined);
const closeItem = rootScreen.props.options.unstable_headerLeftItems()[0];
assert.equal(closeItem.icon.name, 'xmark');
assert.equal(
  closeItem.hidesSharedBackground,
  undefined,
  'The system supplies the button background',
);
closeItem.onPress();
assert.deepEqual(
  actions[0],
  { type: 'POP', payload: { count: 1 }, target: 'root-stack' },
  'X closes the settings group from its root',
);
rootIndex = 0;
closeItem.onPress();
assert.equal(actions[1], '/');
glassEnabled = false;
navigatorTree = SettingsNavigator();
assert(
  !nodes(navigatorTree).some((node) => node.type === 'GlassBackdrop'),
  'System accessibility controls the native sheet material',
);
glassEnabled = true;
const section = settings.SettingsSection({
  title: '앱 설정',
  description: '앱의 모양을 변경할 수 있습니다.',
  children: jsx(settings.SettingsLink, props),
});
assert.equal(
  section.props.footer.props.children,
  '앱의 모양을 변경할 수 있습니다.',
  'Help uses a native section footer',
);
const connectionActions = [];
const connectionPlatform = { OS: 'ios' };
const { StackRouter } = require('expo-router/build/react-navigation/routers/StackRouter.js');
const { RouterActionHandling } = require('expo-router/build/react-navigation/routers/types.js');
const stackRouter = StackRouter({});
const connectionState = {
  stale: false,
  type: 'stack',
  key: 'app-stack',
  routeKeySeq: 2,
  routeNames: ['(tabs)', '(settings)', 'connect'],
  index: 1,
  routes: [
    { name: '(tabs)', key: 'library' },
    {
      name: '(settings)',
      key: 'settings',
      state: { routes: [{ name: 'settings/cloud/synology' }] },
    },
  ],
};
const connectionConfig = {
  routeNames: connectionState.routeNames,
  routeParamList: {},
  routeGetIdList: {},
};
const { openConnectionScreen } = loadSource('src/features/settings/open-connection-screen.ts', {
  'react-native': { Platform: connectionPlatform },
  'expo-router': { router: { replace: (route) => connectionActions.push(route) } },
});
const rootNavigation = {
  getState: () => connectionState,
  dispatch: (action) => connectionActions.push(action),
};
openConnectionScreen(rootNavigation);
assert.deepEqual(
  connectionActions,
  [
    {
      type: 'RESET',
      target: connectionState.key,
      payload: { ...connectionState, index: 0, routes: [{ name: 'connect' }] },
    },
  ],
  'Login preserves the complete native stack state required by SDK 58',
);
const warnings = [];
const originalWarn = console.warn;
try {
  console.warn = (message) => warnings.push(message);
  assert.equal(
    stackRouter.getStateForAction(
      connectionState,
      { type: 'RESET', payload: { index: 0, routes: [{ name: 'connect' }] } },
      connectionConfig,
    ),
    RouterActionHandling.Unhandled,
    'The old partial reset reproduces the ignored login action in the installed router',
  );
} finally {
  console.warn = originalWarn;
}
assert.equal(warnings.length, 1, 'The old reset warns instead of navigating');
const connectionEntryStates = [
  connectionState,
  { ...connectionState, index: 0, routes: [connectionState.routes[1]] },
];
for (const state of connectionEntryStates) {
  connectionActions.length = 0;
  openConnectionScreen({ ...rootNavigation, getState: () => state });
  const result = stackRouter.getStateForAction(state, connectionActions[0], connectionConfig);
  assert.notEqual(
    result,
    RouterActionHandling.Unhandled,
    'Login must be handled from a presented or directly opened settings sheet',
  );
  assert.deepEqual(
    result.state.routes.map((route) => route.name),
    ['connect'],
    'The entire settings sheet is removed',
  );
  assert.equal(result.state.index, 0);
  assert(result.state.routes[0].key, 'The real router mints a key for the login screen');
  assert(
    result.state.routeKeySeq > state.routeKeySeq,
    'New routes cannot reuse an existing route key',
  );
  assert.equal(result.state.key, state.key, 'The mounted stack is preserved');
  assert.equal(state.routes.at(-1).name, '(settings)', 'The previous state is not mutated');
}
connectionActions.length = 0;
connectionPlatform.OS = 'android';
openConnectionScreen(rootNavigation);
assert.deepEqual(connectionActions, ['/connect']);
console.log(
  'PASS: NAS login replaces the settings sheet in the installed SDK 58 stack router; the old partial reset is rejected.',
);
console.log(
  'PASS: SwiftUI List/Section/semantic native rows and native grouped surfaces, preserved routes and disabled/busy states, custom editor sizing/context, overlays, UIKit switches and haptics. Native rendering is mocked.',
);

(async () => {
  const slots = [];
  let cursor = 0;
  let statusError = null;
  let refreshes = 0;
  let opened = 0;
  let fail = false;
  let resolveSync;
  let sync = Promise.resolve();
  const hook = loadSource('src/features/settings/use-system-settings-link.ts', {
    react: {
      useState(initial) {
        const index = cursor++;
        if (!(index in slots)) slots[index] = initial;
        return [
          slots[index],
          (value) => {
            slots[index] = value;
          },
        ];
      },
    },
    'react-native': {
      Linking: {
        openSettings: async () => {
          opened++;
        },
      },
    },
    '@/services/haptics': { playHaptic() {} },
    './ios-system-settings': {
      useIosSystemSettingsStatus: () => ({ error: statusError }),
      refreshIosSystemSettings: async () => {
        refreshes++;
        await sync;
        if (fail) throw new Error('sync');
      },
    },
  }).useSystemSettingsLink;
  const render = () => {
    cursor = 0;
    return hook();
  };
  const flush = async () => {
    for (let index = 0; index < 10; index++) {
      await Promise.resolve();
    }
  };
  sync = new Promise((resolve) => {
    resolveSync = resolve;
  });
  render().openSettings();
  assert.equal(render().busy, true);
  render().openSettings();
  assert.equal(refreshes, 1, 'Repeated settings taps are blocked while syncing');
  assert.equal(opened, 0, 'Synchronize preferences before switching to Settings');
  resolveSync();
  await flush();
  assert.equal(opened, 1);
  assert.equal(render().busy, false);
  fail = true;
  render().openSettings();
  await flush();
  assert.equal(opened, 1, 'Do not open Settings after a failed synchronization');
  assert.match(render().error, /설정을 열지 못했습니다/);
  fail = false;
  render().openSettings();
  await flush();
  assert.equal(opened, 2);
  assert.equal(render().error, null);
  statusError = 'External settings error';
  assert.equal(render().syncError, true);
  assert.equal(render().error, statusError);

  let retry = 0;
  let requested = 0;
  const uiState = {
    busy: true,
    error: 'Sync failed',
    syncError: true,
    openSettings: () => requested++,
    retry: () => retry++,
  };
  const SystemLink = loadSource('src/features/settings/ios-system-settings-link.ios.tsx', {
    ...boundaries,
    './use-system-settings-link': { useSystemSettingsLink: () => uiState },
    './settings-ui': { SettingsNativeContent: 'NativeContent' },
  }).IosSystemSettingsLink;
  const systemTree = SystemLink();
  assert(nodes(systemTree).some((node) => node.type === 'ProgressView'));
  assert(
    nodes(systemTree).some((node) => node.type === 'Text' && node.props.children === 'Sync failed'),
  );
  const systemButtons = nodes(systemTree).filter((node) => node.type === 'Button');
  assert(
    systemButtons[0].props.modifiers.some(
      (modifier) => modifier.name === 'disabled' && modifier.args[0],
    ),
  );
  systemButtons[1].props.onPress();
  assert.equal(retry, 1);
  console.log(
    'PASS: native system-settings row and shared sync-before-open, busy, error and retry behavior. Linking/storage are mocked.',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
