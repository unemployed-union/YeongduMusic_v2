/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));
const { create } = require(path.join(root, 'node_modules/zustand'));
const { buildLetters, nextBuild } = require('./bump-build-version.cjs');
function load(file, modules) {
  modules = { '@/components/text': { Text: 'Text' }, ...modules };
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

    let cleanup, locked = 0, alerts = 0, creatorOpen = false;
    const toasts = [];
    const creatorTaps = { current: { count: 0, lastTap: 0 } };
    const hook = () => store.getState();
    const VersionComponent = load('src/features/settings/version-settings.tsx', {
      react: { useEffect: () => {}, useCallback: fn => fn, useState: () => [creatorOpen, value => { creatorOpen = value; }], useRef: () => creatorTaps }, 'react/jsx-runtime': { jsx, jsxs: jsx },
      'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', Alert: { alert: () => { alerts++; } }, StyleSheet: { create: x => x, hairlineWidth: 1 } },
      'expo-router': { useFocusEffect: fn => { cleanup = fn(); } },
      'expo-constants': { __esModule: true, default: { expoConfig: { version: '1.0.0', extra: { buildVersion: '20261012C' } } } },
      '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Icon' },
      '@/stores/hidden-feature-access': { useHiddenFeatureAccess: hook },
      '@/stores/hidden-music': { useHiddenMusicStore: { getState: () => ({ lock: () => { locked++; } }) } },
      '@/theme/tokens': { useColors: () => ({ text: '#fff', muted: '#aaa', separator: '#333', tint: '#f48' }) },
      './settings-menu-layout': { settingsMenuStyles: { row: {}, icon: {} }, SETTINGS_MENU_ICON_INSET: 17.5 },
      './creator-dialog': { CreatorDialog: 'CreatorDialog' },
    }).VersionSettings;
    const Component = () => VersionComponent({ onToast: message => toasts.push(message) });
    const tree = Component();
    assert.ok(nodes(tree).some(node => node.type === 'Text' && node.props.children === '20261012C'));
    const button = nodes(tree).find(node => node.props?.accessibilityLabel === '버전 20261012C 아이콘');
    assert.equal(nodes(tree).filter(node => node.type === 'Pressable').length, 3);
    assert.equal(button.props.children.type, 'Icon', 'Only the version icon handles activation taps');
    assert.equal(nodes(button).some(node => node.type === 'Text'), false, 'The version label and value stay outside the tap area');
    const row = tree.props.children[0], copy = nodes(tree).find(node => node.props?.accessibilityLabel === '버전 20261012C');
    assert.equal(row.props.accessible, false, 'The outer tap area does not group and hide the two accessible controls');
    assert.equal(button.props.accessibilityState.disabled, false);
    await tap(store, 4); cleanup();
    assert.equal(await tap(store, 1), null, 'Leaving settings resets taps');
    let propagationStopped = false;
    await tap(store, 3); button.props.onPress({ stopPropagation() { propagationStopped = true; } });
    // The native handler intentionally returns void; drain the persistence microtasks.
    for (let i = 0; i < 10; i++) await Promise.resolve();
    assert.equal(store.getState().enabled, false); assert.equal(locked, 1); assert.equal(alerts, 0); assert.deepEqual(toasts, ['숨김 설정 닫힘']);
    assert.equal(propagationStopped, true, 'Icon taps do not bubble into the creator trigger');
    for (let i = 0; i < 6; i++) row.props.onPress();
    assert.equal(creatorOpen, false, 'Six taps outside the icon keep the creator dialog closed');
    button.props.onPress({ stopPropagation() {} });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    assert.equal(creatorOpen, false, 'An icon tap is not a seventh creator tap');
    propagationStopped = false;
    copy.props.onPress({ stopPropagation() { propagationStopped = true; } });
    assert.equal(propagationStopped, true, 'A label tap is counted once, not again by the row');
    assert.equal(creatorOpen, true);
    assert.equal(store.getState().enabled, false); assert.equal(alerts, 0, 'Hidden-menu changes never open a native dialog'); assert.deepEqual(toasts, ['숨김 설정 닫힘'], 'Creator taps never announce hidden-menu changes');
    const creator = nodes(Component()).find(node => node.type === 'CreatorDialog'); assert.ok(creator);
    const openRow = Component().props.children[0]; for (let i = 0; i < 10; i++) openRow.props.onPress(); assert.equal(creatorOpen, true, 'Continued taps keep an opened creator message open');
    creator.props.onClose(); assert.equal(creatorOpen, false);
    for (let i = 0; i < 6; i++) row.props.onPress(); now += 3001; row.props.onPress();
    assert.equal(creatorOpen, false, 'A long pause resets the creator count');
    for (let i = 0; i < 6; i++) row.props.onPress(); assert.equal(creatorOpen, true);
    nodes(Component()).find(node => node.type === 'CreatorDialog').props.onClose();
    for (let i = 0; i < 6; i++) row.props.onPress(); cleanup(); row.props.onPress();
    assert.equal(creatorOpen, false, 'Leaving settings resets the creator count and closes its dialog');
    assert.equal(nodes(Component()).some(node => node.type === 'CreatorDialog'), false);
    const beforeBusy = writes; store.setState({ busy: true });
    const busyButton = nodes(Component()).find(node => node.props?.accessibilityLabel === '버전 20261012C 아이콘');
    assert.equal(busyButton.props.accessibilityState.disabled, true); propagationStopped = false;
    busyButton.props.onPress({ stopPropagation() { propagationStopped = true; } });
    assert.equal(propagationStopped, true); assert.equal(writes, beforeBusy); assert.equal(creatorOpen, false);
    store.setState({ busy: false });
    await tap(store, 14); button.props.onPress({ stopPropagation() {} }); for (let i = 0; i < 10; i++) await Promise.resolve();
    assert.equal(store.getState().enabled, true); assert.equal(alerts, 0); assert.deepEqual(toasts, ['숨김 설정 닫힘', '숨김 설정 열림']);
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
  checkCreatorDialog();
  console.log('PASS: concealed features default off, independent icon 15/5 and creator 7 taps, propagation isolation, pause/focus reset, creator photo/message/link/dismissal, restart persistence, concurrent taps, storage failure, version UI/relocking; Seoul build labels and read-only Expo config. Native storage/UI are mocked.');
}
function checkCreatorDialog() {
  let opened, closed = 0;
  const creator = load('src/features/settings/creator-dialog.tsx', {
    react: { useState: () => [null, () => {}] }, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Image: 'Image', Modal: 'Modal', Pressable: 'Button', ScrollView: 'Scroll', View: 'View', StyleSheet: { create: value => value, hairlineWidth: 1 } },
    'expo-linking': { openURL: url => { opened = url; return Promise.resolve(); } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) },
    '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Icon' },
    '@/theme/tokens': { useColors: () => ({}) }, '../../../assets/images/creator-profile.png': 42,
  });
  const tree = creator.CreatorDialog({ onClose: () => { closed++; } });
  assert.equal(opened, undefined, 'Displaying the bundled photo/message never requests GitHub');
  assert.equal(tree.type, 'Modal'); tree.props.onRequestClose(); assert.equal(closed, 1);
  assert.equal(nodes(tree).filter(node => node.type === 'Button' && node.props.accessibilityLabel === '제작자 메시지 닫기').length, 1, 'Only the explicit close icon dismisses the message; there is no tappable backdrop');
  assert.equal(tree.props.children.props.onPress, undefined);
  const image = nodes(tree).find(node => node.type === 'Image'); assert.equal(image.props.source, 42); assert.equal(image.props.resizeMode, 'contain');
  assert(nodes(tree).some(node => node.type === 'Scroll'), 'Long author notes remain scrollable on mobile');
  assert(nodes(tree).some(node => node.type === 'Text' && node.props.children === '제작자'));
  assert(nodes(tree).some(node => node.type === 'Text' && node.props.children === '무직노조(unemployed-union)'));
  assert(nodes(tree).some(node => node.type === 'Text' && node.props.children === creator.CREATOR_MESSAGE));
  assert(creator.CREATOR_MESSAGE.includes('복잡해져서  이 프로젝트'));
  assert(creator.CREATOR_MESSAGE.includes('시험들을 3개를 본 후'));
  assert(!creator.CREATOR_MESSAGE.includes('동시에'));
  assert(creator.CREATOR_MESSAGE.includes('힘듭니다. 고통스러운 하루하루지만 그래도 잘 버텨 봅시다.'));
  assert(creator.CREATOR_MESSAGE.endsWith('2026년 10월 14일 수요일\n오후 4시 50분\n원서 3개 접수한 뒤 기능을 추가하며\n\n'));
  nodes(tree).find(node => node.props?.accessibilityRole === 'link').props.onPress(); assert.equal(opened, 'https://github.com/unemployed-union');
  nodes(tree).find(node => node.type === 'Button' && node.props.accessibilityLabel === '제작자 메시지 닫기').props.onPress(); assert.equal(closed, 2);
  const bytes = fs.readFileSync(path.join(root, 'assets/images/creator-profile.png'));
  assert.equal(require('node:crypto').createHash('sha256').update(bytes).digest('hex'), '9a886981ba4cd339bfa05f472debda1e1ddf655f7551a3595015f8bfdfd89594', 'The user-provided photo is bundled unchanged');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
