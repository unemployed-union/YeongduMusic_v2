const assert = require('node:assert/strict');
const { create } = require('zustand');
const { loadSource } = require('./test-source-loader.cjs');

const jsx = (type, props) => ({ type, props });
function nodes(tree) {
  if (Array.isArray(tree)) {
    return tree.flatMap(nodes);
  }
  if (!tree || typeof tree !== 'object') {
    return [];
  }
  return [tree, ...nodes(tree.props?.children)];
}

async function main() {
  const originalNow = Date.now;
  let now = 100000;
  Date.now = () => now;
  try {
    const values = new Map();
    let writes = 0;
    let failWrite = false;
    const store = loadSource('src/stores/hidden-feature-access.ts', {
      zustand: { create },
      'react-native': { Platform: { OS: 'ios' } },
      'expo-secure-store': {
        getItemAsync: async (key) => values.get(key) ?? null,
        setItemAsync: async (key, value) => {
          writes++;
          if (failWrite) {
            throw new Error('Disk unavailable');
          }
          values.set(key, value);
        },
      },
    }).useHiddenFeatureAccess;
    await store.getState().load();
    for (let count = 0; count < 30; count++) {
      assert.equal(await store.getState().tapVersion(), null);
    }
    assert.equal(
      store.getState().enabled,
      false,
      'The old iOS entry no longer enables hidden menus',
    );
    assert.equal(writes, 0);

    const slots = [];
    const toasts = [];
    let cursor = 0;
    let cleanup;
    let locked = 0;
    const useSlot = (initial) => {
      const index = cursor++;
      if (!(index in slots)) {
        slots[index] = initial;
      }
      return [
        slots[index],
        (value) => {
          slots[index] = value;
        },
      ];
    };
    const modifiers = ['accessibilityLabel', 'buttonStyle', 'disabled', 'foregroundStyle'];
    const cache = new Map();
    const boundaries = {
      react: {
        useState: useSlot,
        useRef: (initial) => useSlot({ current: initial })[0],
        useEffect() {},
        useCallback: (callback) => callback,
      },
      'react/jsx-runtime': { jsx, jsxs: jsx },
      'react-native': {
        Platform: { OS: 'ios' },
        View: 'View',
        Image: 'Image',
        Modal: 'Modal',
        Pressable: 'Pressable',
        ScrollView: 'ScrollView',
        StyleSheet: { create: (styles) => styles, hairlineWidth: 1 },
      },
      'expo-router': {
        useFocusEffect: (callback) => {
          cleanup = callback();
        },
      },
      'expo-constants': { __esModule: true, default: { expoConfig: { version: '1.0.0' } } },
      'expo-linking': { openURL: async () => {} },
      '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Icon' },
      'react-native-safe-area-context': {
        useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
      },
      '@expo/ui/swift-ui': Object.fromEntries(
        ['Button', 'Group', 'HStack', 'RNHostView', 'Spacer', 'Text'].map((name) => [name, name]),
      ),
      '@expo/ui/swift-ui/modifiers': Object.fromEntries(
        modifiers.map((name) => [name, (...args) => ({ name, args })]),
      ),
      '@/components/text': { Text: 'Text' },
      '@/theme/tokens': { useColors: () => ({ text: '#fff', tint: '#f48' }) },
      '@/stores/hidden-feature-access': { useHiddenFeatureAccess: () => store.getState() },
      '@/stores/hidden-music': {
        useHiddenMusicStore: { getState: () => ({ lock: () => locked++ }) },
      },
      './settings-ui': { SettingsNativeContent: 'NativeContent' },
      '../../../assets/images/creator-profile.png': 42,
    };
    const VersionSettings = loadSource(
      'src/features/settings/version-settings.ios.tsx',
      boundaries,
      {},
      cache,
    ).VersionSettings;
    const CreatorDialog = loadSource(
      'src/features/settings/creator-dialog.tsx',
      boundaries,
      {},
      cache,
    ).CreatorDialog;
    let versionTree;
    let dialogTree;
    function render() {
      cursor = 0;
      versionTree = VersionSettings({ onToast: (message) => toasts.push(message) });
      const dialog = nodes(versionTree).find((node) => node.type === CreatorDialog);
      dialogTree = dialog ? CreatorDialog(dialog.props) : null;
    }
    async function pressVersions(count) {
      for (let index = 0; index < count; index++) {
        const buttons = nodes(versionTree).filter((node) => node.type === 'Button');
        buttons[index % 2].props.onPress();
        render();
      }
    }
    async function pressNames(count) {
      for (let index = 0; index < count; index++) {
        const nickname = nodes(dialogTree).find(
          (node) => node.props?.accessibilityLabel === '무직노조',
        );
        assert(nickname, 'The creator nickname is the activation target');
        nickname.props.onPress();
        for (let tick = 0; tick < 12; tick++) {
          await Promise.resolve();
        }
        render();
      }
    }
    function closeDialog() {
      dialogTree.props.onRequestClose();
      render();
    }

    render();
    await pressVersions(4);
    assert.equal(dialogTree, null);
    await pressVersions(1);
    assert(dialogTree, 'Five taps anywhere on the version row open the creator screen');
    assert.equal(store.getState().enabled, false);
    await pressNames(9);
    assert.equal(store.getState().enabled, false);
    await pressNames(1);
    assert.equal(store.getState().enabled, true);
    assert.equal(dialogTree, null, 'Return to settings so the revealed menu and toast are visible');
    assert.deepEqual(toasts, ['숨김 설정 열림']);

    await pressVersions(5);
    await pressNames(10);
    assert.equal(store.getState().enabled, false);
    assert.equal(locked, 1, 'Disabling the menu still locks hidden music');

    await pressVersions(4);
    now += 3001;
    await pressVersions(1);
    assert.equal(dialogTree, null, 'A pause resets version taps');
    await pressVersions(4);
    await pressNames(9);
    now += 3001;
    await pressNames(1);
    assert.equal(store.getState().enabled, false, 'A pause resets nickname taps');
    closeDialog();
    await pressVersions(5);
    await pressNames(1);
    assert.equal(store.getState().enabled, false, 'Reopening does not inherit nickname taps');
    closeDialog();

    await pressVersions(4);
    cleanup();
    render();
    await pressVersions(1);
    assert.equal(dialogTree, null, 'Leaving settings resets the entry sequence');
    await pressVersions(4);
    failWrite = true;
    await pressNames(10);
    assert.equal(store.getState().enabled, false);
    assert(dialogTree, 'A failed save keeps the creator screen open for retry');
    assert(
      nodes(dialogTree).some(
        (node) =>
          node.props?.accessibilityRole === 'alert' &&
          /저장하지 못했습니다/.test(node.props.children),
      ),
    );
    failWrite = false;
    await pressNames(10);
    assert.equal(store.getState().enabled, true);
    assert.equal(dialogTree, null);
    const persisted = [...values.values()];
    assert(persisted.includes('true'));
    console.log(
      'PASS: real iOS version row -> 5 taps -> creator nickname -> 10 taps, no legacy bypass, enable/disable, persistence, timeout/close/focus resets and save-error retry. Native UI/storage are mocked.',
    );
  } finally {
    Date.now = originalNow;
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
