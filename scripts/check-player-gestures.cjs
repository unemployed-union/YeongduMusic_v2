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
  new Function('require', 'module', 'exports', 'setTimeout', 'clearTimeout', code)(name => name in overrides ? overrides[name] : projectRequire(name), mod, mod.exports, overrides.__setTimeout ?? setTimeout, overrides.__clearTimeout ?? clearTimeout);
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
  const effects = [], cleanup = new Map(), rnTasks = [], values = [], slots = [];
  const timers = new Map(); let timerId = 0;
  let focused, back, removed = 0, cursor = 0;
  const pan = () => {
    const gesture = { options: {}, handlers: {} };
    for (const name of ['enabled', 'activeOffsetX', 'activeOffsetY', 'failOffsetX', 'failOffsetY']) gesture[name] = value => { gesture.options[name] = value; return gesture; };
    for (const name of ['onStart', 'onUpdate', 'onEnd', 'onFinalize']) gesture[name] = value => { gesture.handlers[name] = value; return gesture; };
    return gesture;
  };
  const modules = {
    __setTimeout: (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; },
    __clearTimeout: id => timers.delete(id),
    react: { useCallback: fn => fn, useMemo: fn => fn(), useRef: value => slots[cursor++] ??= { current: value }, useEffect: (fn, deps) => {
      const slot = cursor++, old = slots[slot];
      if (!old || deps.some((value, i) => value !== old[i])) effects.push(() => { cleanup.get(slot)?.(); cleanup.set(slot, fn()); });
      slots[slot] = deps;
    } },
    'expo-router': { useFocusEffect: fn => { focused = fn; } },
    'react-native': { BackHandler: { addEventListener: (event, listener) => {
      assert.equal(event, 'hardwareBackPress'); back = listener;
      return { remove: () => { back = null; removed++; } };
    } } },
    'react-native-gesture-handler': { Gesture: { Pan: pan } },
    'react-native-reanimated': {
      useSharedValue: value => { const slot = cursor++; if (!slots[slot]) { slots[slot] = shared(value); values.push(slots[slot]); } return slots[slot]; },
      useAnimatedStyle: fn => fn,
      withTiming: (value, config, callback) => ({ animation: true, value, config, callback }),
      withSpring: (value, config) => ({ animation: true, value, config }),
      cancelAnimation: item => { const animation = item.animation; item.animation = null; animation?.callback?.(false); },
    },
    'react-native-worklets': { scheduleOnRN: (fn, ...args) => rnTasks.push(() => fn(...args)), scheduleOnUI: (fn, ...args) => fn(...args) },
  };
  return {
    modules, values, rnTasks, timers, get back() { return back; }, get removed() { return removed; },
    flushRN() { for (const task of rnTasks.splice(0)) task(); },
    runTimers() { for (const [id, timer] of [...timers]) { timers.delete(id); timer.fn(); } },
    render(fn) { cursor = 0; return fn(); },
    mount() { for (const effect of effects.splice(0)) effect(); },
    focus() { return focused(); }, unmount() { for (const fn of cleanup.values()) fn?.(); },
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
  env.values[0].finish(); env.flushRN(); assert.equal(dismissals, 1); assert.equal(env.timers.size, 0);
  blur(); assert.equal(env.back, null); assert.equal(env.removed, 1); env.unmount();

  const cancelled = environment();
  const cancelDismiss = load('src/features/playback/use-player-dismiss.ts', cancelled.modules).usePlayerDismiss(900, () => { dismissals++; });
  cancelled.mount(); const unfocus = cancelled.focus(); cancelled.values[0].finish(); cancelDismiss.close(); cancelled.unmount();
  assert.equal(cancelled.values[0].animation, null); cancelled.flushRN(); assert.equal(cancelled.timers.size, 0); assert.equal(dismissals, 1); unfocus();

  const drag = environment();
  const dragDismiss = load('src/features/playback/use-player-dismiss.ts', drag.modules).usePlayerDismiss(900, () => {});
  drag.mount(); drag.values[0].finish();
  dragDismiss.gesture.handlers.onUpdate({ translationY: 75 });
  assert.equal(dragDismiss.animatedStyle().transform[0].translateY, 75);
  dragDismiss.gesture.handlers.onEnd({ translationY: 75, velocityY: 0 }, true);
  assert.equal(dragDismiss.closing.get(), false); dragDismiss.gesture.handlers.onFinalize(); drag.values[0].finish();
  assert.equal(dragDismiss.animatedStyle().transform[0].translateY, 0);
  dragDismiss.gesture.handlers.onEnd({ translationY: 170, velocityY: 0 }, true); assert.equal(dragDismiss.closing.get(), true); drag.unmount();
  const lifecycle = environment();
  const useDismiss = load('src/features/playback/use-player-dismiss.ts', lifecycle.modules).usePlayerDismiss;
  const onDismiss = () => { throw Error('A canceled/hidden gesture must not dismiss the player'); };
  let screen = lifecycle.render(() => useDismiss(900, onDismiss)); lifecycle.mount(); lifecycle.values[0].finish();
  screen.gesture.handlers.onUpdate({ translationY: 180 });
  screen.gesture.handlers.onEnd({ translationY: 180, velocityY: 1100 }, false);
  assert.equal(screen.closing.get(), false, 'Lock-screen/native cancellation cannot be treated as a successful dismiss swipe');
  screen = lifecycle.render(() => useDismiss(900, onDismiss, false)); lifecycle.mount();
  assert.equal(screen.gesture.options.enabled, false);
  assert.equal(screen.animatedStyle().transform[0].translateY, 0, 'Backgrounding discards partial drag geometry without waiting for animation frames');
  assert.equal(lifecycle.focus(), undefined, 'An inactive player does not consume Android back');
  screen = lifecycle.render(() => useDismiss(900, onDismiss, true)); lifecycle.mount();
  assert.equal(screen.gesture.options.enabled, true); assert.equal(screen.ready.get(), true);
  assert.equal(lifecycle.rnTasks.length, 0); lifecycle.unmount();

  const stalled = environment(); let recoveredDismissals = 0;
  const stalledDismiss = load('src/features/playback/use-player-dismiss.ts', stalled.modules).usePlayerDismiss(900, () => { recoveredDismissals++; });
  stalled.mount(); stalled.values[0].finish(); stalledDismiss.close(); stalled.flushRN();
  assert(stalled.timers.size <= 1, 'Closing must not start repeated polling');
  const lostCompletion = stalled.values[0].animation.callback;
  stalled.modules['react-native-reanimated'].cancelAnimation(stalled.values[0]);
  assert.equal(recoveredDismissals, 0);
  stalled.runTimers(); assert.equal(recoveredDismissals, 1, 'A canceled closing animation cannot leave an invisible native player over the library');
  lostCompletion(true); stalled.flushRN(); assert.equal(recoveredDismissals, 1, 'Late completion must not pop a second route');
  stalled.unmount(); assert.equal(stalled.timers.size, 0);

  const lockedClose = environment(); let lockedDismissals = 0;
  const useLockedDismiss = load('src/features/playback/use-player-dismiss.ts', lockedClose.modules).usePlayerDismiss;
  const onLockedDismiss = () => { lockedDismissals++; };
  let locked = lockedClose.render(() => useLockedDismiss(900, onLockedDismiss)); lockedClose.mount(); lockedClose.values[0].finish();
  locked.close(); const preLockCompletion = lockedClose.values[0].animation.callback;
  locked = lockedClose.render(() => useLockedDismiss(900, onLockedDismiss, false)); lockedClose.mount();
  assert.equal(lockedDismissals, 1, 'Locking during an intentional close finishes navigation without waiting for UI frames');
  lockedClose.flushRN(); preLockCompletion(true); lockedClose.flushRN(); lockedClose.runTimers();
  assert.equal(lockedDismissals, 1); assert.equal(lockedClose.timers.size, 0);
  lockedClose.unmount();

  const queuedUnmount = environment(); let staleDismissals = 0;
  const queued = load('src/features/playback/use-player-dismiss.ts', queuedUnmount.modules).usePlayerDismiss(900, () => { staleDismissals++; });
  queuedUnmount.mount(); queuedUnmount.values[0].finish(); queued.close(); queuedUnmount.values[0].finish();
  queuedUnmount.unmount(); queuedUnmount.flushRN(); queuedUnmount.runTimers();
  assert.equal(staleDismissals, 0, 'Queued animation callbacks after unmount cannot navigate away from the current screen');
  console.log('PASS: focused Android back animates before dismissing, repeated back is consumed, blur/unmount cleanup, vertical drag and snap-back.');
  console.log('PASS: interrupted close watchdog, lock-during-close recovery, one navigation despite late completion and queued callback/unmount guards.');

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
  const resumeSwipe = environment();
  const useSwipe = load('src/features/playback/use-artwork-swipe.ts', resumeSwipe.modules).useArtworkSwipe;
  const onSwipe = async () => { throw Error('A queued swipe must not execute in the background'); };
  let art = resumeSwipe.render(() => useSwipe(320, shared(true), shared(false), onSwipe)); resumeSwipe.mount();
  art.gesture.handlers.onUpdate({ translationX: -120 });
  art.gesture.handlers.onEnd({ translationX: -120, velocityX: 0 }, true);
  art = resumeSwipe.render(() => useSwipe(320, shared(true), shared(false), onSwipe, false)); resumeSwipe.mount();
  assert.equal(art.gesture.options.enabled, false); assert.equal(art.animatedStyle().transform[0].translateX, 0);
  await resumeSwipe.rnTasks.shift()();
  art = resumeSwipe.render(() => useSwipe(320, shared(true), shared(false), onSwipe, true)); resumeSwipe.mount();
  assert.equal(art.gesture.options.enabled, true); resumeSwipe.unmount();
  console.log('PASS: canceled dismisses, partial drag cleanup, inactive gesture/back-handler release, skipped queued background swipes and foreground re-enabling.');

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
