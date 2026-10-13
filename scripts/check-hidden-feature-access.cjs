/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));
const { create } = require(path.join(root, 'node_modules/zustand'));
const { buildLetters, nextBuild } = require('./bump-build-version.cjs');
function load(file, modules) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => { if (name in modules) return modules[name]; throw new Error('Unexpected module: ' + name); }, exports);
  return exports;
}
let stored = null, quickHideStored = null, failRead = false, failWrite = false, releaseWrite, delayedWrite = false, writes = 0;
const storage = {
  getItemAsync: async key => { if (failRead) throw new Error('locked'); return key.includes('quick-hide') ? quickHideStored : stored; },
  setItemAsync: async (_key, value) => {
    writes++;
    if (delayedWrite) await new Promise(resolve => { releaseWrite = resolve; });
    if (failWrite) throw new Error('disk');
    if (_key.includes('quick-hide')) quickHideStored = value;
    else stored = value;
  },
};
function freshStore() {
  return load('src/stores/hidden-feature-access.ts', { zustand: { create }, 'react-native': { Platform: { OS: 'android' } }, 'expo-secure-store': storage }).useHiddenFeatureAccess;
}
async function tap(store, count) { let result; for (let i = 0; i < count; i++) result = await store.getState().tapVersion(); return result; }
const jsx = (type, props) => ({ type, props });
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== 'object') return [];
  return [node, ...nodes(node.props?.children)];
}
async function main() {
  const originalNow = Date.now;
  let now = 100000;
  Date.now = () => now;
  try {
    const store = freshStore();
    assert.equal(store.getState().enabled, false);
    await Promise.all([store.getState().load(), store.getState().load()]);
    assert.equal(store.getState().ready, true);
    assert.equal(await tap(store, 14), null);
    assert.equal(store.getState().enabled, false); assert.equal(writes, 0);
    assert.equal(await tap(store, 1), true); assert.equal(stored, 'true');
    const restarted = freshStore(); await restarted.getState().load();
    assert.equal(restarted.getState().enabled, true);
    assert.equal(await tap(store, 4), null); assert.equal(store.getState().enabled, true);
    assert.equal(await tap(store, 1), false); assert.equal(stored, 'false');
    await tap(store, 14); now += 3001;
    assert.equal(await tap(store, 1), null); assert.equal(store.getState().enabled, false);
    store.getState().resetTaps(); await tap(store, 14);
    store.getState().resetTaps(); assert.equal(await tap(store, 1), null);
    store.getState().resetTaps();
    failWrite = true;
    assert.equal(await tap(store, 15), null); assert.equal(store.getState().enabled, false);
    assert.equal(stored, 'false'); assert.ok(store.getState().error); assert.equal(store.getState().busy, false);
    failWrite = false; delayedWrite = true; await tap(store, 14);
    const pending = tap(store, 1);
    await Promise.resolve(); await Promise.resolve();
    assert.equal(store.getState().busy, true);
    const before = writes; await tap(store, 20); assert.equal(writes, before);
    releaseWrite(); await pending; delayedWrite = false;
    assert.equal(store.getState().enabled, true); assert.equal(store.getState().error, null);
    failRead = true; const unreadable = freshStore(); await unreadable.getState().load();
    assert.equal(unreadable.getState().enabled, false); assert.ok(unreadable.getState().error); failRead = false;

    let cleanup, locked = 0, alerts = 0;
    const hook = () => store.getState();
    const Component = load('src/features/settings/version-settings.tsx', {
      react: { useEffect: () => {}, useCallback: fn => fn }, 'react/jsx-runtime': { jsx, jsxs: jsx },
      'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', Alert: { alert: () => { alerts++; } }, StyleSheet: { create: x => x, hairlineWidth: 1 } },
      'expo-router': { useFocusEffect: fn => { cleanup = fn(); } },
      'expo-constants': { __esModule: true, default: { expoConfig: { version: '1.0.0', extra: { buildVersion: '20261012C' } } } },
      '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Icon' },
      '@/stores/hidden-feature-access': { useHiddenFeatureAccess: hook },
      '@/stores/hidden-music': { useHiddenMusicStore: { getState: () => ({ lock: () => { locked++; } }) } },
      '@/theme/tokens': { useColors: () => ({ text: '#fff', muted: '#aaa', separator: '#333', tint: '#f48' }) },
      './settings-menu-layout': { settingsMenuStyles: { row: {}, icon: {} }, SETTINGS_MENU_ICON_INSET: 17.5 },
    }).VersionSettings;
    const tree = Component();
    assert.ok(nodes(tree).some(node => node.type === 'Text' && node.props.children === '20261012C'));
    const button = nodes(tree).find(node => node.type === 'Pressable');
    assert.equal(button.props.disabled, false);
    await tap(store, 4); cleanup();
    assert.equal(await tap(store, 1), null, 'Leaving settings resets taps');
    await tap(store, 3); button.props.onPress();
    // The native handler intentionally returns void; drain the persistence microtasks.
    for (let i = 0; i < 10; i++) await Promise.resolve();
    assert.equal(store.getState().enabled, false); assert.equal(locked, 1); assert.equal(alerts, 1);
  } finally { Date.now = originalNow; }

  assert.equal(buildLetters(1), 'A'); assert.equal(buildLetters(3), 'C');
  assert.equal(buildLetters(26), 'Z'); assert.equal(buildLetters(27), 'AA'); assert.equal(buildLetters(52), 'AZ');
  assert.throws(() => buildLetters(0));
  assert.deepEqual(nextBuild({ date: '20261012', build: 2 }, new Date('2026-10-12T14:59:59Z')), { date: '20261012', build: 3 });
  assert.deepEqual(nextBuild({ date: '20261012', build: 3 }, new Date('2026-10-12T15:00:00Z')), { date: '20261013', build: 1 });
  assert.throws(() => nextBuild({ date: '20261013', build: 1 }, new Date('2026-10-12T00:00:00Z')), /backwards/);
  const metadata = { date: '20261012', build: 3 };
  const config = load('app.config.ts', { './build-version.json': metadata }).default;
  const base = { version: '1.0.0', extra: { eas: { projectId: 'test' } }, plugins: [] };
  for (let i = 0; i < 3; i++) {
    const resolved = config({ config: base });
    assert.equal(resolved.extra.buildVersion, '20261012C');
    assert.equal(resolved.version, base.version); assert.deepEqual(resolved.extra.eas, base.extra.eas);
  }
  assert.deepEqual(metadata, { date: '20261012', build: 3 }, 'Config evaluation never increments builds');
  console.log('PASS: concealed features default off, 15/5 taps, pause/focus reset, restart persistence, concurrent taps, storage failure, version UI/relocking; Seoul daily A/C/Z/AA build labels and read-only Expo config. Native storage/UI are mocked.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
