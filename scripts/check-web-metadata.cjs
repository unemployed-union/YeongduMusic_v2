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
const rules = load('src/features/metadata/rules.ts');
const webRules = load('src/features/metadata/web-rules.ts', { './rules': rules });
const request = load('src/services/cloud-music/request.ts');
const recordingId = 'b1b1b1b1-1111-4111-8111-111111111111', releaseId = 'a1a1a1a1-1111-4111-8111-111111111111';
const recording = { id: recordingId, title: 'Song', length: 180000, score: 100, 'artist-credit': [{ name: 'Artist' }],
  releases: [{ id: releaseId, title: 'Album', date: '2024-03-01', 'artist-credit': [{ name: 'Album Artist' }],
    media: [{ position: 2, 'track-count': 20, 'track-offset': 4, track: [{ number: '5', title: 'Song' }] }] }] };
const source = { id: 'song', source: 'local', title: 'Song', artist: 'Artist', album: '알 수 없는 앨범', albumSource: 'fallback', duration: 180,
  local: { fileName: 'secret.mp3', originalName: 'secret.mp3', size: 100 } };
const key = rules.metadataKey(source, null), next = { ...source, id: 'next' }, nextKey = rules.metadataKey(next, null);
const deferred = () => { let resolve; const promise = new Promise(ok => { resolve = ok; }); return { promise, resolve }; };
const tick = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function storage() {
  const values = new Map(); let failRead = false, failWrite = false, gate;
  return { values, api: { getItem: id => { if (failRead) throw Error('read'); return values.get(id) ?? null; },
    setItem: async (id, value) => { if (gate) await gate.promise; if (failWrite) throw Error('write'); values.set(id, value); } },
    failRead: value => { failRead = value; }, failWrite: value => { failWrite = value; }, gate: value => { gate = value; } };
}
function stores(memory = storage()) {
  const modules = { 'react-native': { Platform: { OS: 'android' } }, 'expo-sqlite/kv-store': { __esModule: true, default: memory.api }, '@/features/metadata/rules': rules };
  return { memory, metadata: load('src/stores/song-metadata.ts', modules).useSongMetadataStore,
    preferences: load('src/stores/web-metadata.ts', modules).useWebMetadataStore };
}
function worker(stores, search) {
  return load('src/services/metadata/automatic.ts', { '@/stores/web-metadata': { useWebMetadataStore: stores.preferences },
    '@/stores/song-metadata': { useSongMetadataStore: stores.metadata }, '@/features/metadata/rules': rules,
    '@/features/metadata/web-rules': webRules, './web-search': { searchWebMetadata: search } }).runAutomaticMetadata;
}
async function checkProvider() {
  const calls = [];
  const provider = load('src/services/metadata/web-search.ts', { '@/services/cloud-music/request': request,
    '@/features/metadata/rules': rules, '@/features/metadata/web-rules': webRules }, { fetch: async (url, options) => {
      calls.push({ url, options, at: Date.now() }); return { ok: true, json: async () => ({ recordings: [recording] }) };
    } });
  const candidates = provider.parseWebMetadata({ recordings: [recording] });
  assert.equal(candidates.length, 1);
  assert.deepEqual(candidates[0].fields, { title: 'Song', artist: 'Artist', album: 'Album', albumArtist: 'Album Artist', year: 2024, trackNumber: 5, discNumber: 2 });
  assert.equal(candidates[0].duration, 180);
  const multiple = JSON.parse(JSON.stringify(recording)); multiple['artist-credit'] = [{ name: 'One', joinphrase: ' feat. ' }, { name: 'Two' }];
  assert.equal(provider.parseWebMetadata({ recordings: [multiple] })[0].fields.artist, 'One feat. Two');
  multiple.releases[0].media[0].track = [{ number: 'A1' }];
  assert.equal(provider.parseWebMetadata({ recordings: [multiple] })[0].fields.trackNumber, undefined, 'A vinyl track is never invented from track-offset/count');
  const plural = JSON.parse(JSON.stringify(recording)); plural.releases[0].media[0].tracks = plural.releases[0].media[0].track; delete plural.releases[0].media[0].track;
  assert.equal(provider.parseWebMetadata({ recordings: [plural] })[0].fields.trackNumber, 5);
  const duplicate = { ...recording, releases: [recording.releases[0], recording.releases[0]] };
  assert.equal(provider.parseWebMetadata({ recordings: [duplicate] }).length, 1);
  assert.equal(provider.parseWebMetadata({ recordings: [{ ...recording, video: true }] }).length, 0);
  assert.equal(provider.parseWebMetadata({ recordings: [{ ...recording, id: 'bad' }] }).length, 0);
  assert.throws(() => provider.parseWebMetadata({ recordings: null }));
  const url = new URL(provider.metadataSearchUrl('Song" OR artist:*', 'Artist + Another'));
  assert.equal(url.origin, 'https://musicbrainz.org');
  assert.equal(url.searchParams.get('query'), 'recording:"Song\\" OR artist\\:\\*" AND artist:"Artist \\+ Another"');
  assert(!provider.metadataSearchUrl('Song', '알 수 없는 아티스트').includes('artist%3A'));
  await Promise.all([provider.searchWebMetadata('Song', 'Artist'), provider.searchWebMetadata('Song', 'Artist')]);
  assert(calls[1].at - calls[0].at >= 1050, 'Manual and automatic searches obey the shared rate limit');
  assert(calls.every(call => call.options.headers['User-Agent'].includes('YeongduMusic') && !call.url.includes('secret')));
  const aborted = new AbortController(); aborted.abort(); const before = calls.length;
  await assert.rejects(provider.searchWebMetadata('Song', 'Artist', aborted.signal)); assert.equal(calls.length, before);
  let retryCalls = 0;
  const limited = load('src/services/metadata/web-search.ts', { '@/services/cloud-music/request': request,
    '@/features/metadata/rules': rules, '@/features/metadata/web-rules': webRules }, { fetch: async () => {
      retryCalls++; return { ok: false, status: 429, headers: { get: () => '60' } };
    } });
  await assert.rejects(limited.searchWebMetadata('Song', 'Artist'));
  await assert.rejects(limited.searchWebMetadata('Song', 'Artist'));
  assert.equal(retryCalls, 1, 'Busy providers are not hammered');
  return candidates;
}
function checkMatching(candidates) {
  assert.equal(webRules.automaticMetadata(source, candidates).album, 'Album');
  assert.equal(webRules.automaticMetadata({ ...source, album: 'My Album', albumSource: 'tag' }, candidates), null);
  assert.equal(webRules.automaticMetadata({ ...source, duration: 0 }, candidates), null);
  assert.equal(webRules.automaticMetadata({ ...source, duration: 190 }, candidates), null);
  assert.equal(webRules.automaticMetadata({ ...source, title: 'Song (Live)' }, candidates), null);
  assert.equal(webRules.automaticMetadata(source, [{ ...candidates[0], score: 70 }]), null);
  const ambiguous = [{ ...candidates[0], fields: { ...candidates[0].fields, album: 'Compilation', albumArtist: 'Various Artists', year: 2025, trackNumber: 10, discNumber: 1 } }, candidates[0]];
  assert.equal(webRules.automaticMetadata(source, ambiguous), null, 'Ambiguous releases supply no conflicting fields');
  const preserved = webRules.automaticMetadata({ ...source, year: 1999, trackNumber: 12, discNumber: 3 }, candidates);
  assert.equal(preserved.year, 1999); assert.equal(preserved.trackNumber, 12); assert.equal(preserved.discNumber, 3);
  assert.equal(webRules.needsAutomaticMetadata({ ...source, artist: '알 수 없는 아티스트' }), false);
  const draft = { ...rules.metadataDraft(source), year: '1999' }, noYear = { ...candidates[0], fields: { ...candidates[0].fields, year: undefined } };
  assert.equal(webRules.candidateDraft(draft, noYear).year, '1999', 'Manual search does not erase absent provider data');
}
async function checkPersistence(candidates) {
  const current = stores(), { preferences, metadata, memory } = current;
  await Promise.all([preferences.getState().load(), metadata.getState().load()]);
  assert.equal(preferences.getState().enabled, false, 'Automatic lookup is opt-in');
  await preferences.getState().setExcluded(key, true);
  await preferences.getState().setEnabled(true);
  const restarted = stores(memory); await restarted.preferences.getState().load();
  assert.equal(restarted.preferences.getState().enabled, true); assert.equal(restarted.preferences.getState().excluded[key], true);
  const driveA = rules.metadataKey({ ...source, source: 'drive', drive: { accountId: 'A', fileId: 'same' } }, null);
  const driveB = rules.metadataKey({ ...source, source: 'drive', drive: { accountId: 'B', fileId: 'same' } }, null);
  await preferences.getState().setExcluded(driveA, true); assert.equal(preferences.getState().excluded[driveB], undefined);
  memory.failWrite(true); await assert.rejects(preferences.getState().setEnabled(false)); assert.equal(preferences.getState().enabled, true);
  memory.failWrite(false); await preferences.getState().setExcluded(key, false);
  const gate = deferred(); memory.gate(gate);
  const manual = metadata.getState().save(key, { ...candidates[0].fields, title: 'Manual' }); await tick();
  const automatic = metadata.getState().saveAutomatic(key, candidates[0].fields, () => true); gate.resolve(); memory.gate(null);
  await manual; assert.equal(await automatic, false); assert.equal(metadata.getState().patches[key].title, 'Manual');
  assert.equal(await metadata.getState().saveAutomatic(nextKey, candidates[0].fields, () => false), false); assert.equal(metadata.getState().patches[nextKey], undefined);
  const writeGate = deferred(); let allowed = true; memory.gate(writeGate);
  const lateStorage = metadata.getState().saveAutomatic(nextKey, candidates[0].fields, () => allowed); await tick();
  allowed = false; writeGate.resolve(); memory.gate(null); assert.equal(await lateStorage, false);
  assert.equal(metadata.getState().patches[nextKey], undefined);
  const afterStorageRace = stores(memory); await afterStorageRace.metadata.getState().load();
  assert.equal(afterStorageRace.metadata.getState().patches[nextKey], undefined, 'Changes during storage I/O cannot reappear on restart');
  const corrupt = stores(); corrupt.memory.values.set('yeongdumusic-web-metadata-v1', '{bad'); await corrupt.preferences.getState().load();
  assert.equal(corrupt.preferences.getState().loadError, true); assert.equal(corrupt.preferences.getState().enabled, false);
  await assert.rejects(corrupt.preferences.getState().setEnabled(true)); assert.equal(corrupt.memory.values.get('yeongdumusic-web-metadata-v1'), '{bad');
  corrupt.memory.values.delete('yeongdumusic-web-metadata-v1'); await corrupt.preferences.getState().load(true); assert.equal(corrupt.preferences.getState().loadError, false);
  await preferences.getState().markChecked(nextKey, webRules.lookupFingerprint(next));
  await preferences.getState().retry(); assert.deepEqual(preferences.getState().checked, {});
  assert.equal(preferences.getState().excluded[driveA], true, 'Retry keeps song exclusions');
}
async function checkAutomation(candidates) {
  const current = stores(); await Promise.all([current.preferences.getState().load(), current.metadata.getState().load()]);
  let calls = 0, songs = [source, next];
  const run = worker(current, async () => { calls++; return candidates; });
  await run(() => songs, null, new AbortController().signal); assert.equal(calls, 0);
  await current.preferences.getState().setExcluded(nextKey, true); await current.preferences.getState().setEnabled(true);
  await run(() => songs, null, new AbortController().signal); assert.equal(calls, 1); assert.equal(current.metadata.getState().patches[key].album, 'Album');
  assert.equal(current.metadata.getState().patches[nextKey], undefined);
  await current.metadata.getState().reset(key); await run(() => songs, null, new AbortController().signal); assert.equal(calls, 1, 'Clearing a web edit does not immediately reapply it');
  const reopened = stores(current.memory); await Promise.all([reopened.preferences.getState().load(), reopened.metadata.getState().load()]);
  await worker(reopened, async () => { calls++; return candidates; })(() => songs, null, new AbortController().signal); assert.equal(calls, 1, 'Completed lookups persist across restart');
  await current.preferences.getState().retry();
  const gate = deferred(); const late = worker(current, async () => { calls++; return gate.promise; });
  const pending = late(() => songs, null, new AbortController().signal); await tick();
  await current.preferences.getState().setExcluded(key, true); gate.resolve(candidates); await pending;
  assert.equal(current.metadata.getState().patches[key], undefined, 'Excluding a song during its lookup blocks the late result');
  await current.preferences.getState().setExcluded(key, false);
  for (const change of ['disable', 'remove', 'abort', 'manual']) {
    const gate = deferred(), controller = new AbortController();
    const pending = worker(current, async () => gate.promise)(() => songs, null, controller.signal); await tick();
    if (change === 'disable') await current.preferences.getState().setEnabled(false);
    if (change === 'remove') songs = [];
    if (change === 'abort') controller.abort();
    if (change === 'manual') await current.metadata.getState().save(key, { ...candidates[0].fields, title: 'Manual' });
    gate.resolve(candidates); await pending;
    assert.equal(current.metadata.getState().patches[key]?.title, change === 'manual' ? 'Manual' : undefined, `Late result gate: ${change}`);
    songs = [source, next]; await current.preferences.getState().setEnabled(true);
  }
  await current.metadata.getState().reset(key); await current.preferences.getState().retry();
  await worker(current, async () => { throw Error('offline'); })(() => songs, null, new AbortController().signal);
  assert.equal(current.preferences.getState().automaticError, 'offline'); assert.equal(current.preferences.getState().checked[key], undefined);
  assert.equal(current.metadata.getState().patches[key], undefined);
  // Drive uses the same display store. A file-writing dependency would fail this harness.
  const drive = { ...source, source: 'drive', drive: { accountId: 'A', fileId: 'song' } };
  await current.preferences.getState().retry();
  await worker(current, async () => candidates)(() => [drive], null, new AbortController().signal);
  assert.equal(current.metadata.getState().patches[rules.metadataKey(drive, null)].album, 'Album');
  assert.equal(drive.album, source.album);
}
function hooks() {
  const slots = []; let index = 0, pending = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((item, i) => Object.is(item, b[i]));
  const react = {
    useRef: value => { const i = index++; return slots[i] ??= { current: value }; },
    useState: value => { const i = index++; slots[i] ??= { value: typeof value === 'function' ? value() : value };
      return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; }]; },
    useEffect: (effect, deps) => { const i = index++; if (!slots[i] || !same(slots[i].deps, deps)) pending.push({ i, effect, deps }); },
    useCallback: (fn, deps) => { const i = index++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { value: fn, deps }; return slots[i].value; },
  };
  return { react, render: work => {
    index = 0; pending = []; const result = work(); const effects = pending;
    effects.forEach(({ i }) => slots[i]?.cleanup?.());
    effects.forEach(({ i, effect, deps }) => { slots[i] = { deps, cleanup: effect() }; });
    return result;
  }, unmount: () => { slots.forEach(slot => slot.cleanup?.()); } };
}
async function checkLifecycle() {
  const h = hooks(), preferences = create(() => ({ ready: true, enabled: false, saving: false, excluded: {}, automaticError: null, retryRevision: 0, load: async () => {} }));
  const auth = create(() => ({ mode: 'setup', session: null })), privacy = create(() => ({ ready: true, scope: null, profile: { presets: [] } }));
  let page = { items: [source] }, listener; const jobs = [], queried = [];
  const appState = { currentState: 'active', addEventListener: (event, callback) => { listener = callback; return { remove() { listener = null; } }; } };
  const hook = store => Object.assign(selector => selector(store.getState()), { getState: store.getState, setState: store.setState });
  const Component = load('src/features/metadata/automatic-metadata.tsx', { react: h.react, 'react-native': { AppState: appState },
    '@/features/library/queries': { useSongs: enabled => { queried.push(enabled); return { data: page }; } },
    '@/features/hidden-music/rules': { privacyScope: (mode, session) => session?.account ?? null,
      hiddenMatcher: presets => song => presets.some(preset => preset.songIds.includes(song.id)) },
    '@/stores/auth': { useAuthStore: hook(auth) }, '@/stores/hidden-music': { useHiddenMusicStore: hook(privacy) },
    '@/stores/web-metadata': { useWebMetadataStore: hook(preferences) },
    '@/services/metadata/automatic': { runAutomaticMetadata: (getSongs, scope, signal) => { const gate = deferred(); jobs.push({ getSongs, scope, signal, gate }); return gate.promise; } },
  }).AutomaticMetadata;
  const render = () => h.render(Component), move = value => { appState.currentState = value; listener(value); render(); };
  render(); assert.equal(jobs.length, 0); assert.equal(queried.at(-1), false);
  preferences.setState({ enabled: true }); render(); assert.equal(jobs.length, 1); assert.deepEqual(jobs[0].getSongs(), [source], 'Local-only setup mode supports lookup');
  privacy.setState({ profile: { presets: [{ songIds: ['song'] }] } }); assert.deepEqual(jobs[0].getSongs(), [], 'Live hiding takes effect before a render');
  privacy.setState({ profile: { presets: [] } });
  move('background'); assert.equal(jobs[0].signal.aborted, true); assert.equal(queried.at(-1), false); assert.deepEqual(jobs[0].getSongs(), []);
  move('active'); jobs[0].gate.resolve(); await tick(); assert.equal(jobs.length, 2, 'Rapid resume restarts after the cancelled task settles');
  preferences.setState({ retryRevision: 1 }); render(); assert.equal(jobs[1].signal.aborted, true);
  jobs[1].gate.resolve(); await tick(); assert.equal(jobs.length, 3, 'Retry restarts even when the callback dependencies are unchanged');
  page = { items: [next] }; render(); assert.deepEqual(jobs[2].getSongs(), [next]);
  jobs[2].gate.resolve(); await tick(); assert.equal(jobs.length, 4, 'New library items arriving during a job schedule another pass');
  auth.setState({ mode: 'nas', session: { account: 'new' } }); assert.deepEqual(jobs[3].getSongs(), [], 'Account change blocks a result before the effect runs');
  privacy.setState({ scope: 'new' }); render(); assert.equal(jobs[3].signal.aborted, true);
  jobs[3].gate.resolve(); await tick(); assert.equal(jobs.length, 5); assert.equal(jobs[4].scope, 'new');
  preferences.setState({ excluded: { [nextKey]: true } }); render(); assert.equal(jobs[4].signal.aborted, true);
  jobs[4].gate.resolve(); await tick(); assert.equal(jobs.length, 6, 'Exclusion changes cancel the old request and schedule a fresh pass');
  preferences.setState({ automaticError: 'offline' }); render(); assert.equal(jobs[5].signal.aborted, true);
  jobs[5].gate.resolve(); await tick(); assert.equal(jobs.length, 6, 'An automatic error pauses the worker');
  preferences.setState({ automaticError: null }); render(); assert.equal(jobs.length, 7, 'Clearing an error restarts the worker without another library update');
  h.unmount(); assert.equal(jobs[6].signal.aborted, true); assert.equal(listener, null);
  jobs[6].gate.resolve(); await tick(); assert.equal(jobs.length, 7, 'Unmount does not restart a pending task');
}
async function checkSearchUI(candidates) {
  const current = stores(); await current.preferences.getState().load();
  const h = hooks(), jsx = (type, props) => ({ type, props }); let searched = 0, draft = rules.metadataDraft(source), busy = false;
  const preferences = Object.assign(() => current.preferences.getState(), { getState: current.preferences.getState });
  const Component = load('src/features/metadata/metadata-web-options.tsx', {
    react: h.react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { ActivityIndicator: 'Spinner', Pressable: 'Button', StyleSheet: { create: value => value }, View: 'View' },
    '@/components/animated-switch': { AnimatedSwitch: 'Switch' }, '@/components/text': { Text: 'Text' }, '@/theme/tokens': { useColors: () => ({}) },
    '@/stores/web-metadata': { useWebMetadataStore: preferences }, './web-rules': webRules,
    '@/services/metadata/web-search': { searchWebMetadata: async (title, artist) => { searched++; assert.equal(title, source.title); assert.equal(artist, source.artist); return candidates; } },
  }).MetadataWebOptions;
  const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
  const render = () => nodes(h.render(() => Component({ songKey: key, draft, onChange: value => { draft = value; }, disabled: false, onBusyChange: value => { busy = value; } })));
  let tree = render(); assert.equal(tree.find(node => node.type === 'Switch').props.value, false);
  tree.find(node => node.type === 'Switch').props.onValueChange(true); await tick(); tree = render();
  assert.equal(tree.find(node => node.type === 'Switch').props.value, true);
  assert.equal(current.preferences.getState().enabled, false);
  tree.find(node => node.type === 'Button' && node.props.accessibilityLabel === '웹에서 곡 정보 찾기').props.onPress(); await tick();
  assert.equal(searched, 1); assert.equal(busy, false, 'Manual search works while automatic is off and this song is excluded');
  tree = render(); tree.find(node => node.type === 'Button' && nodes(node).some(child => child.type === 'Text' && child.props.children === 'Song')).props.onPress();
  assert.equal(draft.album, 'Album'); assert.equal(draft.trackNumber, '5');
  assert.equal(current.memory.values.has('yeongdumusic-song-metadata-v1'), false, 'Selecting a result only updates the draft until Save');
  h.unmount();
}
async function main() {
  const candidates = await checkProvider(); checkMatching(candidates); await checkPersistence(candidates); await checkAutomation(candidates); await checkLifecycle(); await checkSearchUI(candidates);
  console.log('PASS: MusicBrainz parsing, safe query escaping, shared rate limiting/cancellation/backoff, exact/version/duration matching, ambiguous release protection, opt-in persistence, account-scoped exclusions, manual edit precedence, late-result guards, foreground/resume/retry/account lifecycle and manual candidate/exclusion controls. Only app display metadata is written; network/native views/storage are mocked.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
