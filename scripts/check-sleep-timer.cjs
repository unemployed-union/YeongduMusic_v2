/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = process.argv[2] || path.resolve(__dirname, '..');
const sourceRoot = process.argv[3] || root;
const projectRequire = createRequire(path.join(root, 'package.json'));
const ts = projectRequire('typescript');
const { create } = projectRequire('zustand');
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
const tick = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
function harness() {
  let now = 0, timerId = 0, engine, pendingSource = null;
  const timers = new Map(), events = [];
  class Clock extends Date { static now() { return now; } }
  function load(file, overrides = {}) {
    const code = ts.transpileModule(fs.readFileSync(path.join(sourceRoot, file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const mod = { exports: {} };
    new Function('require', 'module', 'exports', 'Date', 'setTimeout', 'clearTimeout', code)(name => name in overrides ? overrides[name] : projectRequire(name), mod, mod.exports, Clock,
      (callback, delay) => { timers.set(++timerId, { callback, at: now + delay }); return timerId; }, id => timers.delete(id));
    return mod.exports;
  }
  const playback = load('src/stores/playback.ts').usePlaybackStore;
  const privacy = create(() => ({ ready: true, scope: 'demo', profile: { presets: [] } }));
  class Engine {
    constructor() { engine = this; }
    subscribe(listener) { this.listener = listener; return () => {}; }
    subscribeRemoteNavigation(listener) { this.remote = listener; return () => {}; }
    emit(status = {}) { this.position = status.position ?? this.position ?? 0; this.listener({ playing: true, buffering: false, position: this.position, duration: 180, ended: false, error: null, ...status }); }
    async load(source, song) { events.push(['load', song.id]); this.emit({ position: 0 }); }
    play() { events.push(['play']); this.emit(); }
    pause() { events.push(['pause']); this.emit({ playing: false }); }
    release() { events.push(['release']); }
    async seek(position) { events.push(['seek', position]); }
  }
  const controller = load('src/services/playback/controller.ts', {
    './audio-engine': { ExpoAudioEngine: Engine },
    '@/services/synology/api': { SessionExpiredError: class extends Error {}, SynologyError: class extends Error {} },
    '@/features/library/repository': { musicRepository: () => ({ streamSource: async () => pendingSource ? pendingSource.promise : { uri: 'https://example.invalid/fixture' } }) },
    '@/stores/auth': { useAuthStore: { getState: () => ({ mode: 'mock', session: null }) } },
    '@/stores/playback': { usePlaybackStore: playback }, '@/stores/hidden-music': { useHiddenMusicStore: privacy },
    '@/features/hidden-music/rules': { hiddenMatcher: () => () => false, privacyScope: () => 'demo' },
    '@/stores/player-background': { usePlayerBackgroundStore: { getState: () => ({ selectArtwork() {}, reset() {} }) } },
  });
  return { controller, playback, timers, events, load, get engine() { return engine; },
    suspend: ms => { now += ms; },
    pending: value => { pendingSource = value; },
    advance(ms) {
      const target = now + ms;
      while (true) {
        const due = [...timers].filter(([, value]) => value.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at; timers.delete(due[0]); due[1].callback();
      }
      now = target;
    },
  };
}
const songs = ['first', 'second'].map(id => ({ id, title: id, artist: 'fixture', album: 'fixture', duration: 180 }));
async function main() {
  {
    const h = harness();
    assert.throws(() => h.controller.startSleepTimer(5), /먼저/);
    assert.throws(() => h.controller.stopAfterCurrentTrack(), /먼저/);
    await h.controller.playQueue(songs);
    for (const minutes of [0, -1, 1.5, 1441, NaN, Infinity]) assert.throws(() => h.controller.startSleepTimer(minutes), /1~1440/);
    h.controller.startSleepTimer(1);
    const queue = h.playback.getState().queue;
    h.engine.emit({ position: 42 });
    h.advance(59999); assert.equal(h.playback.getState().playing, true);
    h.advance(1);
    assert.equal(h.playback.getState().playing, false);
    assert.equal(h.playback.getState().sleepTimer, null);
    assert.equal(h.playback.getState().queue, queue);
    assert.equal(h.playback.getState().index, 0);
    assert.equal(h.playback.getState().position, 42, 'Timer pause retains the position');
    assert.equal(h.timers.size, 0);
    h.controller.stopPlayback();
  }
  {
    const h = harness(); await h.controller.playQueue(songs);
    h.controller.startSleepTimer(1);
    const oldCallback = [...h.timers.values()][0].callback;
    h.controller.startSleepTimer(2);
    h.suspend(61000); oldCallback();
    assert.equal(h.playback.getState().sleepTimer.minutes, 2, 'Old timer cannot cancel a replacement');
    h.controller.cancelSleepTimer(); assert.equal(h.timers.size, 0);
    h.advance(180000); assert.equal(h.playback.getState().playing, true);
    h.controller.startSleepTimer(1); h.controller.togglePlayback();
    h.advance(60000); assert.equal(h.playback.getState().sleepTimer, null, 'Time passes while paused');
    h.controller.stopPlayback();
  }
  {
    const h = harness(); await h.controller.playQueue(songs);
    h.controller.startSleepTimer(1); h.suspend(70000);
    h.engine.emit({ buffering: true });
    assert.equal(h.playback.getState().playing, false, 'Status events enforce a delayed deadline');
    assert.equal(h.playback.getState().buffering, false);
    h.controller.togglePlayback(); h.controller.startSleepTimer(1); h.suspend(70000);
    assert.equal(h.controller.checkSleepTimer(), true, 'Foreground check enforces an overdue deadline');
    h.controller.stopPlayback();
  }
  for (const repeat of ['off', 'one', 'all']) {
    const h = harness(); await h.controller.playQueue(songs);
    h.playback.setState({ repeat, shuffle: true }); h.controller.stopAfterCurrentTrack();
    h.engine.emit({ playing: false, ended: true, position: 180 }); await tick();
    assert.equal(h.playback.getState().index, 0, 'End timer wins over shuffle/repeat: ' + repeat);
    assert.equal(h.playback.getState().playing, false);
    assert.equal(h.playback.getState().sleepTimer, null);
    assert.equal(h.events.filter(event => event[0] === 'load').length, 1);
    assert.equal(h.events.some(event => event[0] === 'seek'), false);
    h.controller.stopPlayback();
  }
  {
    const h = harness(); await h.controller.playQueue(songs);
    h.controller.stopAfterCurrentTrack(); await h.controller.next();
    assert.equal(h.playback.getState().index, 1);
    assert.equal(h.playback.getState().sleepTimer, null, 'Manual skip cancels track-bound timer');
    h.controller.startSleepTimer(5); await h.controller.previous(false);
    assert.equal(h.playback.getState().sleepTimer.mode, 'time', 'Time timer survives a manual skip');
    h.controller.cancelSleepTimer();
    h.engine.emit({ ended: true }); await tick();
    assert.equal(h.playback.getState().index, 1, 'Without a timer automatic next still works');
    h.controller.stopPlayback();
  }
  {
    const h = harness(); await h.controller.playQueue(songs);
    const gate = deferred(); h.pending(gate); h.controller.startSleepTimer(1);
    const loading = h.controller.next(); h.advance(60000);
    gate.resolve({ uri: 'https://example.invalid/late-source' }); await loading;
    assert.equal(h.events.filter(event => event[0] === 'load').length, 1, 'Expired timer invalidates late source loads');
    assert.equal(h.playback.getState().playing, false);
    h.controller.startSleepTimer(5); h.controller.stopPlayback();
    assert.equal(h.timers.size, 0); assert.equal(h.playback.getState().sleepTimer, null, 'Logout/clear cancels timers');
  }
  for (const repeat of ['off', 'one', 'all']) {
    const h = harness(); await h.controller.playQueue(songs);
    h.playback.setState({ repeat, shuffle: true });
    h.controller.startSleepTimer(1, 'track-end');
    h.engine.emit({ position: 42 });
    const oldCallback = [...h.timers.values()][0].callback;
    h.advance(60000);
    assert.equal(h.playback.getState().playing, true, 'Finish-track timer cannot pause at the deadline');
    assert.deepEqual(h.playback.getState().sleepTimer, { mode: 'track', songId: songs[0].id, afterDeadline: true });
    assert.equal(h.timers.size, 0, 'Expired countdown is removed, not rescheduled in a zero-delay loop');
    h.controller.togglePlayback(); assert.equal(h.playback.getState().playing, false);
    h.controller.togglePlayback(); assert.equal(h.playback.getState().playing, true);
    await h.controller.seek(150);
    h.engine.emit({ playing: false, ended: true, position: 180 }); await tick();
    assert.equal(h.playback.getState().sleepTimer, null); assert.equal(h.playback.getState().playing, false);
    assert.equal(h.playback.getState().index, 0);
    assert.equal(h.events.filter(event => event[0] === 'load').length, 1, 'End wins over shuffle/repeat: ' + repeat);
    assert.equal(h.events.filter(event => event[0] === 'seek').length, 1, 'Only user seek is allowed; repeat does not restart');
    oldCallback(); assert.equal(h.playback.getState().sleepTimer, null); assert.equal(h.timers.size, 0);
    h.controller.stopPlayback();
  }
  {
    const h = harness(); await h.controller.playQueue(songs);
    h.controller.startSleepTimer(1, 'track-end');
    await h.controller.next(); // A different track plays when the countdown expires.
    h.advance(60000);
    assert.equal(h.playback.getState().sleepTimer.songId, songs[1].id, 'Capture the track at expiry, not at timer setup');
    h.engine.emit({ ended: true, playing: false, position: 180 }); await tick();
    assert.equal(h.playback.getState().index, 1); assert.equal(h.playback.getState().playing, false);
    h.controller.stopPlayback();
  }
  for (const command of ['next', 'previous', 'select', 'remote-next']) {
    const h = harness(); await h.controller.playQueue(songs);
    h.controller.startSleepTimer(1, 'track-end'); h.advance(60000);
    if (command === 'next') await h.controller.next();
    if (command === 'previous') await h.controller.previous(false);
    if (command === 'select') await h.controller.playQueue(songs, 1);
    if (command === 'remote-next') { h.engine.remote('next'); await tick(); }
    assert.equal(h.playback.getState().playing, false, 'No manual/remote command starts another track after expiry: ' + command);
    assert.equal(h.playback.getState().sleepTimer, null);
    assert.equal(h.events.filter(event => event[0] === 'load').length, 1);
    h.controller.stopPlayback();
  }
  {
    const h = harness(); await h.controller.playQueue(songs);
    h.controller.startSleepTimer(1, 'track-end'); h.suspend(70000);
    assert.equal(h.controller.checkSleepTimer(), false, 'Delayed foreground check arms end-of-track instead of stopping');
    assert.equal(h.playback.getState().playing, true); assert.equal(h.timers.size, 0);
    h.controller.cancelSleepTimer(); h.engine.emit({ ended: true }); await tick();
    assert.equal(h.playback.getState().index, 1, 'Cancellation restores normal automatic next');
    h.controller.stopPlayback();
  }
  {
    const h = harness(); await h.controller.playQueue(songs);
    h.controller.startSleepTimer(1, 'track-end'); h.suspend(70000);
    h.engine.emit({ ended: true, playing: false, position: 180 }); await tick();
    assert.equal(h.playback.getState().playing, false); assert.equal(h.playback.getState().index, 0);
    assert.equal(h.timers.size, 0, 'Simultaneous/delayed deadline and track end must not advance');
    h.controller.stopPlayback();
  }
  {
    const h = harness(); await h.controller.playQueue(songs);
    const gate = deferred(); h.pending(gate); h.controller.startSleepTimer(1, 'track-end');
    const loading = h.controller.next(); h.advance(60000); gate.resolve({ uri: 'https://example.invalid/late' }); await loading;
    assert.equal(h.playback.getState().playing, false); assert.equal(h.playback.getState().sleepTimer, null);
    assert.equal(h.events.filter(event => event[0] === 'load').length, 1, 'An unstarted track cannot begin after expiry');
    h.controller.stopPlayback();
  }
  {
    const h = harness(); await h.controller.playQueue(songs);
    h.controller.startSleepTimer(1, 'track-end'); h.controller.togglePlayback(); h.advance(60000);
    assert.equal(h.playback.getState().playing, false); assert.equal(h.playback.getState().sleepTimer.afterDeadline, true);
    h.controller.togglePlayback(); h.engine.emit({ ended: true, playing: false }); await tick();
    assert.equal(h.playback.getState().playing, false); assert.equal(h.playback.getState().index, 0);
    h.controller.startSleepTimer(2, 'track-end'); h.advance(120000);
    h.controller.startSleepTimer(5); assert.equal(h.playback.getState().sleepTimer.stopMode, 'immediate', 'Replacement restores selected behavior');
    assert.throws(() => h.controller.startSleepTimer(5, 'unknown'), /종료 방식/);
    h.controller.stopPlayback();
  }
  {
    const h = harness(); await h.controller.playQueue(songs);
    let slot = 0, closes = 0;
    const values = [], jsx = (type, props) => ({ type, props });
    const { SleepTimerOptions } = h.load('src/features/playback/sleep-timer-options.tsx', {
      react: { useState: initial => { const index = slot++; if (index >= values.length) values.push(initial); return [values[index], value => { values[index] = value; }]; } },
      'react/jsx-runtime': { jsx, jsxs: jsx },
      '@/components/text': { Text: 'Text' },
  'react-native': { Pressable: 'Button', View: 'View', Text: 'Text', TextInput: 'Input', StyleSheet: { create: value => value, hairlineWidth: 1 } },
      '@expo/vector-icons/Ionicons': 'Icon',
      '@/services/playback/controller': h.controller,
      '@/stores/playback': { usePlaybackStore: select => select(h.playback.getState()) },
    });
    function all(node, type) {
      if (!node || typeof node !== 'object') return [];
      const children = node.props?.children;
      return [...(node.type === type ? [node] : []), ...(Array.isArray(children) ? children.flat(Infinity) : [children]).flatMap(child => all(child, type))];
    }
    const render = () => { slot = 0; return SleepTimerOptions({ onBack() {}, onClose: () => { closes++; } }); };
    const label = (node, text) => all(node, 'Text').some(child => (Array.isArray(child.props.children) ? child.props.children.join('') : child.props.children) === text);
    let tree = render();
    const radios = all(tree, 'Button').filter(node => node.props.accessibilityRole === 'radio');
    assert.equal(radios.length, 2); assert.equal(radios[0].props.accessibilityState.checked, true);
    radios[1].props.onPress(); tree = render();
    all(tree, 'Button').find(node => label(node, '5분 뒤 종료')).props.onPress();
    assert.equal(h.playback.getState().sleepTimer.minutes, 5); assert.equal(h.playback.getState().sleepTimer.stopMode, 'track-end');
    tree = render(); all(tree, 'Input')[0].props.onChangeText('7'); tree = render();
    all(tree, 'Button').find(node => node.props.accessibilityLabel === '입력한 시간으로 타이머 설정').props.onPress();
    assert.equal(h.playback.getState().sleepTimer.minutes, 7); assert.equal(h.playback.getState().sleepTimer.stopMode, 'track-end');
    tree = render(); all(tree, 'Button').find(node => node.props.accessibilityRole === 'radio' && label(node, '시간이 되면 즉시 정지')).props.onPress();
    tree = render(); all(tree, 'Button').find(node => label(node, '15분 뒤 종료')).props.onPress();
    assert.equal(h.playback.getState().sleepTimer.stopMode, 'immediate'); assert.equal(closes, 3);
    h.controller.stopPlayback();
  }
  console.log('PASS: timed immediate/finish-current modes, expiry track capture, no repeated timer, delayed foreground/end events, pause/resume/seek, repeat/shuffle priority, manual/remote skip guards, cancellation/replacement and pending-source cancellation. Mock clock/audio; native background timing remains unverified.');
  console.log('PASS: time expiry, validation, pause/queue retention, cancel/replacement races, delayed status/foreground checks, end-of-track precedence over repeat/shuffle, manual skip semantics, normal next, pending source cancellation and logout cleanup. Clock, NAS source and audio engine are mocked; device/background timing is not verified.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
