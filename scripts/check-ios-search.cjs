const assert = require('node:assert/strict');
const { loadSource } = require('./test-source-loader.cjs');
const jsx = (type, props) => ({ type, props });
const nodes = (tree) =>
  Array.isArray(tree)
    ? tree.flatMap(nodes)
    : tree && typeof tree === 'object'
      ? [tree, ...nodes(tree.props?.children)]
      : [];
let platform = 'ios';
let viewport = { width: 390, height: 844, fontScale: 1 };
let cursor = 0;
const slots = [];
let effect;
let previousInput;
let nextTimer = 0;
const timers = new Map();
const queries = [];
let dismissed = 0;
const leaf = (name) => ({ [name]: name });
const mocks = {
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
    useEffect(callback, deps) {
      if (deps[0] !== previousInput) {
        effect?.();
        effect = callback();
        previousInput = deps[0];
      }
    },
  },
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'react-native': {
    Platform: {
      get OS() {
        return platform;
      },
    },
    useWindowDimensions: () => viewport,
    Keyboard: { dismiss: () => dismissed++ },
    StyleSheet: { create: (v) => v },
    ...Object.fromEntries(
      ['FlatList', 'Pressable', 'RefreshControl', 'View'].map((name) => [name, name]),
    ),
  },
  'expo-router': { Stack: { SearchBar: 'NativeSearch' } },
  'react-native-keyboard-controller': { useKeyboardState: () => false },
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ left: 0, right: 0 }) },
  '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Icon' },
  '@/components/tab-scroll-edge-fade': leaf('TabScrollEdgeFade'),
  '@/components/text-input': leaf('TextInput'),
  '@/components/text': leaf('Text'),
  '@/components/async-state': leaf('AsyncState'),
  '@/components/screen-header': leaf('ScreenHeader'),
  '@/components/list-loading': leaf('ListLoading'),
  '@/components/settings-button': leaf('SettingsButton'),
  '@/components/song-row': leaf('SongRow'),
  '@/components/native-tab-frame': leaf('NativeTabFrame'),
  '@/theme/tokens': {
    useColors: () => ({ tint: '#FF5588', background: '#FFFFFF', surface: '#F2F2F7' }),
  },
  '@/theme/liquid-glass': { useLiquidGlass: () => ({ supported: true, enabled: false }) },
  '@/features/library/queries': {
    useSearch(term) {
      queries.push(term);
      return { data: { items: [], total: 0 }, isPending: false, isError: false };
    },
  },
  '@/features/playback/play-and-open-player': {},
};
const Screen = loadSource('src/features/library/search-screen.tsx', mocks, {
  setTimeout: (fn, delay) => {
    timers.set(++nextTimer, { fn, delay });
    return nextTimer;
  },
  clearTimeout: (id) => timers.delete(id),
}).default;
const render = () => {
  cursor = 0;
  return nodes(Screen());
};
let ui = render();
let search = ui.find((n) => n.type === 'NativeSearch');
assert(search && !ui.some((n) => n.type === 'TextInput'), 'Phone search has one native input');
assert.equal(search.props.hideNavigationBar, false);
search.props.onChangeText({ nativeEvent: { text: '긴 한국어 검색어' } });
ui = render();
assert.equal(queries.at(-1), '');
assert.equal([...timers.values()].at(-1).delay, 350, 'Preserve the existing debounce');
[...timers.values()].at(-1).fn();
ui = render();
assert.equal(queries.at(-1), '긴 한국어 검색어');
search = ui.find((n) => n.type === 'NativeSearch');
search.props.onCancelButtonPress();
ui = render();
assert.equal(queries.at(-1), '');
assert(dismissed > 0);
assert(!ui.some((n) => n.type === 'FlatList'), 'Cancel restores the initial prompt');
viewport = { width: 1200, height: 900, fontScale: 1 };
ui = render();
assert(
  !ui.some((n) => n.type === 'NativeSearch') && ui.some((n) => n.type === 'TextInput'),
  'Keep the iPad sidebar content input without another navigation header',
);
platform = 'android';
viewport.width = 390;
ui = render();
assert(
  !ui.some((n) => n.type === 'NativeSearch') && ui.some((n) => n.type === 'TextInput'),
  'Android retains its existing search presentation',
);
console.log(
  'PASS: native iPhone search, single input, 350ms debounce, cancellation/query clearing, iPad sidebar and Android presentation. Native keyboard interaction is checked separately.',
);
