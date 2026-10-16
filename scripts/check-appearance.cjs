/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), { create } = require('zustand');
function load(file, mocks = {}, globals = {}) {
  mocks = { ...require('./test-cloud-fixtures.cjs').cloudFixtures(globals, mocks), ...mocks };
  const exports = {}, code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'exports', ...Object.keys(globals), code)(name => {
    if (name === 'zustand') return { create }; if (name in mocks) return mocks[name]; throw Error('Unexpected appearance dependency ' + name);
  }, exports, ...Object.values(globals)); return exports;
}
const rules = load('src/theme/appearance.ts'), palette = load('src/theme/tokens.ts', { 'react-native': {} }).palette;
const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
const jsx = (type, props) => ({ type, props });
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
function runtime(os, disk = new Map()) {
  let failRead = false, failWrite = false;
  const storage = { getItem: key => { if (failRead) throw Error('read'); return disk.get(key) ?? null; }, setItem: (key, value) => { if (failWrite) throw Error('write'); disk.set(key, value); } };
  const store = load('src/stores/appearance-preferences.ts', { 'react-native': { Platform: { OS: os } }, '@/theme/appearance': rules,
    'expo-sqlite/kv-store': { __esModule: true, default: storage },
  }, { localStorage: storage }).useAppearancePreferences;
  return { store, disk, failReads: value => { failRead = value; }, failWrites: value => { failWrite = value; } };
}
function checkColors() {
  assert.equal(rules.parseColor(' #aBc123 '), '#ABC123');
  for (const value of ['red', '#FFF', '#ffffff00', 'url(x)', '#GG0000', null]) assert.throws(() => rules.parseColor(value));
  assert.throws(() => rules.parseAppearance({ accent: '#FF0000' }));
  assert.equal(rules.colorContrast('#FFFFFF', '#000000'), 21);
  for (const scheme of ['light', 'dark']) {
    const base = palette[scheme]; assert.equal(rules.appearanceColors(base, rules.DEFAULT_APPEARANCE, scheme), base);
    assert.equal(rules.miniPlayerColors(base, rules.DEFAULT_APPEARANCE, scheme), base);
    for (const color of ['#FFFFFF', '#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#010203', '#498FE7']) {
      const preferences = { ...rules.DEFAULT_APPEARANCE, accent: color, background: color, miniAccent: color, miniBackground: color };
      const app = rules.appearanceColors(base, preferences, scheme), mini = rules.miniPlayerColors(app, preferences, scheme);
      assert(rules.colorContrast(app.tint, app.surface) >= 4.5); assert(rules.colorContrast(app.tint, app.background) >= 4.5);
      assert(rules.colorContrast(app.text, app.background) >= 4.5); assert(rules.colorContrast(mini.tint, mini.surface) >= 4.5);
      assert(rules.colorContrast(mini.text, mini.surface) >= 4.5);
      assert.equal(rules.appearanceColors(base, preferences, scheme), app, 'Stable settings reuse the same token object');
      const gradient = rules.customPlayerBackground(color), player = rules.playerAccent(color, gradient);
      assert(gradient.every(background => rules.colorContrast('#FFFFFF', background) >= 4.5));
      assert(gradient.every(background => rules.colorContrast(player.accent, background) >= 4.5));
      assert(rules.colorContrast(player.onAccent, player.accent) >= 4.5);
    }
    const custom = { ...rules.DEFAULT_APPEARANCE, miniAccent: '#00FF00', miniBackground: '#0000FF' };
    const first = rules.miniPlayerColors(base, custom, scheme);
    const changedApp = rules.appearanceColors(base, { ...custom, accent: '#FF0000', background: '#FFFF00' }, scheme);
    const second = rules.miniPlayerColors(changedApp, custom, scheme);
    for (const key of ['surface', 'tint', 'mini', 'miniControl']) assert.equal(second[key], first[key], 'Custom mini-player colors stay independent of app colors');
  }
}
async function checkStorage() {
  for (const os of ['android', 'ios', 'web']) {
    const r = runtime(os), state = r.store.getState; await state().load(); assert.deepEqual(state().preferences, rules.DEFAULT_APPEARANCE);
    await Promise.all([state().setColor('accent', '#abcdef'), state().setColor('miniBackground', '#123456'), state().setColor('playerBackground', '#00AA55')]);
    assert.equal(state().preferences.accent, '#ABCDEF'); assert.equal(state().preferences.miniBackground, '#123456');
    const restarted = runtime(os, r.disk).store; await restarted.getState().load(); assert.deepEqual(restarted.getState().preferences, state().preferences);
    const previous = state().preferences; r.failWrites(true); await assert.rejects(state().setColor('accent', null)); assert.equal(state().preferences, previous);
    r.failWrites(false); await state().setColor('accent', null); assert.equal(state().preferences.accent, null); assert.equal(state().preferences.miniBackground, '#123456');
    await assert.rejects(state().setColor('background', 'red')); assert.equal(state().preferences.background, null);
    r.failReads(true); await state().load(true); await assert.rejects(state().setColor('accent', '#FFFFFF'));
    r.failReads(false); const key = [...r.disk.keys()][0]; r.disk.set(key, '{bad'); await state().load(true); assert(state().loadError);
    await assert.rejects(state().setColor('background', null)); assert.equal(r.disk.get(key), '{bad');
  }
}
async function checkUI() {
  const r = runtime('android'), state = r.store.getState; await state().load();
  let scheme = 'light', cursor = 0; const slots = [];
  const useAppearancePreferences = select => select ? select(state()) : state();
  const tokens = load('src/theme/tokens.ts', { 'react-native': { useColorScheme: () => scheme }, '@/stores/theme-preferences': { useThemePreferences: select => select({ mode: 'auto' }) },
    '@/stores/appearance-preferences': { useAppearancePreferences }, './mode': load('src/theme/mode.ts'), './appearance': rules });
  const colorHooks = load('src/theme/use-player-colors.ts', { react: { useMemo: fn => fn() }, '@/stores/appearance-preferences': { useAppearancePreferences }, './tokens': tokens, './appearance': rules });
  let artworkColors = ['#331122', '#221133', '#111122'];
  const useArtworkColors = load('src/features/playback/use-artwork-colors.ts', { react: { useMemo: fn => fn() },
    '@/stores/player-background': { usePlayerBackgroundStore: select => select({ colors: artworkColors }) },
    '@/stores/appearance-preferences': { useAppearancePreferences }, '@/theme/appearance': rules,
  }).useArtworkColors;
  const ui = { react: { useEffect: fn => fn(), useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = value; }]; } },
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': { View: 'View', Pressable: 'Button', ActivityIndicator: 'Spinner', StyleSheet: { create: value => value } },
    '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Icon' }, 'expo-linear-gradient': { LinearGradient: 'Gradient' },
    '@/components/text': { Text: 'Text' }, '@/components/text-input': { TextInput: 'Input' }, '@/stores/appearance-preferences': { useAppearancePreferences },
    '@/theme/tokens': tokens, '@/theme/use-player-colors': colorHooks, '@/features/playback/use-artwork-colors': { useArtworkColors }, '@/theme/appearance': rules,
    './settings-ui': { SettingsPage: 'Page', SettingsSection: 'Section' },
  };
  const Settings = load('src/features/settings/color-settings.tsx', ui).ColorSettings;
  const expand = tree => Array.isArray(tree) ? tree.map(expand) : !tree || typeof tree !== 'object' ? tree : typeof tree.type === 'function' ? expand(tree.type(tree.props)) : { ...tree, props: { ...tree.props, children: expand(tree.props.children) } };
  const render = () => { cursor = 0; return nodes(expand(Settings())); };
  let tree = render(); assert.equal(tree.filter(node => node.type === 'Input').length, 5);
  tree.find(node => node.props.accessibilityLabel === '앱 강조색 블루').props.onPress(); await flush(); assert.equal(state().preferences.accent, '#498FE7');
  assert.notEqual(tokens.useColors().tint, palette.light.tint); assert.equal(tokens.useColors(), tokens.useColors());
  tree = render(); tree.find(node => node.props.accessibilityLabel === '미니 플레이어 배경색 직접 입력').props.onChangeText('bad');
  render().find(node => node.props.accessibilityLabel === '미니 플레이어 배경색 코드 적용').props.onPress();
  assert(render().some(node => node.props.accessibilityRole === 'alert')); assert.equal(state().preferences.miniBackground, null);
  render().find(node => node.props.accessibilityLabel === '미니 플레이어 배경색 직접 입력').props.onChangeText('#12ab34');
  render().find(node => node.props.accessibilityLabel === '미니 플레이어 배경색 코드 적용').props.onPress(); await flush(); assert.equal(state().preferences.miniBackground, '#12AB34');
  assert.notEqual(colorHooks.useMiniPlayerColors().surface, tokens.useColors().surface);
  tree = render(); tree.find(node => node.props.accessibilityLabel === '앱 강조색 기본 색상').props.onPress(); await flush();
  assert.equal(tokens.useColors(), tokens.palette.light); assert.equal(state().preferences.miniBackground, '#12AB34', 'Resetting app colors preserves mini-player overrides');
  assert.equal(useArtworkColors(), artworkColors);
  await state().setColor('playerBackground', '#FF0000'); const fixed = useArtworkColors(); artworkColors = ['#001122', '#000011', '#000000']; assert.deepEqual(useArtworkColors(), fixed);
  await state().setColor('playerBackground', null); assert.equal(useArtworkColors(), artworkColors, 'Automatic artwork mode follows the current track again');
  scheme = 'dark'; assert.equal(tokens.useColors(), tokens.palette.dark);
}
(async () => { checkColors(); await checkStorage(); await checkUI(); console.log('PASS: color validation, light/dark readable accents and backgrounds, stable tokens, independent mini-player colors, Android/iOS/web persistence and failure recovery, presets/custom hex/reset UI, and fixed/artwork player backgrounds. Native rendering/storage are mocked.'); })().catch(error => { console.error(error); process.exitCode = 1; });
