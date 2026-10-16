/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), { create } = require('zustand');
function load(file, modules = {}, globals = {}) {
  modules = { ...require('./test-cloud-fixtures.cjs').cloudFixtures(globals, modules), ...modules };
  const exports = {}, code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'exports', ...Object.keys(globals), code)(name => {
    if (name === 'zustand') return { create };
    if (name in modules) return modules[name];
    throw Error('Unexpected theme dependency ' + name);
  }, exports, ...Object.values(globals));
  return exports;
}
const rules = load('src/theme/mode.ts'), key = 'yeongdumusic-theme-mode-v1';
const tick = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
async function main() {
  for (const system of ['dark', 'light', null]) {
    assert.equal(rules.resolveThemeMode('auto', system), system === 'dark' ? 'dark' : 'light');
    assert.equal(rules.resolveThemeMode('dark', system), 'dark'); assert.equal(rules.resolveThemeMode('light', system), 'light');
  }
  assert.throws(() => rules.parseThemeMode('white')); assert.throws(() => rules.parseThemeMode(null));
  const disk = new Map(), nativeModes = [];
  let failRead = false, failWrite = false, reads = 0, gate = null, failNative = false;
  const storage = { getItem: async k => { reads++; if (failRead) throw Error('read'); return disk.get(k) ?? null; },
    setItem: async (k, v) => { if (gate) await gate; if (failWrite) throw Error('write'); disk.set(k, v); } };
  const native = { Platform: { OS: 'android' }, Appearance: { setColorScheme: mode => { if (failNative && mode === 'dark') throw Error('native failed'); nativeModes.push(mode); } } };
  const modules = { 'react-native': native, '@/theme/mode': rules, 'expo-sqlite/kv-store': { __esModule: true, default: storage } };
  const fresh = () => load('src/stores/theme-preferences.ts', modules).useThemePreferences;
  const preferences = fresh(); await Promise.all([preferences.getState().load(), preferences.getState().load()]);
  assert.equal(reads, 1); assert.equal(preferences.getState().mode, 'auto'); assert.equal(nativeModes.at(-1), 'unspecified');
  await preferences.getState().setMode('dark'); assert.equal(preferences.getState().mode, 'dark'); assert.equal(disk.get(key), 'dark');
  const restarted = fresh(); await restarted.getState().load(); assert.equal(restarted.getState().mode, 'dark'); assert.equal(nativeModes.at(-1), 'dark');
  await preferences.getState().setMode('light'); assert.equal(nativeModes.at(-1), 'light');
  await preferences.getState().setMode('auto'); assert.equal(nativeModes.at(-1), 'unspecified', 'Auto removes the native app override');
  const before = nativeModes.length; failWrite = true; await assert.rejects(preferences.getState().setMode('dark'));
  assert.equal(preferences.getState().mode, 'auto'); assert.equal(disk.get(key), 'auto'); assert.equal(nativeModes.length, before, 'Failed persistence cannot change the native/app appearance');
  failWrite = false; failNative = true; await assert.rejects(preferences.getState().setMode('dark'));
  assert.equal(preferences.getState().mode, 'auto'); assert.equal(disk.get(key), 'auto', 'Failed native application compensates the saved preference'); failNative = false;
  let release; gate = new Promise(resolve => { release = resolve; });
  const first = preferences.getState().setMode('dark'), second = preferences.getState().setMode('light'); await tick();
  assert.equal(preferences.getState().saving, true); release(); gate = null; await Promise.all([first, second]);
  assert.equal(preferences.getState().mode, 'light'); assert.equal(disk.get(key), 'light'); assert.equal(nativeModes.at(-1), 'light'); assert.equal(preferences.getState().saving, false);
  failRead = true; await preferences.getState().load(true); assert.equal(preferences.getState().loadError, true); assert.equal(preferences.getState().mode, 'light');
  await assert.rejects(preferences.getState().setMode('dark')); assert.equal(disk.get(key), 'light'); failRead = false;
  await preferences.getState().load(true); assert.equal(preferences.getState().loadError, false);
  disk.set(key, 'broken'); await preferences.getState().load(true); assert.equal(preferences.getState().mode, 'auto'); assert(preferences.getState().error);
  await preferences.getState().setMode('light'); assert.equal(preferences.getState().error, null, 'A damaged preference can be replaced from the settings UI');
  let system = 'dark';
  const colors = load('src/theme/tokens.ts', { 'react-native': { useColorScheme: () => system },
    '@/stores/theme-preferences': { useThemePreferences: selector => selector(preferences.getState()) }, './mode': rules });
  assert.equal(colors.useAppColorScheme(), 'light'); assert.equal(colors.useColors(), colors.palette.light, 'White stays selected on a dark device');
  await preferences.getState().setMode('dark'); system = 'light'; assert.equal(colors.useColors(), colors.palette.dark);
  await preferences.getState().setMode('auto'); assert.equal(colors.useColors(), colors.palette.light); system = 'dark'; assert.equal(colors.useColors(), colors.palette.dark);
  const web = load('src/stores/theme-preferences.ts', { 'react-native': { Platform: { OS: 'web' } }, '@/theme/mode': rules },
    { localStorage: { getItem: k => disk.get(k) ?? null, setItem: (k, v) => disk.set(k, v) } }).useThemePreferences;
  await web.getState().setMode('dark'); const webRestart = load('src/stores/theme-preferences.ts', { 'react-native': { Platform: { OS: 'web' } }, '@/theme/mode': rules },
    { localStorage: { getItem: k => disk.get(k) ?? null, setItem: (k, v) => disk.set(k, v) } }).useThemePreferences;
  await webRestart.getState().load(); assert.equal(webRestart.getState().mode, 'dark', 'Web choices persist without a native Appearance setter');
  await checkUI(preferences, colors);
  console.log('PASS: explicit dark/white/auto themes, live automatic system resolution, native override/reset, persistence/restart, queued saves, read/write/native failures, corrupt-value recovery, web storage and settings selection/feedback. Appearance/storage/UI are mocked.');
}
async function checkUI(preferences, colors) {
  const jsx = (type, props) => ({ type, props });
  const ui = { react: { useEffect() {} }, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { View: 'View', Pressable: 'Button', ActivityIndicator: 'Spinner', StyleSheet: { create: value => value } },
    '@/components/text': { Text: 'Text' }, '@/theme/tokens': colors, '@/stores/theme-preferences': { useThemePreferences: () => preferences.getState() } };
  const { ThemeSettings } = load('src/features/settings/theme-settings.tsx', ui);
  const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
  const buttons = () => nodes(ThemeSettings()).filter(node => node.type === 'Button' && node.props.accessibilityRole === 'radio');
  assert.deepEqual(buttons().map(node => node.props.accessibilityLabel), ['다크 화면 모드', '화이트 화면 모드', '자동 화면 모드']);
  assert.equal(buttons().filter(node => node.props.accessibilityState.checked).length, 1);
  buttons()[0].props.onPress(); await tick(); assert.equal(preferences.getState().mode, 'dark');
  buttons()[1].props.onPress(); await tick(); assert.equal(preferences.getState().mode, 'light');
  buttons()[2].props.onPress(); await tick(); assert.equal(preferences.getState().mode, 'auto');
  preferences.setState({ saving: true }); assert(buttons().every(node => node.props.disabled)); assert(nodes(ThemeSettings()).some(node => node.type === 'Spinner'));
  preferences.setState({ saving: false, loadError: true, error: 'load failed' }); assert(buttons().every(node => node.props.disabled));
  assert(nodes(ThemeSettings()).some(node => node.props.accessibilityRole === 'alert'));
  assert(nodes(ThemeSettings()).some(node => node.type === 'Button' && node.props.accessibilityRole === 'button'));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
