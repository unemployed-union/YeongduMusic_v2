const assert = require('node:assert/strict');
const { loadSource } = require('./test-source-loader.cjs');
const jsx = (type, props) => ({ type, props });
const nodes = (tree) =>
  Array.isArray(tree)
    ? tree.flatMap(nodes)
    : tree && typeof tree === 'object'
      ? [tree, ...nodes(tree.props?.children)]
      : [];
const calls = [];
const action =
  (name) =>
  async (...args) => {
    calls.push([name, ...args]);
  };
const status = {
  ready: true,
  loading: false,
  saving: false,
  loadError: false,
  error: null,
  load: action('load'),
};
const seek = { ...status, playOnSeek: false, setPlayOnSeek: action('seek') };
const lyrics = {
  ...status,
  enabled: true,
  options: { source: 'en', target: 'ko' },
  setEnabled: action('lyrics-enabled'),
  save: action('languages'),
};
const library = {
  ...status,
  groupAlbumsByTitle: false,
  includeFolderAlbums: true,
  setGroupAlbumsByTitle: action('group-albums'),
  setIncludeFolderAlbums: action('folder-albums'),
};
const detail = {
  ...status,
  preferences: { artistPhotos: false, albumColors: true },
  setOption: action('detail'),
};
const favorites = {
  ...status,
  preferences: { enabled: true, songs: false, player: true, album: true },
  setOption: action('favorite'),
};
const menus = {
  ...status,
  layout: {
    library: [
      { id: 'albums', visible: true },
      { id: 'songs', visible: false },
    ],
  },
  setVisible: action('menu-visible'),
  move: action('menu-move'),
  reorder: async (group, ids) => {
    calls.push(['menu-reorder', group, ids]);
    menus.layout[group] = ids.map((id) => menus.layout[group].find((item) => item.id === id));
  },
};
const metadata = {
  ...status,
  enabled: false,
  excluded: {},
  setEnabled: action('metadata-enabled'),
  setExcluded: action('metadata-exclude'),
  retry: action('metadata-retry'),
};
const local = { busy: false, allSongs: [], processed: 0, error: null, setSource: action('source') };
const exclusions = { ...status, folders: [], setFolders: action('excluded-folders') };
const appearance = {
  ...status,
  preferences: {
    accent: null,
    background: null,
    playerBackground: null,
    miniAccent: null,
    miniBackground: null,
  },
  setColor: action('color'),
};
const s3 = {
  ...status,
  busy: false,
  connection: null,
  songs: [],
  scanned: 0,
  connect: action('s3-connect'),
  refresh: action('s3-refresh'),
  disconnect: action('s3-disconnect'),
  cancel() {},
};
const access = { ready: true, enabled: true, load: action('access-load') };
const privacy = {
  scope: 'scope',
  ready: true,
  unlocked: false,
  busy: false,
  error: null,
  profile: { biometricLock: true },
  unlock: action('unlock'),
  lock: action('lock'),
  load: action('privacy-load'),
};
const useStore = (state) =>
  Object.assign((select) => (select ? select(state) : state), { getState: () => state });
const swiftNames = [
  'Button',
  'ColorPicker',
  'DisclosureGroup',
  'Form',
  'Group',
  'Host',
  'HStack',
  'Image',
  'Menu',
  'Picker',
  'ProgressView',
  'RNHostView',
  'Section',
  'SecureField',
  'Slider',
  'Spacer',
  'Text',
  'TextField',
  'Toggle',
  'NavigationStack',
  'Toolbar',
  'ToolbarItem',
  'VStack',
];
const modifiers = [
  'accessibilityLabel',
  'autocorrectionDisabled',
  'disabled',
  'font',
  'frame',
  'foregroundStyle',
  'keyboardType',
  'environment',
  'listStyle',
  'moveDisabled',
  'contentShape',
  'animation',
  'listRowBackground',
  'listRowInsets',
  'labelStyle',
  'pickerStyle',
  'scrollContentBackground',
  'tag',
  'textInputAutocapitalization',
  'textSelection',
  'tint',
  'navigationTitle',
  'navigationBarTitleDisplayMode',
];
const colors = { tint: '#ff5588', text: '#ffffff', muted: '#999999', background: '#000000' };

