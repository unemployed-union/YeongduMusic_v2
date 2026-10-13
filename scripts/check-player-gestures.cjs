const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..');
const staged = process.argv[3];
const projectRequire = createRequire(path.join(root, 'package.json'));
const ts = projectRequire('typescript');
function load(file, overrides) {
  overrides = { ...require('./test-cloud-fixtures.cjs').cloudFixtures({}, overrides), ...overrides };
  const stagedFile = staged && path.join(staged, path.basename(file));
  const source = fs.readFileSync(stagedFile && fs.existsSync(stagedFile) ? stagedFile : path.join(root, file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => name in overrides ? overrides[name] : projectRequire(name), mod, mod.exports);
  return mod.exports;
}
function shared(value) {
  return {
    value, animation: null, get() { return this.value; },
    set(next) {
      if (this.animation) { const previous = this.animation; this.animation = null; previous.callback?.(false); }
      if (next && next.animation) this.animation = next;
      else this.value = next;
    },
    finish() { const animation = this.animation; this.animation = null; if (animation) { this.value = animation.value; animation.callback?.(true); } },
  };
}
function environment() {
  const effects = [], cleanup = [], rnTasks = [], values = [];
  let focused, back, removed = 0;
  const pan = () => {
    const gesture = { options: {}, handlers: {} };
    for (const name of ['activeOffsetX', 'activeOffsetY', 'failOffsetX', 'failOffsetY']) gesture[name] = value => { gesture.options[name] = value; return gesture; };
    for (const name of ['onStart', 'onUpdate', 'onEnd', 'onFinalize']) gesture[name] = value => { gesture.handlers[name] = value; return gesture; };
    return gesture;
  };
  const modules = {
    react: { useCallback: fn => fn, useMemo: fn => fn(), useRef: value => ({ current: value }), useEffect: fn => effects.push(fn) },
    'expo-router': { useFocusEffect: fn => { focused = fn; } },
    'react-native': { BackHandler: { addEventListener: (event, listener) => {
      assert.equal(event, 'hardwareBackPress'); back = listener;
      return { remove: () => { back = null; removed++; } };
    } } },
    'react-native-gesture-handler': { Gesture: { Pan: pan } },
    'react-native-reanimated': {
      useSharedValue: value => { const item = shared(value); values.push(item); return item; },
      useAnimatedStyle: fn => fn,
      withTiming: (value, config, callback) => ({ animation: true, value, config, callback }),
      withSpring: (value, config) => ({ animation: true, value, config }),
      cancelAnimation: item => { const animation = item.animation; item.animation = null; animation?.callback?.(false); },
    },
    'react-native-worklets': { scheduleOnRN: (fn, ...args) => rnTasks.push(() => fn(...args)) },
  };
  return {
    modules, values, rnTasks, get back() { return back; }, get removed() { return removed; },
    mount() { for (const effect of effects) { const fn = effect(); if (fn) cleanup.push(fn); } },
    focus() { return focused(); }, unmount() { for (const fn of cleanup) fn(); },
  };
}
async function main() {
  let dismissals = 0;
  const env = environment();
  const { usePlayerDismiss } = load('src/features/playback/use-player-dismiss.ts', env.modules);
  const dismiss = usePlayerDismiss(900, () => { dismissals++; }); env.mount(); const blur = env.focus();
  env.values[0].finish(); assert.equal(dismiss.ready.get(), true);
  assert.equal(env.back(), true); assert.equal(dismiss.closing.get(), true);
  assert.equal(env.values[0].animation.value, 900); assert.equal(env.values[0].animation.config.duration, 230);
  assert.equal(dismissals, 0, 'Back must wait for the downward animation');
  const animation = env.values[0].animation; assert.equal(env.back(), true); assert.equal(env.values[0].animation, animation);
  env.values[0].finish(); await env.rnTasks.shift()(); assert.equal(dismissals, 1);
  blur(); assert.equal(env.back, null); assert.equal(env.removed, 1); env.unmount();

  const cancelled = environment();
  const cancelDismiss = load('src/features/playback/use-player-dismiss.ts', cancelled.modules).usePlayerDismiss(900, () => { dismissals++; });
  cancelled.mount(); const unfocus = cancelled.focus(); cancelled.values[0].finish(); cancelDismiss.close(); cancelled.unmount();
  assert.equal(cancelled.values[0].animation, null); assert.equal(cancelled.rnTasks.length, 0); unfocus();

  const drag = environment();
  const dragDismiss = load('src/features/playback/use-player-dismiss.ts', drag.modules).usePlayerDismiss(900, () => {});
  drag.mount(); drag.values[0].finish();
  dragDismiss.gesture.handlers.onUpdate({ translationY: 75 });
  assert.equal(dragDismiss.animatedStyle().transform[0].translateY, 75);
  dragDismiss.gesture.handlers.onEnd({ translationY: 75, velocityY: 0 });
  assert.equal(dragDismiss.closing.get(), false); dragDismiss.gesture.handlers.onFinalize(); drag.values[0].finish();
  assert.equal(dragDismiss.animatedStyle().transform[0].translateY, 0);
  dragDismiss.gesture.handlers.onEnd({ translationY: 170, velocityY: 0 }); assert.equal(dragDismiss.closing.get(), true); drag.unmount();
  console.log('PASS: focused Android back animates before dismissing, repeated back is consumed, blur/unmount cleanup, vertical drag and snap-back.');

  const swipeEnv = environment(); const ready = shared(true), closing = shared(false), commands = [];
  let finishTrack;
  const { useArtworkSwipe } = load('src/features/playback/use-artwork-swipe.ts', swipeEnv.modules);
  const swipe = useArtworkSwipe(320, ready, closing, direction => {
    commands.push(direction); return new Promise(resolve => { finishTrack = resolve; });
  }); swipeEnv.mount();
  const events = swipe.gesture.handlers;
  events.onUpdate({ translationX: -47 }); assert.equal(swipe.animatedStyle().transform[0].translateX, -47);
  events.onEnd({ translationX: -47, velocityX: 0 }, true); assert.equal(swipeEnv.rnTasks.length, 0);
  events.onFinalize(); swipeEnv.values[0].finish(); assert.equal(swipe.animatedStyle().transform[0].translateX, 0);
  events.onUpdate({ translationX: -110 }); events.onEnd({ translationX: -110, velocityX: 0 }, true);
  assert.equal(swipeEnv.rnTasks.length, 1);
  events.onEnd({ translationX: -120, velocityX: 0 }, true); assert.equal(swipeEnv.rnTasks.length, 1, 'One gesture must not skip multiple tracks');
  const first = swipeEnv.rnTasks.shift()(); assert.deepEqual(commands, ['next']);
  events.onFinalize(); swipeEnv.values[0].finish(); finishTrack(); await first;
  events.onEnd({ translationX: 30, velocityX: 900 }, true);
  const second = swipeEnv.rnTasks.shift()(); assert.deepEqual(commands, ['next', 'previous']); finishTrack(); await second;
  events.onEnd({ translationX: 30, velocityX: -900 }, true); assert.equal(swipeEnv.rnTasks.length, 0, 'Reverse velocity is not a forward flick');
  events.onEnd({ translationX: 100, velocityX: 0 }, false); assert.equal(swipeEnv.rnTasks.length, 0);
  ready.set(false); events.onUpdate({ translationX: 60 }); assert.equal(swipe.animatedStyle().transform[0].translateX, 0);
  events.onEnd({ translationX: 100, velocityX: 0 }, true); assert.equal(swipeEnv.rnTasks.length, 0); ready.set(true);
  events.onEnd({ translationX: -100, velocityX: 0 }, true); closing.set(true);
  await swipeEnv.rnTasks.shift()(); assert.equal(commands.length, 2, 'Queued track changes must be ignored while closing'); closing.set(false);
  events.onEnd({ translationX: -100, velocityX: 0 }, true); swipeEnv.unmount();
  await swipeEnv.rnTasks.shift()(); assert.equal(commands.length, 2, 'Unmounted players must not execute queued gestures');
  console.log('PASS: artwork tracks finger position, threshold/flick navigation, short/cancelled drags, snap-back, duplicate suppression and closing/unmount guards.');

  const { create } = projectRequire('zustand');
  const rules = load('src/features/hidden-music/rules.ts', {});
  const playback = load('src/stores/playback.ts', {}).usePlaybackStore;
  const privacy = create(() => ({ ready: true, scope: 'demo', profile: rules.emptyProfile() }));
  const loads = [], seeks = [];
  class Engine {
    subscribe() {} subscribeRemoteNavigation() {} async load(_, song) { loads.push(song.id); }
    async seek(seconds) { seeks.push(seconds); } pause() {} release() {}
  }
  const controller = load('src/services/playback/controller.ts', {
    './audio-engine': { ExpoAudioEngine: Engine }, '@/services/synology/api': {},
    '@/features/library/repository': { musicRepository: () => ({ streamSource: async () => ({ uri: 'https://example.invalid' }) }) },
    '@/stores/auth': { useAuthStore: { getState: () => ({ mode: 'mock', session: null }) } },
    '@/stores/playback': { usePlaybackStore: playback }, '@/stores/hidden-music': { useHiddenMusicStore: privacy },
    '@/features/hidden-music/rules': rules,
    '@/stores/player-background': { usePlayerBackgroundStore: { getState: () => ({ selectArtwork() {}, reset() {} }) } },
  });
  const songs = ['first', 'second'].map(id => ({ id, title: id, artist: 'fixture', album: 'fixture', duration: 100 }));
  await controller.playQueue(songs, 1); playback.getState().setStatus({ position: 20 });
  await controller.previous(); assert.deepEqual(seeks, [0]); assert.equal(playback.getState().index, 1);
  playback.getState().setStatus({ position: 20 }); await controller.previous(false);
  assert.equal(playback.getState().index, 0); assert.equal(loads.at(-1), 'first');
  playback.setState({ repeat: 'all', position: 20 }); await controller.previous(false); assert.equal(playback.getState().index, 1);
  controller.stopPlayback();
  console.log('PASS: swipe moves directly to previous track after 3 seconds, existing previous-button restart and repeat wrapping preserved. Native gesture/animation rendering remains unverified.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
