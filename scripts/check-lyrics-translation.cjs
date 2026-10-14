/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const { create } = require('zustand');
function load(file, modules = {}, globals = {}) {
  const exports = {}, code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'exports', ...Object.keys(globals), code)(name => {
    if (name === 'zustand') return { create };
    if (name in modules) return modules[name];
    throw Error('Unexpected dependency ' + name);
  }, exports, ...Object.values(globals));
  return exports;
}
const options = load('src/features/lyrics/translation-options.ts');
const request = load('src/services/cloud-music/request.ts');
const parser = load('src/services/lyrics/parse-lyrics.ts');
const document = parser.parseLyrics('[00:01]First test sentence\n[00:02]\n[00:04]Second test sentence\n[00:06]First test sentence', 'nas');
const languages = { source: 'en', target: 'ko' };
const response = (text, extra = {}) => ({ ok: true, status: 200, text: async () => JSON.stringify({ responseStatus: 200, responseData: { translatedText: text }, ...extra }) });
const deferred = () => { let resolve; const promise = new Promise(ok => { resolve = ok; }); return { promise, resolve }; };
const tick = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
function service(fetch, timeout) {
  return load('src/services/lyrics/translate-lyrics.ts', { '@/services/cloud-music/request': timeout ? { ...request,
    cloudRequest: (...args) => request.cloudRequest(args[0], args[1], args[2], args[3], timeout) } : request,
    '@/features/lyrics/translation-options': options }, { fetch });
}
async function checkService() {
  const calls = [], progress = [];
  const api = service(async (url, init) => { calls.push({ url, init }); return response('번역 ' + new URL(url).searchParams.get('q')); });
  for (const text of ['a'.repeat(1300), '🎵한글'.repeat(180), 'words '.repeat(350), '日本語 '.repeat(150), 'one\r\ntwo']) {
    const chunks = api.translationChunks(text);
    assert(chunks.every(chunk => Buffer.byteLength(chunk, 'utf8') <= 450));
    assert(chunks.every(chunk => !chunk.includes('\ud83c') || /🎵/.test(chunk)));
    assert.equal(chunks.join('').replace(/\s/g, ''), text.replace(/\s/g, ''), 'Long Unicode lyrics never lose characters');
  }
  const translated = await api.translateLyrics(document, languages, undefined, (done, total) => progress.push([done, total]));
  assert.equal(calls.length, 2, 'Repeated choruses and blank timed gaps do not duplicate requests');
  assert.deepEqual(Object.keys(translated), document.lines.map(line => line.id));
  assert.equal(translated['time-2'], ''); assert.equal(translated['time-1'], translated['time-6']);
  assert.equal(document.lines[0].time, 1); assert.equal(document.lines[0].text, 'First test sentence');
  assert.deepEqual(progress, [[0, 2], [1, 2], [2, 2]]);
  for (const call of calls) {
    const url = new URL(call.url);
    assert.equal(url.origin, 'https://api.mymemory.translated.net'); assert.equal(url.pathname, '/get');
    assert.equal(url.searchParams.get('langpair'), 'en|ko'); assert.equal(url.searchParams.get('mt'), '1');
    assert.deepEqual([...url.searchParams.keys()], ['q', 'langpair', 'mt']); assert(!url.searchParams.get('q').includes('[00:'));
    assert.equal(call.init.headers.Authorization, undefined, 'Storage credentials are never sent');
  }
  await api.translateLyrics(document, languages); assert.equal(calls.length, 2, 'Successful translations are cached for the session');
  await api.translateLyrics(document, { source: 'en', target: 'ja' }); assert.equal(calls.length, 4);
  assert.equal(api.parseTranslationResponse({ responseStatus: '200', responseData: { translatedText: '&quot;A&amp;B&quot; &#x1F3B5; &#39;test&#39;' } }), '"A&B" 🎵 \'test\'');
  for (const value of [null, {}, { responseStatus: 200, responseData: { translatedText: '' } }, { responseStatus: 200, responseData: { translatedText: 'x'.repeat(8001) } }, { responseStatus: 400 }]) assert.throws(() => api.parseTranslationResponse(value));
  assert.throws(() => api.parseTranslationResponse({ responseStatus: 200, quotaFinished: true, responseData: { translatedText: 'MYMEMORY WARNING' } }), /사용 한도/);
  assert.throws(() => api.parseTranslationResponse({ responseStatus: 429 }), /사용 한도/);
  await assert.rejects(api.translateLyrics({ provider: 'nas', kind: 'instrumental', lines: [] }, languages), /번역할 가사/);
  await assert.rejects(api.translateLyrics({ ...document, lines: [{ id: 'long', time: 0, text: 'x'.repeat(20001) }] }, languages), /너무 길어/);
  await assert.rejects(api.translateLyrics(document, { source: 'auto', target: 'ko' }), /지원하는/);
  await assert.rejects(api.translateLyrics(document, { source: 'ko', target: 'ko' }), /다르게/);
  const aborted = new AbortController(); aborted.abort(); const before = calls.length;
  await assert.rejects(api.translateLyrics(document, languages, aborted.signal)); assert.equal(calls.length, before);
  const gate = deferred(), controller = new AbortController(); let cancelledCalls = 0;
  const cancelled = service(async () => { cancelledCalls++; return { ok: true, status: 200, text: () => gate.promise }; });
  const pending = cancelled.translateLyrics(document, languages, controller.signal); await tick(); controller.abort();
  await assert.rejects(pending, /취소/); gate.resolve(JSON.stringify({ responseStatus: 200, responseData: { translatedText: 'Late' } })); await tick();
  assert.equal(cancelledCalls, 1, 'Cancellation stops the remaining lyrics');
  let failures = 0;
  for (const failure of [async () => ({ ok: false, status: 429 }), async () => response('Warning', { quotaFinished: true }), async () => ({ ok: true, status: 200, text: async () => '{bad' }), async () => { throw Error('offline'); }]) {
    const broken = service(async () => { failures++; return failure(); });
    await assert.rejects(broken.translateLyrics(document, languages));
  }
  assert.equal(failures, 4, 'Failure does not issue requests for remaining lines');
  const unchanged = service(async url => response(new URL(url).searchParams.get('q')));
  await assert.rejects(unchanged.translateLyrics(document, languages), /원문과 같은 내용/);
  const slow = service(async () => new Promise(() => {}), 20);
  await assert.rejects(slow.translateLyrics(document, languages), /시간이 초과/);
}
async function checkPreferences() {
  const disk = new Map(); let failWrite = false;
  const modules = { 'react-native': { Platform: { OS: 'android' } }, '@/features/lyrics/translation-options': options,
    'expo-sqlite/kv-store': { __esModule: true, default: { getItem: async key => disk.get(key) ?? null, setItem: async (key, value) => { if (failWrite) throw Error('full'); disk.set(key, value); } } } };
  const fresh = () => load('src/stores/lyrics-translation.ts', modules).useLyricsTranslationStore;
  const store = fresh(); await Promise.all([store.getState().load(), store.getState().load()]); assert.deepEqual(store.getState().options, languages); assert.equal(store.getState().enabled, true);
  await store.getState().save({ source: 'ja', target: 'ko' });
  const restarted = fresh(); await restarted.getState().load(); assert.deepEqual(restarted.getState().options, { source: 'ja', target: 'ko' });
  await Promise.all([store.getState().setEnabled(false), store.getState().save({ source: 'fr', target: 'en' }), store.getState().save({ source: 'ko', target: 'ja' })]); assert.deepEqual(store.getState().options, { source: 'ko', target: 'ja' }); assert.equal(store.getState().enabled, false);
  const disabledRestart = fresh(); await disabledRestart.getState().load(); assert.equal(disabledRestart.getState().enabled, false);
  failWrite = true; await assert.rejects(store.getState().setEnabled(true)); assert.equal(store.getState().enabled, false); failWrite = false;
  failWrite = true; await assert.rejects(store.getState().save(languages)); assert.equal(store.getState().options.source, 'ko'); failWrite = false;
  disk.set('yeongdumusic-lyrics-translation-v1', '{bad'); await store.getState().load(true); assert.equal(store.getState().loadError, true);
  await assert.rejects(store.getState().save(languages)); assert.equal(disk.get('yeongdumusic-lyrics-translation-v1'), '{bad');
  disk.delete('yeongdumusic-lyrics-translation-v1'); await store.getState().load(true); assert.equal(store.getState().loadError, false);
  const web = load('src/stores/lyrics-translation.ts', { ...modules, 'react-native': { Platform: { OS: 'web' } } }, { localStorage: { getItem: key => disk.get(key) ?? null, setItem: (key, value) => disk.set(key, value) } }).useLyricsTranslationStore;
  await web.getState().save({ source: 'es', target: 'de' }); await web.getState().setEnabled(false); await store.getState().load(true); assert.equal(store.getState().options.source, 'es'); assert.equal(store.getState().enabled, false);
  disk.set('yeongdumusic-lyrics-translation-v1', JSON.stringify({ version: 1, options: { source: 'ja', target: 'ko' } }));
  const legacy = fresh(); await legacy.getState().load(); assert.equal(legacy.getState().enabled, true); assert.equal(legacy.getState().options.source, 'ja', 'Existing language selections survive migration');
  disk.set('yeongdumusic-lyrics-translation-v1', JSON.stringify({ version: 1, options: languages, enabled: 'false' })); await legacy.getState().load(true);
  assert.equal(legacy.getState().loadError, true); await assert.rejects(legacy.getState().setEnabled(true));
}
function hooks() {
  const slots = []; let index = 0, effects = [], dirty = false;
  const same = (a, b) => a && b && a.length === b.length && a.every((item, i) => Object.is(item, b[i]));
  const react = {
    useRef: initial => { const i = index++; return slots[i] ??= { current: initial }; },
    useState: initial => { const i = index++; slots[i] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value; dirty = true; }]; },
    useMemo: (work, deps) => { const i = index++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { value: work(), deps }; return slots[i].value; },
    useEffect: (effect, deps) => { const i = index++; if (!slots[i] || !same(slots[i].deps, deps)) effects.push({ i, effect, deps }); },
  };
  return { react, render(work) { let result, renders = 0; do { assert(renders++ < 5, 'No render loop'); index = 0; dirty = false; effects = []; result = work(); } while (dirty);
    effects.forEach(({ i }) => slots[i]?.cleanup?.()); effects.forEach(({ i, effect, deps }) => { slots[i] = { deps, cleanup: effect() }; }); return result; },
    unmount() { slots.forEach(slot => slot.cleanup?.()); } };
}
async function checkHook() {
  const h = hooks(), jobs = []; let current = document, identity = 'song:NAS';
  const preferences = create(() => ({ options: languages, enabled: true, ready: true, saving: false, loadError: false, load: async () => {} }));
  const useTranslation = load('src/features/lyrics/use-lyrics-translation.ts', { react: h.react,
    '@/stores/lyrics-translation': { useLyricsTranslationStore: Object.assign(() => preferences.getState(), { getState: preferences.getState }) },
    '@/services/lyrics/translate-lyrics': { translateLyrics: (document, options, signal, progress) => { const gate = deferred(); jobs.push({ document, options, signal, progress, gate }); return gate.promise; } },
  }).useLyricsTranslation;
  const render = () => h.render(() => useTranslation(current, identity));
  let state = render(); assert.equal(jobs.length, 0, 'Opening lyrics does not send text for translation');
  state.start(); state.start(); assert.equal(jobs.length, 1); state = render(); assert.equal(state.loading, true);
  jobs[0].progress(1, 2); assert.match(render().progress, /1\/2/);
  jobs[0].gate.resolve({ 'time-1': '번역' }); await tick(); state = render(); assert.equal(state.shown, true); assert.equal(state.lines['time-1'], '번역');
  state.setShown(false); assert.equal(render().shown, false); render().setShown(true); assert.equal(render().shown, true); assert.equal(jobs.length, 1);
  state = render(); state.start(); await tick(); state = render(); state.cancel(); assert.equal(jobs[1].signal.aborted, true);
  jobs[1].gate.resolve({ 'time-1': 'Cancelled result' }); await tick(); assert.equal(render().lines, undefined);
  state = render(); state.start(); current = { ...document, lines: [{ id: 'new', time: 2, text: 'New song' }] }; identity = 'newSong:online';
  state = render(); assert.equal(jobs[2].signal.aborted, true); assert.equal(state.loading, false); assert.equal(state.lines, undefined);
  jobs[2].gate.resolve({ 'time-1': 'Previous song' }); await tick(); assert.equal(render().lines, undefined);
  state = render(); state.start(); preferences.setState({ options: { source: 'ja', target: 'ko' } });
  state = render(); assert.equal(jobs[3].signal.aborted, true); assert.equal(state.loading, false);
  preferences.setState({ options: languages }); state = render(); assert.equal(state.loading, false, 'A → B → A cannot retain cancelled loading state');
  jobs[3].gate.resolve({ new: 'Wrong language' }); await tick(); assert.equal(render().lines, undefined);
  state = render(); state.start(); preferences.setState({ enabled: false }); state.start(); assert.equal(jobs.length, 5, 'Even a stale enabled handler cannot request translations after disabling');
  state = render(); assert.equal(jobs[4].signal.aborted, true); assert.equal(state.enabled, false); assert.equal(state.shown, false); assert.equal(state.loading, false);
  jobs[4].gate.resolve({ new: 'Disabled late result' }); await tick(); assert.equal(render().lines, undefined);
  preferences.setState({ enabled: true }); state = render(); assert.equal(state.enabled, true); assert.equal(jobs.length, 5, 'Re-enabling does not automatically translate');
  state.start(); jobs[5].gate.resolve({ new: 'New translation' }); await tick(); assert.equal(render().shown, true);
  preferences.setState({ enabled: false }); state = render(); assert.equal(state.lines, undefined); assert.equal(state.shown, false);
  preferences.setState({ enabled: true }); state = render(); state.start(); h.unmount(); assert.equal(jobs[6].signal.aborted, true);
  jobs[6].gate.resolve({ new: 'Closed panel' }); await tick();
}
function checkRendering() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src/features/lyrics/lyrics-panel.tsx'), 'utf8');
  const parsed = ts.createSourceFile('lyrics-panel.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let rowSource;
  const visit = node => { if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === 'LyricRow') rowSource = node.initializer.arguments[0].getText(parsed); ts.forEachChild(node, visit); }; visit(parsed);
  const jsx = (type, props) => ({ type, props }), rowStyles = { row: {}, lyric: {}, translation: {} };
  // Execute the real row body with native/animation functions replaced.
  const code = ts.transpileModule('export const Row = ' + rowSource + ';', { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {}; new Function('exports', 'require', 'useSharedValue', 'useEffect', 'withTiming', 'useAnimatedStyle', 'Pressable', 'AnimatedText', 'styles', code)(exports,
    () => ({ jsx, jsxs: jsx }), value => ({ value }), () => {}, value => value, () => ({}), 'Button', 'Text', rowStyles);
  let sought;
  const row = exports.Row({ line: document.lines[0], translation: '번역된 테스트 문장', active: true, past: false, synced: true, seekable: true, onSeek: time => { sought = time; } });
  assert.equal(row.props.children[0].props.children, document.lines[0].text); assert.equal(row.props.children[1].props.children, '번역된 테스트 문장');
  row.props.onPress(); assert.equal(sought, 1, 'Translated row seeks using the original timestamp'); assert.equal(row.props.accessibilityState.selected, true);
  const blank = exports.Row({ line: document.lines[1], translation: '', active: false, past: false, synced: true, seekable: true, onSeek() {} });
  assert.equal(blank.props.children[0].props.children, '···'); assert.equal(blank.props.children[1], false);
  assert(source.includes('translations?.[item.id]') && source.includes('buffering, translations'), 'Virtualized rows update translations without modifying original timed lines');
}
function checkControls() {
  const jsx = (type, props) => ({ type, props }), native = { ActivityIndicator: 'Spinner', Pressable: 'Button', ScrollView: 'Scroll', StyleSheet: { create: value => value }, View: 'View' };
  const ui = { 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native, '@/components/text': { Text: 'Text' }, '@/components/animated-switch': { AnimatedSwitch: 'Switch' }, '@/theme/tokens': { useColors: () => ({}) } };
  const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
  const LanguageControls = load('src/features/lyrics/translation-settings.tsx', { ...ui, react: { useEffect() {} },
    '@/stores/lyrics-translation': {}, './translation-options': options }).TranslationLanguageControls;
  let chosen;
  const tree = nodes(LanguageControls({ options: languages, disabled: false, onChange: value => { chosen = value; } }));
  assert.equal(tree.find(node => node.props.accessibilityLabel === '번역 언어 영어').props.disabled, true);
  tree.find(node => node.props.accessibilityLabel === '원문 언어 한국어').props.onPress(); assert.deepEqual(chosen, { source: 'ko', target: 'en' });
  tree.find(node => node.props.accessibilityLabel === '번역 언어 일본어').props.onPress(); assert.deepEqual(chosen, { source: 'en', target: 'ja' });
  const h = hooks(); let started = 0, cancelled = 0, shown;
  const preferences = { options: languages, ready: true, loading: false, saving: false, loadError: true };
  const translation = { preferences, lines: { test: '번역' }, shown: true, loading: false, setShown: value => { shown = value; }, start() { started++; }, cancel() { cancelled++; } };
  const Controls = load('src/features/lyrics/lyrics-translation-controls.tsx', { ...ui, react: h.react,
    './translation-settings': { TranslationLanguageControls: 'Languages' }, './translation-options': options }).LyricsTranslationControls;
  const render = () => nodes(h.render(() => Controls({ translation })));
  let controls = render(), hide = controls.find(node => node.props.accessibilityLabel === '번역 숨기기');
  assert.equal(hide.props.disabled, false, 'Settings errors do not prevent switching back to original lyrics'); hide.props.onPress(); assert.equal(shown, false);
  translation.loading = true; controls = render(); controls.find(node => node.props.accessibilityLabel === '가사 번역 취소').props.onPress(); assert.equal(cancelled, 1);
  translation.loading = false; translation.lines = undefined; preferences.loadError = false;
  controls = render(); controls.find(node => node.props.accessibilityLabel === '가사 번역').props.onPress(); assert.equal(started, 1);
  controls.find(node => node.props.accessibilityLabel === '가사 번역 언어 선택').props.onPress(); assert(render().some(node => node.type === 'Languages'));
  let toggled;
  const settingsPreferences = { enabled: false, options: languages, ready: true, loading: false, saving: false, loadError: false, load() {}, setEnabled: async value => { toggled = value; } };
  const Settings = load('src/features/lyrics/translation-settings.tsx', { ...ui, react: { useEffect() {} },
    '@/stores/lyrics-translation': { useLyricsTranslationStore: () => settingsPreferences }, './translation-options': options }).LyricsTranslationSettings;
  const settings = nodes(Settings()); const switchControl = settings.find(node => node.type === 'Switch');
  assert.equal(switchControl.props.value, false); assert.equal(switchControl.props.disabled, false); switchControl.props.onValueChange(true); assert.equal(toggled, true);
  assert(!settings.some(node => typeof node.type === 'function' && node.props.options), 'Disabled settings hide language controls');
}
async function main() {
  await checkService(); await checkPreferences(); await checkHook(); checkRendering(); checkControls();
  console.log('PASS: UTF-8 chunk boundaries, repeated/blank lyric mapping and timestamps, session cache/language isolation, quota/network/JSON/timeout/cancellation handling, persisted settings/failure protection, explicit-only requests, track/language/unmount late-result guards and original/translated row seeking. Network/native UI/storage are mocked.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