function harness(overrides = {}, eagerEffects = false) {
  const slots = [];
  let cursor = 0;
  let cleanup;
  function slot(initial) {
    const index = cursor++;
    if (!(index in slots)) {
      slots[index] = typeof initial === 'function' ? initial() : initial;
    }
    return [
      slots[index],
      (value) => {
        slots[index] = typeof value === 'function' ? value(slots[index]) : value;
      },
    ];
  }
  const mocks = {
    react: {
      Children: { toArray: (children) => [children].flat(Infinity).filter(Boolean) },
      createContext: () => ({ Provider: 'Provider' }),
      useContext: () => true,
      isValidElement: (child) => !!child?.type,
      useState: slot,
      useRef: (initial) => slot({ current: initial })[0],
      useEffect: (callback) => {
        if (eagerEffects) {
          callback();
        }
      },
      useCallback: (callback) => callback,
      useMemo: (callback) => callback(),
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': {
      View: 'RNView',
      Image: 'RNImage',
      Modal: 'RNModal',
      Platform: { OS: 'ios', Version: 26 },
      Keyboard: { dismiss() {} },
      Alert: { alert() {} },
    },
    '@expo/ui/swift-ui': {
      ...Object.fromEntries(swiftNames.map((name) => [name, 'Swift' + name])),
      List: Object.assign((props) => jsx('SwiftList', props), {
        ForEach: ({ children, ...props }) =>
          jsx('SwiftListForEach', {
            ...props,
            children: props.data.map((item, index) => children({ item, index })),
          }),
      }),
      useNativeState: (initial) =>
        slot(() => {
          let value = initial;
          return {
            get: () => value,
            set: (next) => {
              value = next;
            },
          };
        })[0],
    },
    '@expo/ui/swift-ui/modifiers': {
      ...Object.fromEntries(modifiers.map((name) => [name, (...args) => ({ name, args })])),
      Animation: { smooth: (options) => ({ type: 'smooth', ...options }) },
      shapes: { roundedRectangle: (options) => ({ shape: 'roundedRectangle', ...options }) },
    },
    'react-native-reanimated': { useReducedMotion: () => false },
    'expo-router': {
      router: { push: action('route') },
      Redirect: 'Redirect',
      useFocusEffect: (callback) => {
        cleanup = callback();
      },
    },
    'expo-linking': { openURL: action('external-url') },
    '../../../assets/images/creator-profile.png': 42,
    'expo-file-system': { Directory: { pickDirectoryAsync: async () => null } },
    '@/theme/tokens': { useColors: () => colors, useAppColorScheme: () => 'dark' },
    '@/theme/liquid-glass': { useLiquidGlass: () => ({ supported: true, enabled: true }) },
    '@/theme/use-player-colors': {
      useMiniPlayerColors: () => colors,
      usePlayerAccent: () => ({ accent: colors.tint }),
    },
    '@/features/playback/use-artwork-colors': { useArtworkColors: () => ['#000000', '#111111'] },
    '@/services/haptics': { playHaptic: (name) => calls.push(['haptic', name]) },
    '@/stores/playback-preferences': { usePlaybackPreferences: useStore(seek) },
    '@/stores/lyrics-translation': { useLyricsTranslationStore: useStore(lyrics) },
    '@/stores/library-preferences': { useLibraryPreferences: useStore(library) },
    '@/stores/library-detail-preferences': { useLibraryDetailPreferences: useStore(detail) },
    '@/stores/favorite-display-preferences': { useFavoriteDisplayPreferences: useStore(favorites) },
    '@/stores/menu-preferences': { useMenuPreferences: useStore(menus) },
    '@/stores/web-metadata': { useWebMetadataStore: useStore(metadata) },
    '@/stores/folder-exclusions': { useFolderExclusionStore: useStore(exclusions) },
    '@/stores/local-music': { useLocalMusicStore: useStore(local) },
    '@/stores/appearance-preferences': { useAppearancePreferences: useStore(appearance) },
    '@/stores/auth': { useAuthStore: useStore({ mode: 'nas', session: {} }) },
    '@/stores/hidden-feature-access': { useHiddenFeatureAccess: useStore(access) },
    '@/stores/hidden-music': { useHiddenMusicStore: useStore(privacy) },
    '@/stores/streaming-preferences': {
      useStreamingPreferences: useStore({
        ...status,
        quality: 'original',
        setQuality: action('quality'),
      }),
    },
    '@/stores/display-preferences': {
      useDisplayPreferences: useStore({
        ...status,
        hideArtwork: false,
        setHideArtwork: action('artwork'),
      }),
    },
    '@/stores/theme-preferences': {
      useThemePreferences: useStore({ ...status, mode: 'auto', setMode: action('theme') }),
    },
    '@/stores/blur-preferences': {
      useBlurPreferences: useStore({ ...status, enabled: true, areas: {} }),
    },
    '@/stores/s3': { useS3Store: useStore(s3) },
    '@/features/library/queries': {
      useSongs: () => ({ data: { items: [] }, isPending: false, error: null }),
    },
    '@/features/hidden-music/rules': { privacyScope: () => 'scope' },
    '@/services/local-music/folders': {
      availableLocalFolders: () => [],
      localFolderKey: (value) => value,
    },
    '@/features/settings/ios-system-settings': { isIosSystemSettingsAvailable: true },
    '@/features/settings/use-system-settings-link': {
      useSystemSettingsLink: () => ({
        busy: false,
        error: null,
        syncError: false,
        openSettings() {},
      }),
    },
    './use-system-settings-link': {
      useSystemSettingsLink: () => ({
        busy: false,
        error: null,
        syncError: false,
        openSettings() {},
      }),
    },
    './rules': { metadataKey: (song) => song.id },
    ...overrides,
  };
  mocks['zustand/react/shallow'] = loadSource(require.resolve('zustand/react/shallow'), {
    react: mocks.react,
    'zustand/vanilla/shallow': require('zustand/vanilla/shallow'),
  });
  const cache = new Map();
  function expand(tree) {
    if (Array.isArray(tree)) {
      return tree.map(expand);
    }
    if (!tree || typeof tree !== 'object') {
      return tree;
    }
    if (typeof tree.type === 'function') {
      return expand(tree.type(tree.props));
    }
    return { ...tree, props: { ...tree.props, children: expand(tree.props?.children) } };
  }
  return {
    load: (file) => loadSource(file, mocks, {}, cache, 'ios'),
    render: (work) => {
      cursor = 0;
      return expand(work());
    },
    cleanup: () => cleanup?.(),
  };
}
const find = (tree, type, label) => {
  const result = nodes(tree).find(
    (node) => node.type === 'Swift' + type && (label === undefined || node.props.label === label),
  );
  assert(result, type + ' ' + (label ?? ''));
  return result;
};
const blocked = (node) =>
  node.props.modifiers?.some((modifier) => modifier.name === 'disabled' && modifier.args[0]);
