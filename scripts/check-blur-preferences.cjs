/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const { create } = require('zustand');
function load(file, mocks = {}, globals = {}) {
  mocks = { ...require('./test-cloud-fixtures.cjs').cloudFixtures(globals, mocks), ...mocks };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, exports = {};
  new Function('require', 'exports', ...Object.keys(globals), code)(name => {
    if (name === 'zustand') return { create };
    if (name in mocks) return mocks[name]; throw Error('Unexpected blur dependency ' + name);
  }, exports, ...Object.values(globals)); return exports;
}
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
const jsx = (type, props) => ({ type, props });
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const style = value => Object.assign({}, ...[value].flat(Infinity).filter(Boolean));
const blurRules = load('src/features/settings/blur-preferences.ts');
function runtime(os, disk = new Map()) {
  let failRead = false, failWrite = false, gate;
  const storage = {
    getItem: key => { if (failRead) throw Error('read'); return disk.get(key) ?? null; },
    setItem: (key, value) => { if (failWrite) throw Error('write'); disk.set(key, value); },
  };
  const module = load('src/stores/blur-preferences.ts', { 'react-native': { Platform: { OS: os } },
    '@/features/settings/blur-preferences': blurRules,
    'expo-sqlite/kv-store': { __esModule: true, default: { ...storage, setItem: async (...args) => { if (gate) await gate.promise; storage.setItem(...args); } } },
  }, { localStorage: storage });
  return { ...module, disk, failReads: value => { failRead = value; }, failWrites: value => { failWrite = value; }, hold: value => { gate = value; } };
}
async function checkStorage() {
  for (const os of ['android', 'ios', 'web']) {
    const r = runtime(os), state = r.useBlurPreferences.getState;
    await state().load(); assert.equal(state().enabled, true);
    assert.deepEqual(state().areas, blurRules.DEFAULT_BLUR_PREFERENCES.areas);
    await Promise.all([state().setAreaEnabled('libraryMenu', false), state().setIntensity('miniPlayer', 48), state().setIntensity('tabBar', 91)]);
    assert.equal(state().areas.libraryMenu.enabled, false); assert.equal(state().areas.miniPlayer.intensity, 48); assert.equal(state().areas.tabBar.intensity, 91);
    const areas = state().areas;
    await state().setEnabled(false); const restarted = runtime(os, r.disk); await restarted.useBlurPreferences.getState().load();
    assert.equal(restarted.useBlurPreferences.getState().enabled, false, 'Saved-off blur survives restart');
    assert.deepEqual(restarted.useBlurPreferences.getState().areas, areas);
    await state().setEnabled(true); assert.deepEqual(state().areas, areas, 'Master on/off preserves every individual option');
    for (const value of [0, 101, NaN, 4.5, '50']) await assert.rejects(state().setIntensity('tabBar', value));
    assert.deepEqual(state().areas, areas, 'Invalid intensity cannot corrupt saved choices');
    await Promise.all([state().setEnabled(true), state().setEnabled(false)]); assert.equal(state().enabled, false);
    r.failWrites(true); await assert.rejects(state().setEnabled(true)); assert.equal(state().enabled, false); assert.equal(state().saving, false);
    r.failWrites(false); await state().setEnabled(true); assert.equal(state().error, null);
    r.failReads(true); await state().load(true); assert.equal(state().loadError, true); await assert.rejects(state().setEnabled(false));
    r.failReads(false); await state().load(true); assert.equal(state().loadError, false);
    const key = [...r.disk.keys()][0]; r.disk.set(key, 'bad'); await state().load(true); assert.equal(state().loadError, true);
    await assert.rejects(state().setEnabled(false)); assert.equal(r.disk.get(key), 'bad');
    for (const legacy of ['true', 'false']) {
      const old = runtime(os, new Map([[key, legacy]])); await old.useBlurPreferences.getState().load();
      assert.equal(old.useBlurPreferences.getState().enabled, legacy === 'true');
      assert.deepEqual(old.useBlurPreferences.getState().areas, blurRules.DEFAULT_BLUR_PREFERENCES.areas, 'Legacy master flags migrate without losing disabled state');
    }
  }
  for (let mask = 0; mask < 32; mask++) {
    const preferences = blurRules.parseBlurPreferences(!!(mask & 1));
    blurRules.BLUR_AREAS.forEach((area, index) => { preferences.areas[area] = { enabled: !!(mask & (2 << index)), intensity: 20 + index * 10 }; });
    blurRules.BLUR_AREAS.forEach(area => assert.equal(blurRules.blurIntensity(preferences, area), preferences.enabled && preferences.areas[area].enabled ? preferences.areas[area].intensity : 0));
  }
}
async function checkUI() {
  const r = runtime('android'), state = r.useBlurPreferences.getState;
  const useBlurPreferences = select => select ? select(state()) : state();
  const palette = load('src/theme/tokens.ts', { 'react-native': {}, '@/stores/theme-preferences': {}, './mode': {} }).palette;
  let scheme = 'light', cursor = 0; const slots = [];
  const ui = { react: { useEffect: fn => fn(), useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = value; }]; } }, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { View: 'View', Pressable: 'Button', ActivityIndicator: 'Spinner', StyleSheet: { create: value => value, absoluteFill: {} } },
    '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Icon' }, '@/components/text': { Text: 'Text' },
    '@/components/animated-switch': { AnimatedSwitch: 'Switch' }, './settings-menu-layout': { settingsMenuStyles: { row: {}, icon: {} } },
    '@react-native-community/slider': { __esModule: true, default: 'Slider' }, './blur-preferences': blurRules,
    '@/theme/tokens': { useColors: () => palette[scheme], useAppColorScheme: () => scheme },
    '@/stores/blur-preferences': { useBlurPreferences, useBlurIntensity: area => state().ready && !state().loadError ? blurRules.blurIntensity(state(), area) : 0 },
  };
  const Settings = load('src/features/settings/blur-settings.tsx', ui).BlurSettings;
  function expand(tree) {
    if (Array.isArray(tree)) return tree.map(expand);
    if (!tree || typeof tree !== 'object') return tree;
    if (typeof tree.type === 'function') return expand(tree.type(tree.props));
    return { ...tree, props: { ...tree.props, children: expand(tree.props.children) } };
  }
  const render = () => { cursor = 0; return nodes(expand(Settings())); };
  const switchNode = () => render().find(node => node.type === 'Switch');
  assert(switchNode().props.disabled); await flush(); assert(!switchNode().props.disabled);
  const gate = deferred(); r.hold(gate); switchNode().props.onValueChange(false); await flush();
  assert(switchNode().props.busy); assert(!switchNode().props.disabled, 'Saving preserves the enabled switch appearance');
  gate.resolve(); await flush(); r.hold(null); assert.equal(switchNode().props.value, false);
  assert.equal(render().filter(node => node.type === 'Switch').length, 5);
  assert.equal(render().filter(node => node.type === 'Slider').length, 4);
  let sliders = render().filter(node => node.type === 'Slider');
  assert(sliders.every(node => node.props.minimumValue === 1 && node.props.maximumValue === 100));
  sliders[2].props.onValueChange(61); assert.equal(state().areas.miniPlayer.intensity, 75, 'Dragging updates the label without writing on every movement');
  sliders[2].props.onSlidingComplete(61); await flush(); assert.equal(state().areas.miniPlayer.intensity, 61);
  const areaSwitch = render().find(node => node.type === 'Switch' && node.props.accessibilityLabel === '미니 플레이어 블러');
  areaSwitch.props.onValueChange(false); await flush(); assert.equal(state().areas.miniPlayer.enabled, false);
  assert.equal(state().areas.tabBar.enabled, true, 'A local switch never changes other areas');
  await state().setAreaEnabled('miniPlayer', true);
  const gesture = { enabled() { return this; }, activeOffsetY() { return this; }, failOffsetY() { return this; }, failOffsetX() { return this; }, runOnJS() { return this; }, onEnd() { return this; } };
  const opening = [], paused = { queue: [{ id: 'one', title: 'Song', artist: 'Artist' }], index: 0, position: 20, duration: 100, playing: false };
  const usePlaybackStore = selector => selector(paused);
  usePlaybackStore.getState = () => paused;
  const MiniPlayer = load('src/components/mini-player.tsx', { ...ui,
    'expo-blur': { BlurView: 'Blur' }, 'expo-router': { router: { push: route => opening.push(['navigate', route]) } },
    'react-native-reanimated': { __esModule: true, default: { View: 'AnimatedView' }, FadeInDown: { duration: () => ({}) } },
    'react-native-gesture-handler': { Gesture: { Pan: () => gesture }, GestureDetector: 'Gesture' },
    './artwork': { Artwork: 'Artwork' }, './marquee-text': { MarqueeText: 'Marquee' }, '@/services/haptics': { playHaptic() {} },
    '@/services/playback/controller': {}, '@/stores/playback': { usePlaybackStore },
    '@/stores/player-background': { usePlayerBackgroundStore: { getState: () => ({ selectArtwork: (song, options) => opening.push(['prepare', song.id, options]) }) } },
  }).MiniPlayer;
  nodes(MiniPlayer({ blurTarget: { current: null } })).find(node => node.props.accessibilityHint).props.onPress();
  assert.deepEqual(opening, [['prepare', 'one', { immediate: true }], ['navigate', '/player']], 'Paused mini-player prepares the current cover before opening the screen');
  assert.equal(paused.playing, false);
  for (scheme of ['light', 'dark']) for (const enabled of [false, true]) {
    await state().setEnabled(enabled);
    const tree = nodes(MiniPlayer({ blurTarget: { current: null } }));
    assert.equal(tree.some(node => node.type === 'Blur'), enabled);
    if (enabled) assert.equal(tree.find(node => node.type === 'Blur').props.intensity, 61, 'The mini player receives its configured strength');
    assert(tree.some(node => node.type === 'View' && style(node.props.style).backgroundColor === (enabled ? palette[scheme].mini : palette[scheme].surface)));
    assert(tree.some(node => node.type === 'Marquee'), 'Toggling blur retains playback content');
  }
  await state().setAreaEnabled('miniPlayer', false);
  assert(!nodes(MiniPlayer({ blurTarget: { current: null } })).some(node => node.type === 'Blur'), 'An area can be disabled while the master stays enabled');
}
(async () => { await checkStorage(); await checkUI(); console.log('PASS: Android/iOS/web blur defaults, persistence/restart, ordered writes, failure recovery, switch busy appearance, and light/dark mini-player opaque/blurred surfaces. Native rendering/storage are mocked.'); })().catch(error => { console.error(error); process.exitCode = 1; });
