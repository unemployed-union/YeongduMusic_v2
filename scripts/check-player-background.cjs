/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(process.argv[2] ?? path.join(__dirname, '..'));
const ts = require(path.join(root, 'node_modules/typescript'));
const timers = new Map();
let nextTimer = 0;
function schedule(callback, delay) { timers.set(++nextTimer, { callback, delay }); return nextTimer; }
function unschedule(id) { timers.delete(id); }
function tick(delay) {
  for (const [id, timer] of [...timers]) {
    if (timer.delay === delay) { timers.delete(id); timer.callback(); }
  }
}
function load(file, resolve) {
  const result = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
  });
  const exports = {};
  new Function('require', 'exports', 'setTimeout', 'clearTimeout', result.outputText)(resolve, exports, schedule, unschedule);
  return exports;
}
const palette = load('src/features/playback/artwork-colors.ts', () => { throw new Error('Unexpected runtime dependency'); });
const layers = load('src/features/playback/background-layers.ts', () => { throw new Error('Unexpected runtime dependency'); });
let available = true;
const requests = [];
const native = { getColors: (uri) => new Promise((resolve, reject) => requests.push({ uri, resolve, reject })) };
const display = require(path.join(root, 'node_modules/zustand')).create(() => ({ hideArtwork: false, ready: true }));
let appStateListener;
const appState = { currentState: 'active', addEventListener: (_, callback) => { appStateListener = callback; return { remove() {} }; } };
function changeAppState(state) { appState.currentState = state; appStateListener(state); }
const { usePlayerBackgroundStore: store } = load('src/stores/player-background.ts', (name) => {
  if (name === 'react-native') return { AppState: appState };
  if (name === './display-preferences') return { useDisplayPreferences: display };
  if (name === 'zustand') return require(path.join(root, 'node_modules/zustand'));
  if (name === 'expo') return { requireOptionalNativeModule: () => available ? native : null };
  if (name === '@/features/playback/artwork-colors') return palette;
  throw new Error('Unexpected runtime dependency ' + name);
});
const defaults = palette.DEFAULT_PLAYER_COLORS;
const result = (color) => ({ platform: 'android', dominant: color, vibrant: color, muted: color });
const red = palette.gradientFromImageColors(result('#FF0000'));
const blue = palette.gradientFromImageColors(result('#0000FF'));
const green = palette.gradientFromImageColors(result('#00FF00'));
const song = (id) => ({ id, title: id, artist: 'Demo', album: 'Demo', duration: 20, artworkUrl: 'mock:' + id });
const select = (id) => store.getState().selectArtwork(song(id));
const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
async function start(id) { select(id); tick(120); await flush(); return requests.at(-1); }

function checkBackgroundRendering() {
  const slots = [], effects = [], animationCallbacks = [], rnTasks = [];
  let cursor = 0, dirty = false, timingCount = 0;
  const jsx = (type, props, key) => ({ type, props, key });
  const { PlayerBackground } = load('src/features/playback/player-background.tsx', name => {
    const modules = {
      react: {
        useCallback: fn => fn, useEffect: fn => effects.push(fn),
        useState: initial => {
          const index = cursor++; if (!(index in slots)) slots[index] = initial;
          return [slots[index], next => { slots[index] = next; dirty = true; }];
        },
        useReducer: (reducer, initial, init) => {
          const index = cursor++; if (!(index in slots)) slots[index] = init(initial);
          return [slots[index], action => { slots[index] = reducer(slots[index], action); dirty = true; }];
        },
      },
      'react/jsx-runtime': { jsx, jsxs: jsx },
      'react-native': { View: 'View', StyleSheet: { absoluteFill: {} } },
      'expo-linear-gradient': { LinearGradient: 'Gradient' },
      'react-native-reanimated': { __esModule: true, default: { View: 'AnimatedView' },
        useSharedValue: initial => ({ value: initial, get() { return this.value; }, set(value) { this.value = value; } }),
        useAnimatedStyle: fn => fn(), cancelAnimation() {}, Easing: { inOut: value => value, cubic: 'cubic' },
        withTiming: (to, options, callback) => { timingCount++; animationCallbacks.push(callback); return { to, options }; },
      },
      'react-native-worklets': { scheduleOnRN: (fn, ...args) => rnTasks.push(() => fn(...args)) },
      './background-layers': layers,
    };
    assert(name in modules, name); return modules[name];
  });
  const render = (colors, active = true) => {
    let tree, passes = 0;
    do { dirty = false; cursor = 0; tree = PlayerBackground({ colors, active }); assert(++passes < 8); } while (dirty);
    return tree;
  };
  const renderFreshLayer = node => { effects.length = 0; const tree = node.type(node.props); effects.splice(0).forEach(effect => effect()); return tree; };
  let tree = render(red);
  assert.equal(renderFreshLayer(tree.props.children[0]).props.style[1].opacity, 1);
  tree = render(blue);
  const transitioning = tree.props.children.at(-1);
  renderFreshLayer(transitioning); assert.equal(timingCount, 1);
  tree = render(blue, false);
  assert.equal(tree.props.children.length, 1, 'Locking settles an interrupted crossfade to one opaque background');
  renderFreshLayer(tree.props.children[0]); assert.equal(timingCount, 1, 'The locked background has no continuing UI animation');
  tree = render(green, false);
  assert.equal(tree.props.children[0].props.layer.animate, false, 'Screen-off color changes do not start a transparent layer');
  const lockedKey = tree.props.children[0].key;
  tree = render(green, true);
  const restored = tree.props.children[0];
  assert.notEqual(restored.key, lockedKey, 'Resume recreates the native gradient even without a new color request');
  assert.deepEqual(restored.props.layer.colors, green);
  assert.equal(renderFreshLayer(restored).props.style[1].opacity, 1, 'Resume is opaque on the first frame');
  assert.equal(tree.props.style[1].backgroundColor, green[0], 'An opaque backing color prevents a transparent hole if the gradient redraw is delayed');
  animationCallbacks[0](true); rnTasks.splice(0).forEach(task => task());
  tree = render(green);
  assert.equal(tree.props.children[0].key, restored.key, 'A pre-lock completion cannot remove the restored native layer');
  assert.equal(tree.props.children[0].props.layer.animate, false);
  tree = render(red); const complete = tree.props.children.at(-1);
  complete.props.onComplete(complete.props.layer.id); tree = render(red);
  assert.equal(renderFreshLayer(tree.props.children[0]).props.style[1].opacity, 1, 'Completed backgrounds remain opaque on native remount');
  assert.equal(timingCount, 1, 'Restore and completed-layer remounts never restart the fade');
}

