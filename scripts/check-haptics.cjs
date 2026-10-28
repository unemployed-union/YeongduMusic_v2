/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const { create } = require('zustand');
function load(file, mocks = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, exports = {};
  new Function('require', 'exports', ...Object.keys(globals), code)(name => {
    if (name === 'zustand') return { create };
    if (name in mocks) return mocks[name];
    if (name === '@/services/preferences/persistence') return require('./test-source-loader.cjs').loadSource('src/services/preferences/persistence.ts', mocks, globals);
    throw Error('Unexpected dependency ' + name);
  }, exports, ...Object.values(globals));
  return exports;
}
const rules = load('src/features/haptics/preferences.ts');
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const freshPreferences = () => rules.parseHapticPreferences(rules.DEFAULT_HAPTIC_PREFERENCES);
function storageRuntime(platform = 'android', disk = new Map()) {
  let failRead = false, failWrite = false, reads = 0;
  const storage = { getItem: async key => { reads++; if (failRead) throw Error('read'); return disk.get(key) ?? null; },
    setItem: async (key, value) => { if (failWrite) throw Error('write'); disk.set(key, value); } };
  const store = load('src/stores/haptic-preferences.ts', { 'react-native': { Platform: { OS: platform } }, '@/features/haptics/preferences': rules,
    'expo-sqlite/kv-store': { __esModule: true, default: storage } }, { localStorage: {
    getItem: key => { reads++; if (failRead) throw Error('read'); return disk.get(key) ?? null; },
    setItem: (key, value) => { if (failWrite) throw Error('write'); disk.set(key, value); },
  } }).useHapticPreferences;
  return { store, disk, reads: () => reads, failReads: value => { failRead = value; }, failWrites: value => { failWrite = value; } };
}
async function checkStorage() {
  for (const platform of ['android', 'ios', 'web']) {
    const r = storageRuntime(platform), state = () => r.store.getState();
    await Promise.all([state().load(), state().load()]); assert.equal(r.reads(), 1); assert.equal(state().preferences.events.longPress.strength, 'medium');
    await Promise.all([state().setEvent('longPress', { strength: 'heavy' }), state().setEvent('menu', { enabled: false }), state().setEnabled(false)]);
    assert.equal(state().preferences.events.longPress.strength, 'heavy'); assert.equal(state().preferences.events.menu.enabled, false); assert.equal(state().preferences.enabled, false);
    const restarted = storageRuntime(platform, r.disk).store; await restarted.getState().load(); assert.deepEqual(restarted.getState().preferences, state().preferences);
    await state().setEnabled(true); assert.equal(state().preferences.events.menu.enabled, false, 'Master switch retains per-event preferences');
    const previous = state().preferences; r.failWrites(true); await assert.rejects(state().setEvent('longPress', { strength: 'light' }), /저장/); assert.deepEqual(state().preferences, previous); assert.equal(state().saving, false);
    r.failWrites(false); await state().setEvent('longPress', { strength: 'light' }); assert.equal(state().error, null);
    r.disk.set('yeongdumusic-haptics-v1', '{bad'); await state().load(true); assert.equal(state().loadError, true);
    await assert.rejects(state().setEnabled(false), /다시 불러/); assert.equal(r.disk.get('yeongdumusic-haptics-v1'), '{bad');
    r.disk.delete('yeongdumusic-haptics-v1'); await state().load(true); assert.equal(state().loadError, false);
    r.failReads(true); await state().load(true); assert.equal(state().loadError, true); r.failReads(false); await state().load(true);
    const invalid = freshPreferences(); invalid.events.seek.strength = 'invalid'; assert.throws(() => rules.parseHapticPreferences(invalid));
    assert.throws(() => rules.parseHapticPreferences({ enabled: true, events: [] }));
  }
}
async function checkFeedback() {
  const r = storageRuntime(); await r.store.getState().load(); let now = 1000, failNative = false;
  const calls = [], module = { __esModule: true, ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' }, impactAsync: async style => { if (failNative) throw Error('unsupported'); calls.push(style); } };
  const api = load('src/services/haptics.ts', { '@/stores/haptic-preferences': { useHapticPreferences: r.store }, 'expo-haptics': module }, { Date: { now: () => now } });
  api.prepareHaptics(); await flush(); assert.deepEqual(calls, [], 'Loading settings/module does not vibrate');
  for (const kind of rules.HAPTIC_EVENTS.map(item => item.id)) {
    for (const strength of ['light', 'medium', 'heavy']) {
      now += 100; await r.store.getState().setEvent(kind, { strength }); api.playHaptic(kind); await flush(); assert.equal(calls.at(-1), strength);
    }
    await r.store.getState().setEvent(kind, { enabled: false }); now += 100; const before = calls.length; api.playHaptic(kind); await flush(); assert.equal(calls.length, before);
    await r.store.getState().setEvent(kind, { enabled: true });
  }
  await r.store.getState().setEnabled(false); let before = calls.length; now += 100; api.playHaptic('longPress'); await flush(); assert.equal(calls.length, before);
  await r.store.getState().setEnabled(true); now += 100; api.playHaptic('longPress'); api.playHaptic('longPress'); await flush(); assert.equal(calls.length, before + 1, 'Rapid duplicate callbacks do not double vibrate');
  now += 100; before = calls.length; api.playHaptic('menu');
  r.store.setState({ preferences: { ...r.store.getState().preferences, enabled: false } }); await flush(); assert.equal(calls.length, before, 'A pending native import rechecks a newly disabled master switch');
  r.store.setState({ preferences: freshPreferences(), loadError: true }); now += 100; api.playHaptic('seek'); await flush(); assert.equal(calls.length, before);
  r.store.setState({ loadError: false, ready: false }); api.playHaptic('seek'); await flush(); assert.equal(calls.length, before, 'Do not replay taps later while settings are not loaded');
  r.store.setState({ ready: true }); failNative = true; now += 100; assert.doesNotThrow(() => api.playHaptic('seek')); await flush(); assert.equal(calls.length, before);
  const unavailable = load('src/services/haptics.ts', { '@/stores/haptic-preferences': { useHapticPreferences: r.store } });
  assert.doesNotThrow(() => unavailable.prepareHaptics()); unavailable.playHaptic('menu'); await flush();
}
const jsx = (type, props) => ({ type, props });
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const native = { View: 'View', Pressable: 'Button', ScrollView: 'Scroll', Modal: 'Modal', ActivityIndicator: 'Spinner', Platform: { OS: 'android' },
  StyleSheet: { create: value => value, absoluteFill: {} }, useWindowDimensions: () => ({ width: 390, height: 800 }) };
function checkUI() {
  const calls = [], colors = { text: '#111111', muted: '#555555', tint: '#CC3355', separator: '#E5E5E5', surface: '#FFFFFF' };
  const ui = { 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native, '@/components/text': { Text: 'Text' }, './text': { Text: 'Text' },
    '@/theme/liquid-glass': { useLiquidGlass: () => ({ supported: false, enabled: false }) },
    './glass-backdrop': { GlassBackdrop: 'GlassBackdrop' },
    '@/theme/tokens': { useColors: () => colors, useAppColorScheme: () => 'light' }, '@/services/haptics': { playHaptic: kind => calls.push(kind) }, '@expo/vector-icons/Ionicons': 'Icon',
    'expo-blur': { BlurView: 'BlurView' }, './screen-blur-target': { ScreenBlurTargetContext: {} },
    '@/stores/blur-preferences': { useBlurIntensity: () => 32 },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: 20, left: 0 }) },
    './favorite-button': { FavoriteButton: 'FavoriteButton' },
    './action-menu-position': load('src/components/action-menu-position.ts') };
  const Switch = load('src/components/animated-switch.tsx', { ...ui, react: { useEffect() {} }, 'react-native-reanimated': {
    __esModule: true, default: { View: 'AnimatedView' }, ReduceMotion: { System: 'system' },
    useSharedValue: value => ({ value }), useAnimatedStyle: callback => callback(), withTiming: value => value,
    interpolateColor: (value, _range, choices) => choices[value],
  } }).AnimatedSwitch;
  let changed;
  Switch({ value: false, onValueChange: value => { changed = value; } }).props.onPress();
  assert.equal(changed, true); assert.equal(calls.at(-1), 'selection');
  const switchCount = calls.length;
  Switch({ value: false, disabled: true, onValueChange: () => { throw Error('disabled'); } }).props.onPress();
  Switch({ value: false, haptics: false, onValueChange: value => { changed = value; } }).props.onPress();
  assert.equal(calls.length, switchCount, 'Disabled and opted-out switches never emit haptics');
  calls.length = 0;
  let opened = null;
  const Row = load('src/components/song-row.tsx', { ...ui, react: { useState: () => [opened, value => { opened = value; }] },
    './artwork': { Artwork: 'Artwork' }, '@/features/library/song-properties': { SongProperties: 'Properties' } }).SongRow;
  const render = () => nodes(Row({ song: { id: 'one', title: 'Song', artist: 'Artist', album: 'Album' }, onPress() {} }));
  const event = { nativeEvent: { pageX: 150, pageY: 300 } };
  render().find(node => node.props.onLongPress).props.onLongPress(event); assert.deepEqual(opened, { x: 150, y: 300 }); assert.deepEqual(calls, ['longPress']); assert(render().some(node => node.type === 'Properties'));
  render().find(node => node.props.accessibilityLabel === 'Song 메뉴').props.onPress(event); assert.equal(calls.at(-1), 'menu');
  let selected;
  const Menu = load('src/components/action-menu.tsx', { ...ui, react: { useContext: () => undefined, useState: initial => [initial, () => {}] } }).ActionMenu;
  const menu = nodes(Menu({ title: 'Actions', anchor: { x: 150, y: 300 }, visible: true, items: [{ id: 'edit', label: 'Edit', icon: 'pencil' }, { id: 'blocked', label: 'Blocked', icon: 'close', disabled: true }], onSelect: value => { selected = value; }, onClose() {} }));
  const options = menu.filter(node => node.type === 'Button' && node.props.accessibilityState);
  options[0].props.onPress(); assert.equal(selected, 'edit'); assert.equal(calls.at(-1), 'selection'); const count = calls.length; options[1].props.onPress(); assert.equal(calls.length, count);
  const preference = freshPreferences(), changes = [];
  const state = { preferences: preference, ready: true, loading: false, saving: false, loadError: false, load() {},
    setEvent: async (kind, change) => changes.push([kind, change]), setEnabled: async () => {} };
  const Settings = load('src/features/haptics/haptic-settings.tsx', { ...ui, react: { useEffect() {} }, './preferences': rules,
    '@/components/animated-switch': { AnimatedSwitch: 'Switch' }, '@/features/settings/settings-ui': { SettingsSection: 'Section' }, '@/stores/haptic-preferences': { useHapticPreferences: () => state } }).HapticSettings;
  const settings = () => nodes(Settings());
  assert.equal(settings().filter(node => node.type === 'Switch').length, 6); assert(settings().filter(node => node.type === 'Switch').every(node => node.props.haptics === false));
  const strengthOpacity = () => settings().filter(node => node.props.accessibilityRole === 'radio').map(node => node.props.style[1].opacity);
  const beforeSaving = strengthOpacity(); state.saving = true;
  assert(settings().filter(node => node.type === 'Switch').every(node => node.props.busy));
  assert(settings().filter(node => node.props.accessibilityRole === 'radio').every(node => node.props.disabled));
  assert.deepEqual(strengthOpacity(), beforeSaving, 'Haptic strength controls keep their appearance while saving');
  state.saving = false;
  for (const event of rules.HAPTIC_EVENTS) {
    settings().find(node => node.props.accessibilityLabel === `${event.title} 햅틱 강도 강`).props.onPress(); assert.deepEqual(changes.at(-1), [event.id, { strength: 'heavy' }]);
    settings().find(node => node.props.accessibilityLabel === `${event.title} 햅틱 테스트`).props.onPress(); assert.equal(calls.at(-1), event.id);
  }
  preference.events.longPress.enabled = false; assert.equal(settings().find(node => node.props.accessibilityLabel === '길게 누르기 햅틱 테스트').props.disabled, true);
  preference.enabled = false; assert(settings().filter(node => node.props.accessibilityRole === 'radio').every(node => node.props.disabled));
}
(async () => { await checkStorage(); await checkFeedback(); checkUI(); console.log('PASS: native/web persistent per-event haptics and strength, master switch, ordered writes/restart/corruption/failure protection, duplicate and late feedback guards, unavailable native modules, long-press/menu/selection wiring and individual settings/test buttons. Native vibration/storage are mocked.'); })()
  .catch(error => { console.error(error); process.exitCode = 1; });
