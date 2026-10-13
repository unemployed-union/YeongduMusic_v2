/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const ts = require('typescript'), { create } = require('zustand');
const { QueryClient, QueryObserver } = require('@tanstack/react-query');
const root = path.resolve(__dirname, '..');
function load(file, modules = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => { if (name in modules) return modules[name]; throw Error('Unexpected module ' + name); }, exports);
  return exports;
}
function deferred() { let resolve, reject; const promise = new Promise((ok, no) => { resolve = ok; reject = no; }); return { promise, resolve, reject }; }
const tick = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };

function harness(source = 'all') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const auth = create(() => ({ mode: 'nas', generation: 1, session: { sid: 'fixture', baseUrl: 'https://example.invalid' } }));
  const local = create(() => ({ source, load: async () => {} }));
  const drive = create(() => ({ generation: 1, account: { id: 'drive-a' }, folders: [{ id: 'folder-a' }], refresh: async () => {} }));
  const s3 = create(() => ({ generation: 1, connection: { id: 's3-a' }, refresh: async () => {} }));
  let nasCalls = 0, nasGate = null;
  const page = { items: [], total: 0 };
  const repository = { songs: async () => { nasCalls++; return nasGate ? nasGate.promise : page; }, albums: async () => page, artists: async () => page };
  const modules = {
    '@/stores/auth': { useAuthStore: auth }, '@/stores/local-music': { useLocalMusicStore: local },
    '@/stores/google-drive': { useGoogleDriveStore: drive }, '@/stores/s3': { useS3Store: s3 },
    './repository': { libraryIdentity: () => 'nas-fixture', musicRepository: () => repository },
    './refresh-library': load('src/features/library/refresh-library.ts'),
  };
  const service = load('src/features/library/refresh-music-library.ts', modules);
  // Preserve hooks across renders and execute subscription cleanup on unmount.
  const refs = [], states = [], cleanups = [];
  let refIndex = 0, stateIndex = 0, mounted = true, initialized = false, postUnmountWrites = 0;
  const react = {
    useCallback: fn => fn,
    useRef: value => { const i = refIndex++; return refs[i] ?? (refs[i] = { current: value }); },
    useState: initial => { const i = stateIndex++; if (!(i in states)) states[i] = initial; return [states[i], value => { if (!mounted) postUnmountWrites++; states[i] = value; }]; },
    useEffect: effect => { if (!initialized) cleanups.push(effect()); },
  };
  const hooks = load('src/features/library/use-refresh-library.ts', { ...modules, react, '@tanstack/react-query': { useQueryClient: () => client }, './refresh-music-library': service });
  const render = () => { refIndex = 0; stateIndex = 0; const result = hooks.useRefreshLibrary(); initialized = true; return result; };
  render();
  return { client, auth, local, drive, s3, service, render, get nasCalls() { return nasCalls; }, setNasGate: gate => { nasGate = gate; },
    unmount() { cleanups.forEach(cleanup => cleanup?.()); mounted = false; }, get postUnmountWrites() { return postUnmountWrites; } };
}