const flush = async () => {
  for (let index = 0; index < 15; index++) {
    await Promise.resolve();
  }
};

async function main() {
  const nasNavigationState = {
    stale: false,
    type: 'stack',
    key: 'app-stack',
    routeKeySeq: 2,
    routeNames: ['(tabs)', '(settings)', 'connect'],
    index: 1,
    routes: [{ name: '(tabs)', key: 'library' }, { name: '(settings)', key: 'settings' }],
  };
  const loginState = { ...nasNavigationState, index: 0, routes: [{ name: 'connect' }] };
  const loginRoutes = [];
  const disconnectedNas = harness({
    'expo-router': {
      useNavigation: () => ({
        getState: () => nasNavigationState,
        dispatch: (action) => {
          assert.equal(action.type, 'RESET');
          assert.equal(action.target, nasNavigationState.key);
          loginRoutes.push(action.payload);
        },
      }),
      router: { replace: route => loginRoutes.push(route) },
    },
    '@/stores/auth': { useAuthStore: useStore({ mode: 'setup', session: null }) },
    '@/services/synology/api': {
      discover() { throw Error('Opening login must not test a NAS address'); },
      normalizeAddress() { throw Error('Opening login must not require a NAS address'); },
    },
    '@/services/synology/cache': {
      clearLibraryCache() { throw Error('Opening login must not clear music data'); },
    },
    '@/services/playback/controller': {
      stopNasPlayback() { throw Error('Opening login must not stop playback'); },
    },
  });
  const Nas = disconnectedNas.load('src/features/settings/synology-settings.ios.tsx').SynologySettings;
  const loginTree = disconnectedNas.render(() => Nas());
  const nasLogin = find(loginTree, 'Button', 'NAS 로그인');
  assert(!blocked(nasLogin), 'A new user can reach login without a prefilled NAS address');
  assert(!nodes(loginTree).some(node => node.type === 'SwiftTextField'), 'Do not show connected-account management before login');
  nasLogin.props.onPress();
  assert.deepEqual(loginRoutes, [loginState], 'Login clears the native settings sheet with a complete navigation state');

  const connectedRoutes = [];
  const currentNas = { baseUrl: 'https://nas.example.test:5001' };
  const connectedNas = harness({
    'expo-router': {
      useNavigation: () => ({
        getState: () => nasNavigationState,
        dispatch: (action) => {
          assert.equal(action.type, 'RESET');
          assert.equal(action.target, nasNavigationState.key);
          connectedRoutes.push(action.payload);
        },
      }),
      router: { replace: route => connectedRoutes.push(route) },
    },
    '@/stores/auth': { useAuthStore: useStore({ mode: 'nas', session: currentNas }) },
    '@/services/synology/api': {
      discover() { throw Error('Opening re-login must not test the NAS'); },
      normalizeAddress() { throw Error('Opening re-login must not require an address change'); },
    },
    '@/services/synology/cache': {
      clearLibraryCache() { throw Error('Opening re-login must not clear cached music'); },
    },
    '@/services/playback/controller': {
      stopNasPlayback() { throw Error('Opening re-login must not stop playback'); },
    },
  });
  const NasSettings = connectedNas.load('src/app/(settings)/settings/cloud/synology.tsx').default;
  const connectedTree = connectedNas.render(() => NasSettings());
  assert(!nodes(connectedTree).some(node => node.type === 'SwiftButton' && node.props.label === 'NAS 로그인'), 'An authenticated account sees connection settings instead of the initial login prompt');
  assert.equal(find(connectedTree, 'TextField').props.text.get(), currentNas.baseUrl, 'The current NAS URI remains editable');
  assert(!blocked(find(connectedTree, 'Button', '연결 테스트')));
  assert(!blocked(find(connectedTree, 'Button', '주소 변경 후 다시 로그인')));
  assert.equal(find(connectedTree, 'Button', 'NAS 연결 해제').props.role, 'destructive');
  find(connectedTree, 'Button', '다시 로그인').props.onPress();
  assert.deepEqual(connectedRoutes, [loginState], 'An authenticated user can re-login without changing the NAS URI');

  const playback = harness();
  const Playback = playback.load('src/app/(settings)/settings/playback.tsx').default;
  let tree = playback.render(() => Playback());
  assert(
    !nodes(tree).some((node) => node.type === 'SwiftRNHostView'),
    'Playback settings must be direct SwiftUI Form rows',
  );
  const lyricsSection = nodes(tree).find(
    (node) => node.type === 'SwiftSection' && node.props.title === '가사 번역',
  );
  assert(lyricsSection.props.footer.props.children.includes('MyMemory'));
  assert(lyricsSection.props.footer.props.children.includes('5,000자'));
  assert(
    !nodes(lyricsSection).some(
      (node) => node.type === 'SwiftText' && String(node.props.children).includes('MyMemory'),
    ),
    'Translation disclosure belongs in the section footer, outside the interactive rows',
  );
  assert(
    nodes(tree)
      .filter((node) => node.type === 'SwiftToggle')
      .every((node) =>
        node.props.modifiers.some(
          (modifier) => modifier.name === 'tint' && modifier.args[0] === colors.tint,
        ),
      ),
    'Native settings switches use the app accent rather than the white menu tint',
  );
  colors.tint = '#c83d67';
  tree = playback.render(() => Playback());
  assert(
    find(tree, 'Toggle', '가사 번역 사용').props.modifiers.some(
      (modifier) => modifier.name === 'tint' && modifier.args[0] === colors.tint,
    ),
    'A saved accent change also updates the native switch track',
  );
  colors.tint = '#ff5588';
  find(tree, 'Toggle', '탐색 후 자동 재생').props.onIsOnChange(true);
  assert(calls.some((call) => call[0] === 'seek' && call[1] === true));
  find(tree, 'Picker', '원문 언어').props.onSelectionChange('ko');
  assert.deepEqual(calls.find((call) => call[0] === 'languages')[1], {
    source: 'ko',
    target: 'en',
  });
  const previous = calls.filter((call) => call[0] === 'languages').length;
  find(tree, 'Picker', '번역 언어').props.onSelectionChange('en');
  assert.equal(
    calls.filter((call) => call[0] === 'languages').length,
    previous,
    'A matching source and target cannot be saved',
  );
  seek.loadError = true;
  seek.error = 'Read failed';
  tree = playback.render(() => Playback());
  assert(blocked(find(tree, 'Toggle', '탐색 후 자동 재생')));
  const seeks = calls.filter((call) => call[0] === 'seek').length;
  find(tree, 'Toggle', '탐색 후 자동 재생').props.onIsOnChange(true);
  assert.equal(calls.filter((call) => call[0] === 'seek').length, seeks);
  find(tree, 'Button', '다시 불러오기').props.onPress();
  assert(calls.some((call) => call[0] === 'load' && call[1] === true));
  seek.loadError = false;
  seek.error = null;

  const collection = harness();
  const Library = collection.load('src/app/(settings)/settings/library.tsx').default;
  tree = collection.render(() => Library());
  assert(
    !nodes(tree).some((node) => node.type === 'SwiftRNHostView'),
    'All library settings are direct native fields',
  );
  for (const title of ['앨범', '상세 화면', '좋아요 버튼 표시', '웹 메타데이터', '이 기기']) {
    const section = nodes(tree).find(
      (node) => node.type === 'SwiftSection' && node.props.title === title,
    );
    assert(section.props.footer.props.children.length > 0, title + ' has external help');
    assert(
      !nodes(section).some((node) => node.props?.children === section.props.footer.props.children),
    );
  }
  find(tree, 'Toggle', '앨범 제목만으로 묶기').props.onIsOnChange(true);
  assert(calls.some((call) => call[0] === 'group-albums' && call[1] === true));
  find(tree, 'Toggle', '노래 목록').props.onIsOnChange(true);
  assert(calls.some((call) => call[0] === 'favorite' && call[1] === 'songs' && call[2]));
  assert(blocked(find(tree, 'Toggle', '앨범')), 'The last visible menu cannot be hidden');
  const visibility = nodes(tree).find(
    (node) => node.type === 'SwiftSection' && node.props.title === '보관함 메뉴 표시',
  );
  const ordering = nodes(tree).find(
    (node) => node.type === 'SwiftSection' && node.props.title === '보관함 메뉴 순서',
  );
  assert(!nodes(visibility).some((node) => node.type === 'SwiftListForEach'));
  assert(!nodes(ordering).some((node) => node.type === 'SwiftToggle'));
  assert(!nodes(ordering).some((node) => node.type === 'SwiftMenu'));
  const list = find(tree, 'List');
  assert(
    list.props.modifiers.some(
      (modifier) =>
        modifier.name === 'environment' &&
        modifier.args[0] === 'editMode' &&
        modifier.args[1] === 'active',
    ),
    'A real native editable List owns the reorder gesture',
  );
  const switchLabels = nodes(visibility)
    .filter((node) => node.type === 'SwiftToggle')
    .map((node) => node.props.label);
  const progressCount = nodes(tree).filter((node) => node.type === 'SwiftProgressView').length;
  find(tree, 'ListForEach').props.onMove([0], 2);
  assert(
    calls.some(
      (call) =>
        call[0] === 'menu-reorder' && call[1] === 'library' && call[2].join(',') === 'songs,albums',
    ),
  );
  const reorders = calls.filter((call) => call[0] === 'menu-reorder').length;
  // Duplicate native events cannot enqueue a second save before React renders the disabled state.
  find(tree, 'ListForEach').props.onMove([0], 2);
  assert.equal(calls.filter((call) => call[0] === 'menu-reorder').length, reorders);
  tree = collection.render(() => Library());
  const previewData = find(tree, 'ListForEach').props.data;
  const savedSwitches = nodes(tree).find(
    (node) => node.type === 'SwiftSection' && node.props.title === '보관함 메뉴 표시',
  );
  assert.deepEqual(
    nodes(savedSwitches)
      .filter((node) => node.type === 'SwiftToggle')
      .map((node) => node.props.label),
    switchLabels,
    'Visibility controls do not jump when order changes',
  );
  assert.equal(
    nodes(tree).filter((node) => node.type === 'SwiftProgressView').length,
    progressCount,
    'Saving a drag never inserts a spinner row',
  );
  assert(
    nodes(find(tree, 'ListForEach'))
      .filter((node) => node.type === 'SwiftHStack')
      .every(
        (node) =>
          !node.props.modifiers.some(
            (modifier) => modifier.name === 'moveDisabled' && modifier.args[0],
          ),
      ),
    'Handles stay enabled while storage acknowledges a drop',
  );
  await flush();
  tree = collection.render(() => Library());
  assert.equal(
    find(tree, 'ListForEach').props.data,
    previewData,
    'A successful acknowledgement retains the exact native data array',
  );
  assert.deepEqual(find(tree, 'ListForEach').props.data, ['songs', 'albums']);
  menus.saving = true;
  tree = collection.render(() => Library());
  assert.equal(
    find(tree, 'ListForEach').props.data,
    previewData,
    'Unrelated saving flags do not replace native rows',
  );
  menus.saving = false;
  menus.loading = true;
  tree = collection.render(() => Library());
  find(tree, 'ListForEach').props.onMove([0], 2);
  assert.equal(calls.filter((call) => call[0] === 'menu-reorder').length, reorders);
  menus.loading = false;
  menus.layout.library = [...menus.layout.library].reverse();
  tree = collection.render(() => Library());
  assert.deepEqual(
    find(tree, 'ListForEach').props.data,
    ['albums', 'songs'],
    'An external restore supersedes a completed drag preview',
  );
  const restoredData = find(tree, 'ListForEach').props.data;
  menus.layout.library = menus.layout.library.map((item) => ({ ...item, visible: true }));
  tree = collection.render(() => Library());
  assert.equal(
    find(tree, 'ListForEach').props.data,
    restoredData,
    'Visibility-only updates preserve the native order array',
  );

  const defaults = loadSource('src/features/settings/menu-layout.ts').defaultMenuLayout();
  for (const [group, route] of [
    ['bottom', 'bottom-menu'],
    ['player', 'player-menu'],
  ]) {
    menus.layout[group] = defaults[group];
    const editor = harness();
    const Screen = editor.load('src/app/(settings)/settings/' + route + '.tsx').default;
    let screen = editor.render(() => Screen());
    find(screen, 'ListForEach').props.onMove([0], defaults[group].length);
    await flush();
    screen = editor.render(() => Screen());
    assert.equal(find(screen, 'ListForEach').props.data.at(-1), defaults[group][0].id);
    assert(calls.some((call) => call[0] === 'menu-reorder' && call[1] === group));
  }
  const failingMenus = {
    ...menus,
    layout: defaults,
    error: null,
    reorder: async () => {
      failingMenus.error = '메뉴 설정을 저장하지 못했습니다.';
    },
  };
  const failedOrder = harness({
    '@/stores/menu-preferences': { useMenuPreferences: useStore(failingMenus) },
  });
  const FailedMenu = failedOrder.load(
    'src/features/settings/menu-layout-settings.ios.tsx',
  ).MenuLayoutSettings;
  let failed = failedOrder.render(() => FailedMenu({ group: 'bottom' }));
  find(failed, 'ListForEach').props.onMove([0], defaults.bottom.length);
  failed = failedOrder.render(() => FailedMenu({ group: 'bottom' }));
  assert.equal(
    find(failed, 'ListForEach').props.data.at(-1),
    defaults.bottom[0].id,
    'The drag preview updates immediately',
  );
  await flush();
  failed = failedOrder.render(() => FailedMenu({ group: 'bottom' }));
  assert.deepEqual(
    find(failed, 'ListForEach').props.data,
    defaults.bottom.map((item) => item.id),
    'A failed save rolls the native preview back',
  );
  assert(nodes(failed).some((node) => node.props?.children === failingMenus.error));

  const accessibleOrder = harness({ 'react-native-reanimated': { useReducedMotion: () => true } });
  const AccessibleMenu = accessibleOrder.load(
    'src/features/settings/menu-layout-settings.ios.tsx',
  ).MenuLayoutSettings;
  const accessibleTree = accessibleOrder.render(() => AccessibleMenu({ group: 'bottom' }));
  assert(
    !find(accessibleTree, 'ListForEach').props.modifiers.some(
      (modifier) => modifier.name === 'animation',
    ),
    'Reduce Motion disables the added list animation',
  );

  const queuedWrites = [];
  const slowMenus = {
    ...menus,
    layout: loadSource('src/features/settings/menu-layout.ts').defaultMenuLayout(),
    error: null,
    reorder: (group, ids) =>
      new Promise((resolve) =>
        queuedWrites.push((success = true) => {
          if (success) {
            slowMenus.layout[group] = ids.map((id) =>
              slowMenus.layout[group].find((item) => item.id === id),
            );
          } else {
            slowMenus.error = '저장 실패';
          }
          resolve();
        }),
      ),
  };
  const slowOrder = harness({
    '@/stores/menu-preferences': { useMenuPreferences: useStore(slowMenus) },
  });
  const SlowMenu = slowOrder.load(
    'src/features/settings/menu-layout-settings.ios.tsx',
  ).MenuLayoutSettings;
  let slowTree = slowOrder.render(() => SlowMenu({ group: 'bottom' }));
  const firstDrop = find(slowTree, 'ListForEach').props.onMove;
  firstDrop([0], 3);
  slowTree = slowOrder.render(() => SlowMenu({ group: 'bottom' }));
  find(slowTree, 'ListForEach').props.onMove([0], 3);
  firstDrop([0], 3);
  slowTree = slowOrder.render(() => SlowMenu({ group: 'bottom' }));
  const secondPreview = find(slowTree, 'ListForEach').props.data;
  assert.deepEqual(secondPreview, ['search', 'library', 'playlists']);
  assert.equal(queuedWrites.length, 2, 'A second displayed drag does not wait for storage');
  queuedWrites[0]();
  await flush();
  slowTree = slowOrder.render(() => SlowMenu({ group: 'bottom' }));
  assert.equal(
    find(slowTree, 'ListForEach').props.data,
    secondPreview,
    'An older acknowledgement never flashes the previous order',
  );
  queuedWrites[1]();
  await flush();
  slowTree = slowOrder.render(() => SlowMenu({ group: 'bottom' }));
  assert.equal(
    find(slowTree, 'ListForEach').props.data,
    secondPreview,
    'The last acknowledgement also retains native row data',
  );
  find(slowTree, 'ListForEach').props.onMove([0], 3);
  slowTree = slowOrder.render(() => SlowMenu({ group: 'bottom' }));
  find(slowTree, 'ListForEach').props.onMove([0], 3);
  queuedWrites[2]();
  await flush();
  queuedWrites[3](false);
  await flush();
  slowTree = slowOrder.render(() => SlowMenu({ group: 'bottom' }));
  assert.deepEqual(
    find(slowTree, 'ListForEach').props.data,
    ['library', 'playlists', 'search'],
    'A failed final drag returns to the last successful write',
  );

  find(slowTree, 'ListForEach').props.onMove([0], 3);
  assert.equal(queuedWrites.length, 5, 'A failed move can be retried using the restored snapshot');
  queuedWrites[4]();
  await flush();
  slowTree = slowOrder.render(() => SlowMenu({ group: 'bottom' }));
  assert.deepEqual(find(slowTree, 'ListForEach').props.data, ['playlists', 'search', 'library']);

  const colorUI = harness();
  const ColorSettings = colorUI.load('src/features/settings/color-settings.ios.tsx').ColorSettings;
  tree = colorUI.render(() => ColorSettings());
  assert.equal(nodes(tree).filter((node) => node.type === 'SwiftColorPicker').length, 5);
  find(tree, 'ColorPicker').props.onSelectionChange('#123456');
  assert(
    !calls.some((call) => call[0] === 'color'),
    'Dragging a color picker must not continually save',
  );
  tree = colorUI.render(() => ColorSettings());
  find(tree, 'Button', '색상 적용').props.onPress();
  await flush();
  assert(
    calls.some((call) => call[0] === 'color' && call[1] === 'accent' && call[2] === '#123456'),
  );
  find(tree, 'Button', '기본 색상').props.onPress();
  await flush();
  assert(calls.some((call) => call[0] === 'color' && call[1] === 'accent' && call[2] === null));

  const fields = harness({}, true);
  const Field = fields.load('src/features/settings/ios/field.tsx').SettingsField;
  let secret = 'old-secret';
  tree = fields.render(() =>
    Field({
      label: '비밀번호',
      value: secret,
      secure: true,
      onChange: (value) => {
        secret = value;
      },
    }),
  );
  const input = find(tree, 'SecureField');
  assert.equal(input.props.text.get(), secret);
  secret = '';
  tree = fields.render(() =>
    Field({
      label: '비밀번호',
      value: secret,
      secure: true,
      onChange: (value) => {
        secret = value;
      },
    }),
  );
  assert.equal(
    find(tree, 'SecureField').props.text.get(),
    '',
    'Cleared form secrets also clear the native field',
  );
  tree = fields.render(() =>
    Field({
      label: '비밀번호',
      value: secret,
      secure: true,
      disabled: true,
      onChange: (value) => {
        secret = value;
      },
    }),
  );
  find(tree, 'SecureField').props.onTextChange('blocked');
  assert.equal(secret, '');

  const connection = harness();
  const S3 = connection.load('src/features/s3/settings.ios.tsx').S3Settings;
  tree = connection.render(() => S3());
  find(tree, 'SecureField').props.onTextChange('secret-key');
  tree = connection.render(() => S3());
  find(tree, 'Button', '연결하고 음악 불러오기').props.onPress();
  await flush();
  assert(
    calls.some((call) => call[0] === 's3-connect' && call[1].secretAccessKey === 'secret-key'),
  );
  s3.busy = true;
  tree = connection.render(() => S3());
  const connections = calls.filter((call) => call[0] === 's3-connect').length;
  find(tree, 'Button', '연결하고 음악 불러오기').props.onPress();
  await flush();
  assert.equal(calls.filter((call) => call[0] === 's3-connect').length, connections);
  s3.busy = false;

  const gate = harness();
  const Gate = gate.load('src/features/hidden-music/settings-gate.ios.tsx').HiddenSettingsGate;
  tree = gate.render(() => Gate({ children: jsx('Protected', {}) }));
  assert(!nodes(tree).some((node) => node.type === 'Protected'));
  tree = gate.render(() => Gate({ children: jsx('Protected', {}), systemAppearance: true }));
  assert(!nodes(tree).some((node) => node.type === 'Protected'), 'System styling must not bypass the lock');
  assert.equal(find(tree, 'Host').props.seedColor, colors.tint);
  find(tree, 'Button', '지문 · 기기 암호로 열기').props.onPress();
  assert(calls.some((call) => call[0] === 'unlock'));
  gate.cleanup();
  assert(
    calls.some((call) => call[0] === 'lock'),
    'Leaving the native gate still relocks protected settings',
  );
  access.enabled = false;
  tree = gate.render(() => Gate({ children: jsx('Protected', {}) }));
  assert.equal(tree.type, 'Redirect');
  assert.equal(tree.props.href, '/settings');
  access.enabled = true;
  const author = harness();
  const Creator = author.load('src/features/settings/creator-dialog.ios.tsx').CreatorDialog;
  let authorTaps = 0;
  let authorClosed = 0;
  tree = author.render(() =>
    Creator({ onClose: () => authorClosed++, onPressName: () => authorTaps++ }),
  );
  assert.equal(tree.type, 'RNModal');
  assert.equal(tree.props.presentationStyle, 'formSheet');
  assert(
    nodes(tree).some((node) => node.type === 'RNImage' && node.props.source === 42),
    'The exact bundled creator photo is preserved',
  );
  const authorName = find(tree, 'Button', '무직노조(unemployed-union)');
  for (let count = 0; count < 10; count++) {
    authorName.props.onPress();
  }
  assert.equal(authorTaps, 10);
  assert(
    !calls.some((call) => call[0] === 'external-url'),
    'Displaying the profile does not make an external request',
  );
  find(tree, 'Button', 'GitHub 프로필 열기').props.onPress();
  await flush();
  assert(
    calls.some(
      (call) => call[0] === 'external-url' && call[1] === 'https://github.com/unemployed-union',
    ),
  );
  nodes(tree)
    .find((node) => node.type === 'SwiftButton' && node.props.role === 'close')
    .props.onPress();
  assert.equal(authorClosed, 1);
  console.log(
    'PASS: actual iOS playback/library native Form rows, language swapping and invalid-pair guards, menu visibility/order, explicit color commit/reset, native secure-field clearing, connection busy guard, and protected settings unlock/relock. Native views/network/storage are mocked.',
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
