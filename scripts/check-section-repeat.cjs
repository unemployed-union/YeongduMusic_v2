/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const { create } = require('zustand');
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const deferred = () => { let resolve; return { promise: new Promise(done => { resolve = done; }), resolve: () => resolve() }; };
function load(file, modules = {}, globals = {}) {
  modules = { ...require('./test-cloud-fixtures.cjs').cloudFixtures(globals, modules), ...modules };
  const exports = {}, code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'exports', ...Object.keys(globals), code)(name => {
    if (name === 'zustand') return { create };
    if (name in modules) return modules[name];
    throw Error('Unexpected import: ' + name);
  }, exports, ...Object.values(globals));
  return exports;
}
function harness() {
  let now = 0, id = 0, engine, seekGate, failSeek = false;
  const timers = new Map(), events = [];
  const globals = { Date: class extends Date { static now() { return now; } },
    setTimeout: (callback, delay) => { timers.set(++id, { callback, at: now + delay }); return id; }, clearTimeout: key => timers.delete(key) };
  const playback = load('src/stores/playback.ts').usePlaybackStore;
  const privacy = create(() => ({ ready: true, scope: 'demo', profile: { presets: [] } }));
  class Engine {
    constructor(rate = 1, preservePitch = true) { engine = this; this.position = 0; this.rate = rate; this.preservePitch = preservePitch; }
    setPlaybackRate(rate) { this.rate = rate; events.push(['rate', rate]); }
    setPreservePitch(preserve) { this.preservePitch = preserve; }
    subscribe(listener) { this.listener = listener; }
    subscribeRemoteNavigation(listener) { this.remote = listener; }
    emit(status = {}) { this.position = status.position ?? this.position; this.listener({ playing: true, buffering: false, position: this.position, duration: 180, ended: false, error: null, ...status }); }
    getPosition() { return this.position; }
    async load(_, song) { events.push(['load', song.id]); this.emit({ position: 0 }); }
    play() { events.push(['play']); this.emit(); }
    pause() { this.emit({ playing: false }); }
    release() {}
    async seek(position) { events.push(['seek', position]); if (failSeek) throw Error('seek failed'); this.position = position; if (seekGate) await seekGate.promise; }
  }
  const controller = load('src/services/playback/controller.ts', {
    './audio-engine': { ExpoAudioEngine: Engine }, '@/stores/playback': { usePlaybackStore: playback }, '@/stores/hidden-music': { useHiddenMusicStore: privacy },
    '@/stores/auth': { useAuthStore: { getState: () => ({ mode: 'mock', session: null }) } },
    '@/features/hidden-music/rules': { hiddenMatcher: () => () => false, privacyScope: () => 'demo' },
    '@/features/library/repository': { musicRepository: () => ({ streamSource: async () => ({ uri: 'https://example.invalid/song' }) }) },
    '@/services/synology/api': { SessionExpiredError: class extends Error {}, SynologyError: class extends Error {} },
    '@/stores/player-background': { usePlayerBackgroundStore: { getState: () => ({ selectArtwork() {}, reset() {} }) } },
  }, globals);
  return { controller, playback, timers, events, get engine() { return engine; }, get now() { return now; }, gate: value => { seekGate = value; }, fail: value => { failSeek = value; },
    advance(ms) { const target = now + ms; while (true) { const due = [...timers].filter(([, item]) => item.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break; timers.delete(due[0]); now = due[1].at; due[1].callback(); } now = target; } };
}
const songs = ['first', 'second'].map(id => ({ id, title: id, artist: 'fixture', album: 'fixture', duration: 180 }));
async function main() {
  const h = harness(), c = h.controller;
  const rules = load('src/services/playback/section-repeat.ts');
  assert.equal(rules.parseSectionTime('1:30.5'), 90.5); assert.equal(rules.sectionClock(90.5), '1:30.5');
  for (const text of ['', '-1:00', '0:60', 'abc', '1:20.55']) assert.throws(() => rules.parseSectionTime(text));
  assert.throws(() => c.startSectionRepeat(10, 20), /먼저/);
  await c.playQueue(songs);
  assert.throws(() => c.setSectionRepeatEnd(), /A를 먼저/);
  for (const [a, b] of [[-1, 2], [10, 10], [10, 9], [10, 10.4], [10, 181], [NaN, 20], [10, Infinity]]) assert.throws(() => c.startSectionRepeat(a, b));
  c.setSectionRepeatStart(10); c.setSectionRepeatEnd(20); await flush();
  assert.equal(h.playback.getState().sectionRepeat.enabled, true); assert.equal(h.events.at(-1)[1], 10);
  h.engine.emit({ position: 19.9 }); c.setPlaybackRate(2);
  assert.equal(h.engine.rate, 2); assert.equal(h.playback.getState().playbackRate, 2);
  c.setPreservePitch(false); assert.equal(h.engine.preservePitch, false); assert.equal(h.playback.getState().preservePitch, false);
  assert(Math.abs([...h.timers.values()][0].at - h.now - 50) < 0.001, 'Loop boundary deadline follows the selected speed');
  for (const invalid of [0, -1, 2.01, NaN]) assert.throws(() => c.setPlaybackRate(invalid));
  c.setPlaybackRate(1);
  h.engine.emit({ position: 19 }); const before = h.events.length;
  h.engine.position = 20; h.advance(250); await flush();
  assert.deepEqual(h.events.slice(before), [['seek', 10]], 'Native clock poll repeats at B without requiring a status event');
  assert.equal(h.playback.getState().index, 0); assert.equal(h.events.filter(event => event[0] === 'load').length, 1);
  h.engine.emit({ playing: false, position: 180, ended: true }); await flush();
  assert.equal(h.playback.getState().playing, true); assert.equal(h.playback.getState().index, 0, 'Natural end repeats the range instead of advancing the queue');
  await c.seek(0); assert.equal(h.playback.getState().position, 10);
  await c.seek(150); assert.equal(h.playback.getState().position, 19.99, 'Manual seeks stay inside the active range');
  c.togglePlayback(); assert.equal(h.timers.size, 0, 'Pausing cancels the loop poll');
  const pausedEvents = h.events.length; h.engine.emit({ playing: false, position: 20 }); h.advance(1000); await flush();
  assert.equal(h.events.length, pausedEvents, 'Paused audio must never auto-seek or resume');
  c.togglePlayback(); await flush(); assert.equal(h.playback.getState().playing, true);
  const seekGate = deferred(); h.gate(seekGate); h.engine.emit({ position: 20 });
  const manualSeek = c.seek(15); seekGate.resolve(); h.gate(null); await manualSeek; await flush();
  assert.equal(h.playback.getState().position, 15, 'A newer manual seek wins over a pending loop jump');
  h.engine.emit({ buffering: true }); assert.equal(h.timers.size, 0, 'Buffering cancels the boundary poll');
  h.engine.emit({ buffering: false }); assert.equal(h.timers.size, 1);
  const pauseGate = deferred(); h.gate(pauseGate); h.engine.emit({ position: 20 }); c.togglePlayback();
  pauseGate.resolve(); h.gate(null); await flush(); assert.equal(h.playback.getState().playing, false, 'A pending seek cannot undo a user pause');
  c.togglePlayback(); await flush();
  c.toggleSectionRepeat(); assert.equal(h.playback.getState().sectionRepeat.enabled, false); assert.equal(h.timers.size, 0);
  c.toggleSectionRepeat(); await flush();
  c.stopAfterCurrentTrack(); assert.equal(h.playback.getState().sectionRepeat.enabled, false);
  assert.throws(() => c.startSectionRepeat(10, 20), /수면 타이머/); c.cancelSleepTimer();
  c.startSectionRepeat(10, 20); await flush(); c.startSleepTimer(1); h.advance(60000); await flush();
  assert.equal(h.playback.getState().playing, false, 'Immediate sleep timer wins over A–B repetition'); assert.equal(h.timers.size, 0);
  c.togglePlayback(); await flush(); await c.next(); assert.equal(h.playback.getState().sectionRepeat, null, 'Track changes clear both markers');
  assert.equal(h.timers.size, 0); c.startSectionRepeat(10, 20); await flush();
  const gate = deferred(); h.gate(gate); h.engine.emit({ position: 20 }); h.engine.emit({ position: 20 });
  const seekCount = h.events.filter(event => event[0] === 'seek').length;
  h.engine.emit({ position: 20 }); assert.equal(h.events.filter(event => event[0] === 'seek').length, seekCount, 'Concurrent end events cannot start duplicate seeks');
  await c.previous(false); gate.resolve(); h.gate(null); await flush();
  assert.equal(h.playback.getState().position, 0, 'An old seek cannot publish a position on the newly selected track');
  c.startSectionRepeat(10, 20); await flush(); h.fail(true); h.engine.emit({ position: 20 }); await flush();
  assert.equal(h.playback.getState().sectionRepeat.enabled, false); assert.match(h.playback.getState().error, /이동하지 못/); assert.equal(h.timers.size, 0);
  c.stopPlayback(); assert.equal(h.playback.getState().sectionRepeat, null);
  const finish = harness(); await finish.controller.playQueue(songs);
  finish.controller.startSectionRepeat(10, 20); await flush(); finish.controller.startSleepTimer(1, 'track-end');
  const finishSeeks = finish.events.filter(event => event[0] === 'seek').length;
  finish.advance(60000); await flush(); assert.equal(finish.playback.getState().sectionRepeat.enabled, false);
  assert.equal(finish.events.filter(event => event[0] === 'seek').length, finishSeeks, 'Arming a finish-track timer never starts another loop jump');
  finish.engine.emit({ position: 180, ended: true, playing: false }); await flush();
  assert.equal(finish.playback.getState().playing, false); assert.equal(finish.playback.getState().index, 0); finish.controller.stopPlayback();
  checkMenuUI();
  checkSpeedUI();
  await checkOptionsUI();
  console.log('PASS: A/B validation/capture, precise time input, boundary polling, natural end, pause/resume, seek clamping, timer priority, track changes, duplicate/obsolete seek guards, failure cleanup and configurable menu UI. Audio and native rendering are mocked.');
}
async function checkOptionsUI() {
  const h = harness(), rules = load('src/services/playback/section-repeat.ts'), states = [];
  let slot = 0;
  const jsx = (type, props) => ({ type, props });
  const component = load('src/features/playback/section-repeat-options.tsx', {
    react: { useState: initial => { const i = slot++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = value; }]; } },
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': { View: 'View', TextInput: 'Input', Pressable: 'Button', StyleSheet: { create: value => value } },
    '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Icon' }, '@/components/text': { Text: 'Text' },
    '@/stores/playback': { usePlaybackStore: selector => selector(h.playback.getState()) },
    '@/services/playback/controller': h.controller, '@/services/playback/section-repeat': rules,
  }).SectionRepeatOptions;
  function nodes(node) { if (Array.isArray(node)) return node.flatMap(nodes); return node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : []; }
  const render = () => { slot = 0; return component({ onBack() {} }); };
  await h.controller.playQueue(songs);
  let tree = render();
  const inputs = nodes(tree).filter(node => node.type === 'Input'); inputs[0].props.onChangeText('0:20'); inputs[1].props.onChangeText('0:10'); tree = render();
  nodes(tree).find(node => node.type === 'Button' && nodes(node).some(child => child.type === 'Text' && child.props.children === '입력한 구간 반복')).props.onPress();
  assert(nodes(render()).some(node => node.props?.accessibilityRole === 'alert'), 'Input failures are displayed inside the menu');
  tree = render(); const corrected = nodes(tree).filter(node => node.type === 'Input');
  corrected[0].props.onChangeText('0:10.0'); corrected[1].props.onChangeText('0:20.0'); tree = render();
  nodes(tree).find(node => node.type === 'Button' && nodes(node).some(child => child.type === 'Text' && child.props.children === '입력한 구간 반복')).props.onPress();
  await flush(); assert.equal(h.playback.getState().sectionRepeat.start, 10); assert.equal(h.playback.getState().sectionRepeat.end, 20);
  tree = render(); assert.equal(nodes(tree).filter(node => node.type === 'Input')[0].props.value, '0:10.0');
  nodes(tree).find(node => node.type === 'Button' && nodes(node).some(child => child.type === 'Text' && child.props.children === '구간 초기화')).props.onPress();
  assert.equal(h.playback.getState().sectionRepeat, null); assert.equal(nodes(render()).filter(node => node.type === 'Input')[1].props.value, '');
  h.controller.stopPlayback();
}
function checkMenuUI() {
  const jsx = (type, props) => ({ type, props }), states = [];
  let slot = 0, layout = load('src/features/settings/menu-layout.ts').defaultMenuLayout();
  const rules = load('src/features/settings/menu-layout.ts'), time = load('src/services/playback/section-repeat.ts');
  const animation = { duration: () => animation, easing: () => animation, withInitialValues: () => animation, withTargetValues: () => animation };
  const calls = [], navigation = [];
  const menu = load('src/features/playback/player-menu.tsx', {
    react: { useEffect: () => {}, useState: initial => { const i = slot++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], value => { states[i] = value; }]; } },
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': { View: 'View', Pressable: 'Button', ScrollView: 'Scroll', StyleSheet: { create: value => value } },
    'expo-router': { router: { push: href => navigation.push(href) } }, 'expo-blur': { BlurView: 'Blur' },
    'react-native-reanimated': { __esModule: true, default: { View: 'AnimatedView' }, Easing: { out: value => value, in: value => value }, FadeIn: animation, FadeOut: animation, FadeInDown: animation, FadeOutDown: animation },
    '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Icon' }, '@/components/text': { Text: 'Text' },
    '@/stores/playback': { usePlaybackStore: selector => selector({ sleepTimer: null, sectionRepeat: null, playbackRate: 1 }) },
    '@/stores/offline-music': { useOfflineMusicStore: selector => selector({ busy: false }) },
    '@/stores/menu-preferences': { useMenuPreferences: selector => selector({ layout }) }, '@/features/settings/menu-layout': rules,
    '@/services/playback/section-repeat': time, './sleep-timer-options': { SleepTimerOptions: 'TimerOptions' }, './section-repeat-options': { SectionRepeatOptions: 'SectionOptions' },
    './playback-speed-options': { PlaybackSpeedOptions: 'SpeedOptions' },
  }).PlayerMenu;
  function nodes(node) { if (Array.isArray(node)) return node.flatMap(nodes); return node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : []; }
  const render = (extra = {}) => { slot = 0; return menu({ blurTarget: { current: null }, panel: 'artwork', bottom: 80, maxHeight: 500, onClose() {}, onSelect: action => calls.push(action), ...extra }); };
  const label = node => nodes(node).find(child => child.type === 'Text')?.props.children;
  let tree = render(); const section = nodes(tree).find(node => node.type === 'Button' && label(node) === '구간 반복');
  assert(section); section.props.onPress(); tree = render(); assert(nodes(tree).some(node => node.type === 'SectionOptions')); assert.deepEqual(calls, []);
  nodes(tree).find(node => node.type === 'SectionOptions').props.onBack();
  layout.player.reverse(); layout.player.find(item => item.id === 'lyrics').visible = false;
  tree = render(); assert(!nodes(tree).some(node => node.type === 'Button' && label(node) === '가사 보기'));
  assert.equal(label(nodes(tree).filter(node => node.type === 'Button' && node.props.children)[0]), '메타데이터 수정');
  nodes(tree).find(node => node.type === 'Button' && label(node) === '메타데이터 수정').props.onPress();
  assert.deepEqual(calls, ['edit-metadata']);
  layout.player.forEach(item => { item.visible = item.id === 'download'; }); tree = render();
  nodes(tree).find(node => node.type === 'Button' && label(node) === '재생 화면 메뉴 설정').props.onPress();
  assert.deepEqual(navigation, ['/settings/player-menu'], 'Inapplicable selected actions still allow menu configuration');
  tree = render({ kind: 'details' }); assert(nodes(tree).some(node => node.type === 'Button' && label(node) === '앨범으로 이동'));
}
function checkSpeedUI() {
  let rate = 1, error = null, fail = false, preservePitch = true;
  const rates = load('src/services/playback/playback-rate.ts'), jsx = (type, props) => ({ type, props });
  const Speed = load('src/features/playback/playback-speed-options.tsx', {
    react: { useState: () => [error, value => { error = value; }] }, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { View: 'View', Pressable: 'Button', StyleSheet: { create: value => value } },
    '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Icon' }, '@/components/text': { Text: 'Text' },
    '@/components/animated-switch': { AnimatedSwitch: 'Switch' },
    '@/stores/playback': { usePlaybackStore: select => select({ playbackRate: rate, preservePitch }) }, '@/services/playback/playback-rate': rates,
    '@/services/playback/controller': { setPlaybackRate: value => { if (fail) throw Error('native failure'); rate = value; },
      setPreservePitch: value => { if (fail) throw Error('native failure'); preservePitch = value; } },
  }).PlaybackSpeedOptions;
  function nodes(node) { if (Array.isArray(node)) return node.flatMap(nodes); return node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : []; }
  const render = () => Speed({ onBack() {} });
  nodes(render()).find(node => node.type === 'Switch').props.onValueChange(false);
  assert.equal(nodes(render()).find(node => node.type === 'Switch').props.value, false);
  for (const value of rates.PLAYBACK_RATES) {
    const radio = nodes(render()).find(node => node.props?.accessibilityRole === 'radio' && node.props.accessibilityLabel.startsWith(`${value}배`));
    radio.props.onPress(); assert.equal(rate, value);
    assert.equal(preservePitch, false, 'Choosing a speed leaves the pitch option unchanged');
    assert.equal(nodes(render()).filter(node => node.props?.accessibilityState?.checked).length, 1);
  }
  fail = true; nodes(render()).find(node => node.props?.accessibilityRole === 'radio').props.onPress();
  assert.equal(rate, 2); assert(nodes(render()).some(node => node.props?.accessibilityRole === 'alert'));
  nodes(render()).find(node => node.type === 'Switch').props.onValueChange(true);
  assert.equal(preservePitch, false, 'Failed native changes do not update the pitch switch');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