async function check() {
  checkBackgroundRendering();
  const first = await start('a');
  first.resolve(result('#FF0000')); await flush();
  assert.deepEqual(store.getState().colors, red);
  const recorded = [];
  const unsubscribe = store.subscribe((state) => recorded.push(state.colors));
  unsubscribe(); // Closing a screen unsubscribes, rather than clearing global playback colors.
  const reopened = layers.initialBackgroundLayers(store.getState().colors);
  assert.deepEqual(reopened[0].colors, red);
  assert.equal(reopened[0].animate, false, 'Reopening uses an opaque current palette, without a default-color fade');
  select('a'); tick(120); await flush();
  assert.equal(requests.length, 1, 'Reopening the same artwork does not redownload it');

  const unwatch = store.subscribe((state) => recorded.push(state.colors));
  const second = await start('b');
  assert.deepEqual(store.getState().colors, red, 'Loading the next image retains the visible colors');
  second.resolve(result('#0000FF')); await flush();
  assert.deepEqual(store.getState().colors, blue);
  assert.equal(recorded.some((colors) => colors === defaults), false, 'No intermediate default palette while changing songs');
  unwatch();

  let stack = layers.initialBackgroundLayers(red);
  const base = stack[0];
  stack = layers.backgroundLayers(stack, { type: 'target', colors: blue });
  const previousTarget = stack[1];
  assert.equal(stack[0], base, 'A new target never resets the existing visible layer');
  assert.equal(previousTarget.animate, true);
  stack = layers.backgroundLayers(stack, { type: 'target', colors: green });
  assert.equal(stack[1], previousTarget, 'Rapid changes retain intermediate layer identity/opacity');
  const pendingStack = stack;
  stack = layers.backgroundLayers(stack, { type: 'complete', id: previousTarget.id });
  assert.equal(stack, pendingStack, 'Old completion cannot remove the newest transition');
  const latest = stack.at(-1);
  stack = layers.backgroundLayers(stack, { type: 'complete', id: latest.id });
  assert.deepEqual(stack, [{ ...latest, animate: false }]);
  assert.equal(stack[0].id, latest.id, 'Pruning retains the native top layer key');
  assert.equal(stack[0].animate, false, 'A completed layer stays opaque even if its native animation state is recreated');
  assert.equal(layers.backgroundLayers(stack, { type: 'target', colors: [...green] }), stack, 'Identical palettes do not restart an animation');

  const old = await start('old');
  const current = await start('current');
  current.resolve(result('#00FF00')); await flush();
  old.resolve(result('#FF0000')); await flush();
  assert.deepEqual(store.getState().colors, green, 'Late old response never recolors the current song');
  const beforeCacheHit = requests.length;
  select('b');
  assert.deepEqual(store.getState().colors, blue, 'Previously resolved artwork restores synchronously');
  tick(120); await flush();
  assert.equal(requests.length, beforeCacheHit);

  store.getState().reset();
  const x = await start('x');
  const y = await start('y');
  const beforeDedup = requests.length;
  await start('x');
  assert.equal(requests.length, beforeDedup, 'A pending artwork request is shared across selections');
  x.resolve(result('#FF0000')); await flush();
  y.resolve(result('#0000FF')); await flush();
  assert.deepEqual(store.getState().colors, red);

  const outstanding = await start('logout');
  store.getState().reset();
  outstanding.resolve(result('#00FF00')); await flush();
  assert.deepEqual(store.getState().colors, defaults, 'Logout discards late session results');
  const beforeResetReload = requests.length;
  const reload = await start('logout');
  assert.equal(requests.length, beforeResetReload + 1, 'Session reset removes the palette cache');
  reload.reject(new Error('Image unavailable')); await flush();
  assert.deepEqual(store.getState().colors, defaults);

  const slow = await start('timeout');
  tick(8000); await flush();
  slow.resolve(result('#FF0000')); await flush();
  assert.deepEqual(store.getState().colors, defaults, 'Timed out extraction cannot apply a late palette');
  available = false;
  await start('old-native-build');
  assert.deepEqual(store.getState().colors, defaults);
  store.getState().selectArtwork({ ...song('mock'), artworkUrl: undefined, palette: ['#FF0000', '#FF0000'] });
  assert.deepEqual(store.getState().colors, red, 'Mock palettes remain immediate without native extraction');
  available = true;

  store.getState().reset();
  for (let i = 0; i < 25; i++) {
    const request = await start('bounded-' + i);
    request.resolve(result('#0000FF')); await flush();
  }
  const beforeEviction = requests.length;
  const evicted = await start('bounded-0');
  assert.equal(requests.length, beforeEviction + 1, 'Cache is bounded to 24 entries');
  evicted.resolve(result('#0000FF')); await flush();
  store.getState().reset();
  assert.equal(timers.size, 0);
  const hideRequest = await start('hide-pending');
  display.setState({ hideArtwork: true });
  assert.deepEqual(store.getState().colors, defaults);
  hideRequest.resolve(result('#FF0000')); await flush();
  assert.deepEqual(store.getState().colors, defaults, 'Hiding artwork invalidates pending color results');
  const beforeHidden = requests.length;
  select('hidden-next'); tick(120); await flush();
  assert.equal(requests.length, beforeHidden, 'No image extraction while artwork is hidden');
  display.setState({ hideArtwork: false }); tick(120); await flush();
  assert.equal(requests.length, beforeHidden + 1, 'Showing artwork restores the current selection');
  requests.at(-1).resolve(result('#0000FF')); await flush();
  assert.deepEqual(store.getState().colors, blue);
  store.getState().reset();
  const backgroundCount = requests.length;
  changeAppState('background');
  select('screen-off-a'); select('screen-off-b'); tick(120); await flush();
  assert.equal(requests.length, backgroundCount, 'Screen-off track changes never download or decode artwork for UI colors');
  changeAppState('active'); tick(120); await flush();
  assert.equal(requests.length, backgroundCount + 1);
  assert.equal(requests.at(-1).uri, 'mock:screen-off-b', 'Foreground resume prepares only the latest track');
  requests.at(-1).resolve(result('#FF0000')); await flush();
  assert.deepEqual(store.getState().colors, red);
  select('cancel-before-extraction'); changeAppState('inactive'); tick(120); await flush();
  assert.equal(requests.length, backgroundCount + 1, 'A queued visual extraction is canceled on backgrounding');
  changeAppState('active'); tick(120); await flush();
  requests.at(-1).resolve(result('#0000FF')); await flush();
  store.getState().reset();
  const beforeOpen = requests.length;
  select('paused-open');
  assert.equal(requests.length, beforeOpen);
  store.getState().selectArtwork(song('paused-open'), { immediate: true });
  await flush();
  assert.equal(requests.length, beforeOpen + 1, 'Opening a paused player starts palette preparation without waiting for playback or the debounce');
  store.getState().selectArtwork(song('paused-open'), { immediate: true });
  tick(120); await flush();
  assert.equal(requests.length, beforeOpen + 1, 'Focus and navigation share the same in-flight extraction');
  requests.at(-1).resolve(result('#FF0000')); await flush();
  const other = await start('another-paused-cover');
  other.resolve(result('#0000FF')); await flush();
  store.getState().selectArtwork(song('paused-open'), { immediate: true });
  assert.deepEqual(layers.initialBackgroundLayers(store.getState().colors)[0], { id: 0, colors: red, animate: false }, 'Cached colors are opaque on the first player frame');
  changeAppState('background');
  store.getState().selectArtwork(song('background-open'), { immediate: true });
  await flush();
  assert.equal(requests.length, beforeOpen + 2, 'Immediate preparation still respects the background energy guard');
  store.getState().reset();
  changeAppState('active');
  console.log('PASS: interrupted crossfade/lock recovery, opaque first resume frame and completed-layer remount, stale animation callbacks, foreground-only palette downloads, latest-track resume, cache limits and stale-result guards. Native gradient rendering, image extraction and UI-thread animation are mocked.');
}
check().catch((error) => { console.error(error); process.exitCode = 1; });
