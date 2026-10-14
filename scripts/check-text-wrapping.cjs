/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const ts = require('typescript'), react = require('react'), jsxRuntime = require('react/jsx-runtime');
const root = path.resolve(__dirname, '..');
function load(file, mocks = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'exports', ...Object.keys(globals), code)(name => {
    if (name in mocks) return mocks[name];
    throw Error('Unexpected module: ' + name);
  }, exports, ...Object.values(globals));
  return exports;
}
const helper = load('src/components/character-wrap.ts');
const fallback = load('src/components/character-wrap.ts', {}, { Intl: {} });
const withoutIntl = load('src/components/character-wrap.ts', {}, { Intl: undefined });
const gap = '\u200B';
for (const { characterWrap } of [helper, fallback, withoutIntl]) {
  for (const [input, expected] of [
    ['가져오는 중…', '가\u200B져\u200B오\u200B는 중\u200B…'],
    ['가져오는 중...', '가\u200B져\u200B오\u200B는 중\u200B.\u200B.\u200B.'],
    ['Audio Station', 'A\u200Bu\u200Bd\u200Bi\u200Bo S\u200Bt\u200Ba\u200Bt\u200Bi\u200Bo\u200Bn'],
    ['12곡', '1\u200B2\u200B곡'], ['가\n나\r\n다  라', '가\n나\r\n다  라'],
    ['e\u0301한', 'e\u0301\u200B한'], ['\u1100\u1161\u11A8나', '\u1100\u1161\u11A8\u200B나'],
    ['👨‍👩‍👧‍👦한', '👨‍👩‍👧‍👦\u200B한'], ['👍🏽한', '👍🏽\u200B한'],
    ['🇰🇷🇺🇸', '🇰🇷\u200B🇺🇸'], ['1️⃣2️⃣', '1️⃣\u200B2️⃣'], ['❤️한', '❤️\u200B한'], ['', ''],
  ]) {
    assert.equal(characterWrap(input), expected);
    assert.equal(characterWrap(expected), expected, 'Repeated display processing must not multiply break markers');
    assert.equal(characterWrap(input).replaceAll(gap, ''), input.replaceAll(gap, ''), 'Visible content stays intact');
  }
}
const platform = { OS: 'android' };
const { Text } = load('src/components/text.tsx', {
  react: { Children: react.Children, isValidElement: react.isValidElement, forwardRef: render => render, useMemo: calculate => calculate() },
  'react/jsx-runtime': jsxRuntime, 'react-native': { Platform: platform, Text: 'NativeText' }, './character-wrap': fallback,
});
const ref = { current: null }, onPress = () => {}, onLayout = () => {}, style = { color: '#888' };
for (const os of ['android', 'ios', 'web']) {
  platform.OS = os;
  const node = Text({ children: ['글자', 12, '\n다음'], numberOfLines: 2, style, onPress, onLayout, selectable: true }, ref);
  assert.equal(node.props.ref, ref); assert.equal(node.props.onPress, onPress); assert.equal(node.props.onLayout, onLayout);
  assert.equal(node.props.selectable, true); assert.equal(node.props.numberOfLines, 2);
  assert.equal(node.props.accessibilityLabel, '글자12\n다음', 'Screen readers receive the unmodified original text');
  assert.equal(node.props.textBreakStrategy, 'simple'); assert.equal(node.props.lineBreakStrategyIOS, 'none');
  assert.equal(node.props.android_hyphenationFrequency, 'none');
  if (os === 'web') {
    assert.deepEqual(node.props.children, ['글자', 12, '\n다음']);
    assert.equal(node.props.style[1].wordBreak, 'break-all'); assert.equal(node.props.style[1].overflowWrap, 'anywhere');
  } else {
    assert.deepEqual(node.props.children, ['글\u200B자', '1\u200B2', '\n다\u200B음']); assert.equal(node.props.style, style);
  }
  const single = Text({ children: '한 줄 제목', numberOfLines: 1, ellipsizeMode: 'tail' });
  assert.equal(single.props.children, '한 줄 제목', 'Marquee measurement and single-line truncation use original glyphs');
  assert.equal(single.props.ellipsizeMode, 'tail');
  const explicit = Text({ children: '설명', accessibilityLabel: '직접 지정한 설명' });
  assert.equal(explicit.props.accessibilityLabel, '직접 지정한 설명');
  const nested = Text({ children: ['첫 ', jsxRuntime.jsx(Text, { children: '강조' }), ' 마지막'] });
  assert.equal(nested.props.accessibilityLabel, '첫 강조 마지막');
}
const native = { ActivityIndicator: 'Spinner', Pressable: 'Pressable', View: 'View', StyleSheet: { create: value => value } };
const common = { 'react/jsx-runtime': jsxRuntime, 'react-native': native, '@/components/text': { Text: 'Text' }, '@/theme/tokens': { useColors: () => ({ tint: '#f48', muted: '#888' }) } };
const { ListLoading } = load('src/components/list-loading.tsx', {
  ...common, react: { useContext: () => 82 }, './tab-bar-inset': { TabBarInsetContext: {} },
});
const { AsyncState } = load('src/components/async-state.tsx', common);
assert.equal(ListLoading().props.children[1].props.children, '가져오는 중...');
assert.equal(AsyncState({ loading: true }).props.children[1].props.children, '가져오는 중...', 'All generic loaders use the current full message');
const { LibraryPage, LIBRARY_TABS } = load('src/features/library/library-page.tsx', {
  ...common, react: { memo: fn => fn, useMemo: calculate => calculate(), useCallback: fn => fn },
  'expo-router': { router: {} }, '@expo/vector-icons/Ionicons': { default: 'Icon', __esModule: true },
  '@/components/tab-scroll-edge-fade': { TabScrollEdgeFade: 'Fade' }, '@/components/artwork': { Artwork: 'Artwork' },
  '@/components/async-state': { AsyncState }, '@/components/list-loading': { ListLoading }, '@/components/song-row': { SongRow: 'SongRow' },
  '@/features/playback/play-and-open-player': {}, './sort-library': { sortLibraryItems: items => items },
});
for (const tab of LIBRARY_TABS) {
  const page = LibraryPage({ tab, width: 400, sortOrder: 'title', isPending: true });
  assert.equal(page.props.children.type, ListLoading, tab + ' must use the shared list loader');
}
function audit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) audit(file);
    else if (file.endsWith('.tsx') && file !== path.join(root, 'src/components/text.tsx')) {
      const source = fs.readFileSync(file, 'utf8'), ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      for (const statement of ast.statements) {
        if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.text !== 'react-native') continue;
        const bindings = statement.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) assert.ok(!bindings.elements.some(element => (element.propertyName ?? element.name).text === 'Text'), file + ' must use common Text');
      }
      assert.ok(!source.includes('<Animated.Text'), file + ' animated text must use the common wrapper');
    }
  }
}
audit(path.join(root, 'src'));
console.log('PASS: native/web character wrapping, Hermes/no-Intl fallback, Korean/Jamo/Latin/numbers, emoji/combining marks, newline preservation/idempotence, spoken original text, nested text/refs/events, single-line marquee/truncation, unified loaders including initial artists, and app-wide Text import coverage. Native layout is not rendered.');
