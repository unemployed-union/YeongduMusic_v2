/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const { create } = require('zustand');
function load(file, mocks = {}, globals = {}, extra = '') {
  mocks = { '@/services/haptics': { playHaptic() {}, prepareHaptics() {} }, ...mocks };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8') + extra, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, exports = {};
  new Function('require', 'exports', ...Object.keys(globals), code)(name => {
    if (name === 'zustand') return { create };
    if (name in mocks) return mocks[name];
    throw Error('Unexpected dependency ' + name);
  }, exports, ...Object.values(globals));
  return exports;
}
const timing = load('src/features/lyrics/timing.ts');
const jsx = (type, props) => ({ type, props });
const native = { View: 'View', Pressable: 'Button', FlatList: 'List', ActivityIndicator: 'Spinner', StyleSheet: { create: value => value } };
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const flush = async () => { for (let i = 0; i < 35; i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function hooks() {
  const slots = []; let cursor = 0, effects = [];
  const react = {
    memo: value => value,
    useRef: current => ({ current }),
    useMemo: callback => callback(),
    useState: initial => { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
    useCallback: value => value,
    useEffect: (effect, dependencies) => { const index = cursor++, previous = slots[index];
      if (!previous || dependencies.some((item, i) => !Object.is(item, previous.dependencies[i]))) effects.push(() => { previous?.cleanup?.(); slots[index] = { dependencies, cleanup: effect() }; }); },
  };
  return { react, render(callback) { cursor = 0; effects = []; const result = callback(); effects.forEach(effect => effect()); return result; } };
}
function storageRuntime(platform = 'android', initial = new Map()) {
  let failRead = false, failWrite = false, readGate, writeGate; const calls = [];
  const storage = {
    getItem: async key => { calls.push(['get', key]); if (readGate) { const gate = readGate; readGate = null; await gate.promise; } if (failRead) throw Error('read'); return initial.get(key) ?? null; },
    setItem: async (key, value) => { calls.push(['set', key, value]); if (writeGate) { const gate = writeGate; writeGate = null; await gate.promise; } if (failWrite) throw Error('write'); initial.set(key, value); },
  };
  const store = load('src/stores/lyrics-timing.ts', { 'react-native': { Platform: { OS: platform } },
    '@/features/lyrics/timing': timing, 'expo-sqlite/kv-store': { __esModule: true, default: storage } }, { localStorage: {
    getItem: key => { if (failRead) throw Error('read'); return initial.get(key) ?? null; },
    setItem: (key, value) => { if (failWrite) throw Error('write'); initial.set(key, value); },
  } }).useLyricsTimingStore;
  return { store, calls, initial, failReads: value => { failRead = value; }, failWrites: value => { failWrite = value; },
    delayRead: () => (readGate = deferred()), delayWrite: () => (writeGate = deferred()) };
}
async function checkStorage() {
  for (const platform of ['android', 'web']) {
    const r = storageRuntime(platform), state = () => r.store.getState();
    await state().load('a'); assert.equal(state().entries.a.offsetMs, 0);
    await Promise.all([state().adjust('a', -100), state().adjust('a', -100), state().adjust('a', -100)]);
    assert.equal(state().entries.a.offsetMs, -300, 'Queued taps accumulate rather than overwriting each other');
    await state().adjust('b', 500); assert.equal(state().entries.a.offsetMs, -300); assert.equal(state().entries.b.offsetMs, 500);
    const restarted = storageRuntime(platform, r.initial).store; await restarted.getState().load('a'); assert.equal(restarted.getState().entries.a.offsetMs, -300);
    r.failWrites(true); await assert.rejects(state().adjust('a', 100), /저장/); assert.equal(state().entries.a.offsetMs, -300); assert.equal(state().entries.a.saving, false);
    r.failWrites(false); await state().reset('a'); assert.equal(state().entries.a.offsetMs, 0); assert.equal(state().entries.a.error, null);
    await state().adjust('a', 99999); assert.equal(state().entries.a.offsetMs, 30000);
    await state().adjust('a', -99999); assert.equal(state().entries.a.offsetMs, -30000);
    r.initial.set('yeongdumusic-lyrics-timing-v1:corrupt', '{bad'); await state().load('corrupt'); assert.equal(state().entries.corrupt.loadError, true);
    const unchanged = r.initial.get('yeongdumusic-lyrics-timing-v1:corrupt'); await assert.rejects(state().reset('corrupt'), /다시 불러/); assert.equal(r.initial.get('yeongdumusic-lyrics-timing-v1:corrupt'), unchanged);
    r.initial.set('yeongdumusic-lyrics-timing-v1:corrupt', JSON.stringify({ version: 1, offsetMs: 1200 })); await state().load('corrupt', true); assert.equal(state().entries.corrupt.offsetMs, 1200);
    for (const value of [{ version: 2, offsetMs: 0 }, { version: 1, offsetMs: 30001 }, { version: 1, offsetMs: 101 }, { version: 1, offsetMs: '100' }]) {
      r.initial.set('yeongdumusic-lyrics-timing-v1:invalid', JSON.stringify(value)); await state().load('invalid', true); assert.equal(state().entries.invalid.loadError, true);
    }
    r.failReads(true); await state().load('unreadable'); assert.equal(state().entries.unreadable.loadError, true);
    r.failReads(false); await state().load('unreadable', true); assert.equal(state().entries.unreadable.loadError, false);
  }
  const r = storageRuntime(), gate = r.delayWrite(), state = () => r.store.getState(); await state().load('a');
  const first = state().adjust('a', 100); await flush(); assert.equal(state().entries.a.saving, true);
  const second = state().adjust('a', 100); await flush(); gate.resolve(); await first; await second; assert.equal(state().entries.a.offsetMs, 200); assert.equal(state().entries.a.saving, false);
}
async function checkIdentity() {
  const h = hooks(), r = storageRuntime(), rules = load('src/features/metadata/rules.ts');
  let mode = 'nas', session = { baseUrl: 'https://nas.invalid', account: 'one' }, provider = 'nas', song = { id: '1' };
  const Hook = load('src/features/lyrics/use-lyric-timing.ts', {
    react: h.react, '@/stores/auth': { useAuthStore: select => select({ mode, session }) },
    '@/features/metadata/rules': rules, '@/features/hidden-music/rules': { privacyScope: (mode, session) => mode === 'nas' && session ? JSON.stringify([session.baseUrl, session.account]) : null },
    '@/stores/lyrics-timing': { useLyricsTimingStore: Object.assign(select => select(r.store.getState()), { getState: r.store.getState }),
      EMPTY_LYRIC_TIMING: { offsetMs: 0, ready: false, loading: false, saving: false, loadError: false, error: null } },
  }).useLyricTiming;
  const render = () => h.render(() => Hook(song, provider));
  const gate = r.delayRead(); const originalKey = render().key;
  song = { id: '2' }; let current = render(); await flush(); assert.equal(render().offsetMs, 0); await current.adjust(600);
  gate.resolve(); await flush(); assert.equal(render().offsetMs, 600, 'A late load for the previous song cannot replace current timing');
  song = { id: '1' }; current = render(); assert.equal(current.offsetMs, 0); await current.adjust(-1000); assert.equal(render().offsetMs, -1000);
  provider = 'lrclib'; current = render(); await flush(); assert.notEqual(current.key, originalKey); assert.equal(render().offsetMs, 0); await render().adjust(100);
  provider = 'nas'; assert.equal(render().offsetMs, -1000, 'NAS and online providers retain separate timing');
  session = { ...session, account: 'two' }; current = render(); await flush(); assert.notEqual(current.key, originalKey); assert.equal(render().offsetMs, 0);
  mode = 'disconnected'; session = null; assert.equal(render().key, null);
  song = { id: 'local1', source: 'local' }; assert(render().key, 'Local timing works without a NAS session');
  song = { id: 'drive1', source: 'drive', drive: { accountId: 'one', fileId: 'file' } }; const driveKey = render().key;
  song = { ...song, drive: { accountId: 'two', fileId: 'file' } }; assert.notEqual(render().key, driveKey);
  song = { id: 's31', source: 's3', s3: { connectionId: 'one', key: 'song.mp3' } }; const s3Key = render().key;
  song = { ...song, s3: { connectionId: 'two', key: 'song.mp3' } }; assert.notEqual(render().key, s3Key);
}
function checkControls() {
  const h = hooks(); let adjusted, resets = 0;
  const value = { key: 'song', ready: true, offsetMs: 0, loading: false, saving: false, loadError: false,
    adjust: async value => { adjusted = value; }, reset: async () => { resets++; }, reload: async () => {} };
  const Controls = load('src/features/lyrics/lyrics-timing-controls.tsx', { react: h.react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': native, '@/components/text': { Text: 'Text' }, './timing': timing }).LyricsTimingControls;
  const render = () => nodes(h.render(() => Controls({ timing: value })));
  const button = label => render().find(node => node.props.accessibilityLabel === label);
  button('가사 타이밍 조절').props.onPress(); button('가사를 0.1초 앞당기기').props.onPress(); assert.equal(adjusted, -100);
  button('가사를 0.1초 늦추기').props.onPress(); assert.equal(adjusted, 100);
  value.offsetMs = 30000; assert.equal(button('가사를 0.1초 늦추기').props.disabled, true); button('가사 타이밍 초기화').props.onPress(); assert.equal(resets, 1);
  value.offsetMs = -30000; assert.equal(button('가사를 0.1초 앞당기기').props.disabled, true);
  value.saving = true; assert.equal(button('가사를 0.1초 앞당기기').props.disabled, true);
  value.saving = false; value.loadError = true; assert.equal(button('가사 타이밍 초기화').props.disabled, true); assert(render().some(node => node.type === 'Text' && node.props.children === '타이밍 다시 불러오기'));
}
async function checkSeeking() {
  let offsetMs = 1000, activeOffset, sought, resumed = 0, document = { provider: 'nas', kind: 'synced', lines: [{ id: 'a', time: 1, text: 'First' }, { id: 'b', time: 4.9, text: 'Last' }] };
  const h = hooks(), playback = { duration: 5, buffering: false };
  const { LyricLines, LyricsPanel } = load('src/features/lyrics/lyrics-panel.tsx', {
    react: h.react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native, '@/components/text': { Text: 'Text' }, '@expo/vector-icons/Ionicons': 'Icon',
    'react-native-reanimated': { createAnimatedComponent: component => component, Easing: {}, useSharedValue: value => ({ get: () => value }), useAnimatedStyle: callback => callback() },
    './lyrics-edge-fade': { LyricsEdgeFade: 'Fade' }, './use-active-lyric-index': { useActiveLyricIndex: (lines, synced, value) => { activeOffset = value; return 0; } },
    './use-lyric-scroll': { useLyricScroll: () => ({ following: true, resume: () => { resumed++; } }) },
    './timing': timing, './use-lyric-timing': { useLyricTiming: () => ({ key: 'track', offsetMs }) }, './lyrics-timing-controls': { LyricsTimingControls: 'TimingControls' },
    './use-lyrics': { useLyrics: () => ({ data: document }) }, './use-lyrics-translation': { useLyricsTranslation: () => ({ enabled: false }) }, './lyrics-translation-controls': {},
    '@/stores/playback': { usePlaybackStore: select => select(playback) }, '@/services/playback/controller': { seek: async time => { sought = time; } },
  }, {}, '\nexport { LyricLines };');
  const render = () => nodes(h.render(() => LyricLines({ lines: document.lines, synced: true, offsetMs, translations: { a: '번역' } }))).find(node => node.type === 'List');
  let list = render(); assert.equal(activeOffset, 1000); assert.equal(list.props.extraData.offsetMs, 1000);
  let row = list.props.renderItem({ item: document.lines[0], index: 0 }); assert.equal(row.props.translation, '번역'); assert.equal(row.props.seekable, true);
  row.props.onSeek(row.props.line.time); await flush(); assert.equal(sought, 2); assert.equal(resumed, 1);
  assert.equal(list.props.renderItem({ item: document.lines[1], index: 1 }).props.seekable, false, 'Corrected times past the end cannot be sought');
  offsetMs = -2000; list = render(); list.props.renderItem({ item: document.lines[0], index: 0 }).props.onSeek(1); await flush(); assert.equal(sought, 0, 'Earlier timestamps clamp seeks to the track start');
  assert.equal(list.props.renderItem({ item: document.lines[1], index: 1 }).props.seekable, true);
  playback.buffering = true; list = render(); assert.equal(list.props.renderItem({ item: document.lines[0], index: 0 }).props.seekable, false);
  const panel = () => nodes(h.render(() => LyricsPanel({ song: { id: 'song' }, source: 'auto', onSourceChange() {} })));
  assert(panel().some(node => node.type === 'TimingControls')); assert.equal(panel().find(node => node.type === LyricLines).props.offsetMs, -2000);
  document = { ...document, kind: 'plain' }; assert(!panel().some(node => node.type === 'TimingControls'), 'Untimed lyrics cannot offer timing correction');
}
(async () => {
  assert.equal(timing.formatLyricOffset(100), '+0.1초'); assert.equal(timing.formatLyricOffset(-100), '-0.1초');
  await checkStorage(); await checkIdentity(); checkControls(); await checkSeeking();
  console.log('PASS: song/provider/account isolation, persisted native/web lyric timing, queued adjustments, limits/reset, corrupt and failed storage protection, late track loads, timing controls and corrected original/translated line seeks. Native UI and storage are mocked.');
})().catch(error => { console.error(error); process.exitCode = 1; });