async function main() {
  for (const change of ['source', 'source-and-back', 'drive-account', 'drive-folders', 'nas-generation']) {
    const h = harness('drive'), gate = deferred();
    h.drive.setState({ refresh: () => gate.promise });
    const pending = h.render().refresh(); await tick();
    if (change === 'source' || change === 'source-and-back') h.local.setState({ source: 'local' });
    if (change === 'source-and-back') h.local.setState({ source: 'drive' });
    if (change === 'drive-account') h.drive.setState({ generation: 2, account: { id: 'drive-b' } });
    if (change === 'drive-folders') h.drive.setState({ folders: [{ id: 'folder-b' }] });
    if (change === 'nas-generation') h.auth.setState({ generation: 2 });
    gate.resolve(); await pending;
    assert.equal(h.render().message, null, 'Old completion is ignored: ' + change);
    assert.equal(h.render().error, null); assert.equal(h.render().refreshing, false); assert.equal(h.nasCalls, 0);
    h.unmount(); h.client.clear();
  }
  {
    const h = harness('s3'), gate = deferred(); h.s3.setState({ refresh: () => gate.promise });
    const pending = h.render().refresh(); await tick();
    h.s3.setState({ generation: 2, connection: null }); gate.reject(Error('old request failed')); await pending;
    assert.equal(h.render().message, null); assert.equal(h.render().error, null);
    h.unmount(); h.client.clear();
  }
  {
    const h = harness('nas'), gate = deferred(); h.setNasGate(gate);
    const pending = h.render().refresh(); await tick(); assert.equal(h.nasCalls, 1);
    h.auth.setState({ generation: 2, session: { sid: 'new-fixture', baseUrl: 'https://example.invalid' } });
    gate.resolve({ items: [], total: 9 }); await pending;
    assert.equal(h.client.getQueryData(['songs', 'nas-fixture']), undefined, 'Old NAS refresh cannot publish cached pages');
    assert.equal(h.render().message, null);
    h.unmount(); h.client.clear();
  }
  {
    const h = harness('drive'); await h.render().refresh();
    assert.equal(h.render().message, 'Google Drive 음악 목록을 불러왔습니다.');
    h.local.setState({ source: 'local' }); assert.equal(h.render().message, null);
    await h.render().refresh(); assert.equal(h.render().message, '음악 목록을 불러왔습니다.');
    h.unmount(); h.client.clear();
  }
  {
    const h = harness('all'); h.drive.setState({ refresh: async () => { throw Error('Drive offline'); } }); h.s3.setState({ refresh: async () => { throw Error('S3 offline'); } });
    await h.render().refresh(); assert.equal(h.nasCalls, 1);
    assert.ok(h.render().message.includes('S3 · Google Drive')); assert.ok(h.render().message.includes('Audio Station'));
    assert.deepEqual(h.client.getQueryData(['songs', 'nas-fixture']).pages, [{ items: [], total: 0 }]);
    h.unmount(); h.client.clear();
  }
  {
    const h = harness('drive'), gate = deferred(); h.drive.setState({ refresh: () => gate.promise });
    const pending = h.render().refresh(); await tick(); h.unmount(); gate.resolve(); await pending;
    assert.equal(h.postUnmountWrites, 0); h.client.clear();
  }
  console.log('PASS: refresh source/account/folder/generation changes, source ABA, stale NAS cache publication, cloud failure isolation, normal refresh and unmount cleanup.');

  const { libraryResult } = load('src/features/library/library-result.ts');
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } }), gate = deferred();
  const observer = new QueryObserver(client, { queryKey: ['fixture'], queryFn: () => gate.promise });
  const unsubscribe = observer.subscribe(() => {});
  const consistent = result => {
    assert.equal(Number(result.isPending) + Number(result.isError) + Number(result.isSuccess), 1);
    assert.equal(result.status, result.isPending ? 'pending' : result.isError ? 'error' : 'success');
    assert.equal(result.error !== null, result.isError);
  };
  let result = libraryResult(observer.getCurrentResult(), {}); consistent(result); assert.equal(result.status, 'pending');
  gate.resolve({ items: [], total: 0 }); await tick();
  const success = observer.getCurrentResult();
  result = libraryResult(success, {}); consistent(result); assert.equal(result.status, 'success');
  result = libraryResult(success, { cloudError: 'S3 offline' }); consistent(result); assert.equal(result.status, 'error'); assert.equal(result.isRefetchError, true);
  result = libraryResult(success, { cloudLoading: true, cloudPending: true }); consistent(result); assert.equal(result.status, 'pending'); assert.equal(result.isLoading, true);
  result = libraryResult(success, { cloudLoading: true }); consistent(result); assert.equal(result.isRefetching, true);
  const offline = new Error('NAS offline'), fallback = { items: [{ id: 'local-fixture' }], total: 1 };
  result = libraryResult({ ...success, data: undefined, error: offline, isError: true, isPending: false, isFetching: false }, { fallback }); consistent(result);
  assert.equal(result.data, fallback); assert.equal(result.error, offline); assert.equal(result.isLoadingError, false); assert.equal(result.isRefetchError, true);
  unsubscribe(); observer.destroy(); client.clear();
  console.log('PASS: actual QueryObserver pending/success states, cloud error/loading consistency, empty lists, refreshing flags and NAS offline fallback.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
