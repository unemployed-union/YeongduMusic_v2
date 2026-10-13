const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..');
const staged = process.argv[3];
const projectRequire = createRequire(path.join(root, 'package.json'));
const ts = projectRequire('typescript');
const tanstack = projectRequire('@tanstack/react-query');
// Use the same AbortController polyfill installed by React Native, not Node's
// extra AbortSignal.any/timeout/reason APIs.
const { AbortController } = projectRequire('abort-controller');
function load(file, overrides = {}, globals = {}) {
  overrides = { ...require('./test-cloud-fixtures.cjs').cloudFixtures(globals, overrides), ...overrides };
  const stagedFile = staged && path.join(staged, path.basename(file));
  const source = fs.readFileSync(stagedFile && fs.existsSync(stagedFile) ? stagedFile : path.join(root, file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports: {} };
  const names = Object.keys(globals);
  new Function('require', 'module', 'exports', ...names, code)(name => name in overrides ? overrides[name] : projectRequire(name), mod, mod.exports, ...names.map(name => globals[name]));
  return mod.exports;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const observed = promise => promise.then(value => ({ value }), error => ({ error }));
const json = (value, status = 200) => response(JSON.stringify(value), status);
function response(text, status = 200, type = 'text/plain') {
  return { ok: status >= 200 && status < 300, status, headers: new Headers({ 'content-type': type }), text: () => Promise.resolve(text) };
}
const empty = { success: true, data: { total: 0, songs: [] } };
const apis = Object.fromEntries(['Auth', 'Song', 'Album', 'Artist', 'Stream', 'Cover'].map(name => [name === 'Auth' ? 'SYNO.API.Auth' : 'SYNO.AudioStation.' + name, { path: name === 'Auth' ? 'entry.cgi' : 'AudioStation/' + name.toLowerCase() + '.cgi', minVersion: 1, maxVersion: name === 'Auth' ? 7 : name === 'Artist' ? 4 : name === 'Stream' ? 2 : 3 }]));
function harness() {
  let time = 0, nextTimer = 0;
  const timers = new Map();
  const h = { requests: [], fetch: async () => json(empty), listeners: 0 };
  h.elapse = ms => { time += ms; };
  h.advance = ms => {
    time += ms;
    for (const [id, timer] of [...timers]) if (timer.due <= time) { timers.delete(id); timer.callback(); }
  };
  h.timers = timers;
  h.globals = {
    AbortController, Date: { now: () => time },
    setTimeout: (callback, ms) => { const id = ++nextTimer; timers.set(id, { due: time + ms, callback }); return id; },
    clearTimeout: id => timers.delete(id),
    fetch: (uri, init) => { h.requests.push({ uri, init }); return h.fetch(uri, init); },
  };
  h.api = load('src/services/synology/api.ts', {}, h.globals);
  h.session = { baseUrl: 'https://example.invalid', account: 'fixture', sid: 'fixture-session', apis };
  h.client = new h.api.SynologyClient(h.session);
  h.controller = () => {
    const controller = new AbortController();
    const add = controller.signal.addEventListener.bind(controller.signal);
    const remove = controller.signal.removeEventListener.bind(controller.signal);
    controller.signal.addEventListener = (event, listener) => { h.listeners++; add(event, listener); };
    controller.signal.removeEventListener = (event, listener) => { h.listeners--; remove(event, listener); };
    return controller;
  };
  h.cleaned = () => { assert.equal(timers.size, 0); assert.equal(h.listeners, 0); };
  return h;
}
function kind(h, result, expected) {
  assert.ok(result.error instanceof h.api.SynologyRequestError);
  assert.equal(result.error.kind, expected);
  assert.equal(result.error.code, undefined);
}
function repository(h) {
  const auth = { mode: 'nas', session: h.session, generation: 1, expire: async () => { h.expired++; } };
  h.expired = 0; h.cached = 0; h.fallback = 0;
  return load('src/features/library/repository.ts', {
    '@/stores/streaming-preferences': { useStreamingPreferences: { getState: () => ({ quality: 'original', load: async () => {} }) } },
    './mock-repository': { mockRepository: {} }, '@/services/synology/api': h.api,
    '@/stores/auth': { useAuthStore: { getState: () => auth } },
    '@/services/synology/cache': {
      cachePage: async () => { h.cached++; },
      cachedPage: async () => { h.fallback++; return { items: [], total: 0, stale: true }; },
    },
  }).musicRepository();
}
async function test(name, run) { await run(); console.log('PASS: ' + name); }
async function main() {
  await test('normal text/plain JSON success, unchanged URL/params, cleanup', async () => {
    const h = harness(); const external = h.controller();
    assert.deepEqual(await h.client.songs({ offset: 3, limit: 10, signal: external.signal }), { items: [], total: 0 });
    const url = new URL(h.requests[0].uri);
    assert.equal(url.pathname, '/webapi/AudioStation/song.cgi');
    assert.equal(url.searchParams.get('offset'), '3'); assert.equal(url.searchParams.get('limit'), '10');
    assert.equal(url.searchParams.get('additional'), 'song_tag'); assert.equal(url.searchParams.get('library'), 'all');
    assert.equal(url.searchParams.has('signal'), false); h.cleaned();
  });
  for (const afterHeaders of [false, true]) {
    await test('timeout ' + (afterHeaders ? 'after headers during body read' : 'before headers'), async () => {
      const h = harness(); const pending = deferred(); const external = h.controller();
      h.fetch = async () => afterHeaders ? { ...json(empty), text: () => pending.promise } : pending.promise;
      const result = observed(h.client.songs({ offset: 0, limit: 1, signal: external.signal }));
      await tick(); assert.equal(h.timers.size, 1); h.advance(14999); await tick(); assert.equal(h.requests[0].init.signal.aborted, false);
      h.advance(1); kind(h, await result, 'timeout'); assert.equal(h.requests[0].init.signal.aborted, true); h.cleaned();
      pending.resolve(afterHeaders ? JSON.stringify(empty) : json(empty)); await tick(); h.cleaned();
    });
  }
  for (const afterHeaders of [false, true]) {
    await test('external cancellation ' + (afterHeaders ? 'during body read' : 'during fetch'), async () => {
      const h = harness(); const external = h.controller(); const pending = deferred();
      h.fetch = async () => afterHeaders ? { ...json(empty), text: () => pending.promise } : pending.promise;
      const result = observed(h.client.songs({ offset: 0, limit: 1, signal: external.signal }));
      await tick(); external.abort(); kind(h, await result, 'cancelled');
      assert.equal(h.requests[0].init.signal.aborted, true); h.cleaned();
      pending.reject(new Error('late native rejection')); await tick(); h.cleaned();
    });
  }
  for (const timeoutFirst of [true, false]) {
    await test('timeout/cancel in the same turn: first cause wins (' + (timeoutFirst ? 'timeout' : 'cancel') + ')', async () => {
      const h = harness(); const external = h.controller(); h.fetch = () => new Promise(() => {});
      const result = observed(repository(h).songs({ offset: 0, limit: 1, signal: external.signal }));
      if (timeoutFirst) { h.advance(15000); external.abort(); } else { external.abort(); h.advance(15000); }
      kind(h, await result, timeoutFirst ? 'timeout' : 'cancelled');
      assert.equal(h.expired, 0); assert.equal(h.fallback, 0); assert.equal(h.cached, 0); h.cleaned();
    });
  }
  await test('already-aborted signal does not send a request', async () => {
    const h = harness(); const external = h.controller(); external.abort();
    kind(h, await observed(h.client.songs({ offset: 0, limit: 1, signal: external.signal })), 'cancelled');
    assert.equal(h.requests.length, 0); h.cleaned();
  });
  for (const phase of ['fetch', 'body']) {
    await test('network failure while reading ' + phase, async () => {
      const h = harness(); h.fetch = async () => {
        if (phase === 'fetch') throw new TypeError('network failed');
        return { ...json(empty), text: async () => { throw new TypeError('body failed'); } };
      };
      kind(h, await observed(h.client.songs({ offset: 0, limit: 1 })), 'network'); h.cleaned();
    });
  }
  await test('HTTP status is distinct from a DSM auth code', async () => {
    const h = harness(); h.fetch = async () => response('denied', 401);
    const result = await observed(h.client.songs({ offset: 0, limit: 1 })); kind(h, result, 'http');
    assert.equal(result.error.httpStatus, 401); assert.equal(result.error instanceof h.api.SessionExpiredError, false); h.cleaned();
  });
  await test('invalid JSON is a parsing failure', async () => {
    const h = harness(); h.fetch = async () => response('{broken');
    kind(h, await observed(h.client.songs({ offset: 0, limit: 1 })), 'json'); h.cleaned();
  });
  for (const value of [[], {}, { success: 'true', data: {} }, { success: true, data: {} }, { success: false }]) {
    await test('unexpected response structure is distinct from invalid JSON', async () => {
      const h = harness(); h.fetch = async () => json(value);
      kind(h, await observed(h.client.songs({ offset: 0, limit: 1 })), 'response'); h.cleaned();
    });
  }
  await test('HTML tunnel response keeps actionable error', async () => {
    const h = harness(); h.fetch = async () => response('<html>login</html>', 200, 'text/html');
    const result = await observed(h.client.songs({ offset: 0, limit: 1 })); kind(h, result, 'response');
    assert.match(result.error.message, /Tunnel/); h.cleaned();
  });
  for (const code of [105, 106, 107, 119, 400]) {
    await test('DSM error code preserved: ' + code, async () => {
      const h = harness(); h.fetch = async () => json({ success: false, error: { code } });
      const result = await observed(h.client.songs({ offset: 0, limit: 1 }));
      assert.ok(result.error instanceof h.api.SynologyError); assert.equal(result.error.code, code);
      assert.equal(result.error instanceof h.api.SessionExpiredError, [106, 107, 119].includes(code)); h.cleaned();
    });
  }
  await test('elapsed deadline after synchronous parsing rejects late success', async () => {
    const h = harness(); const parse = JSON.parse;
    JSON.parse = text => { const value = parse(text); h.elapse(15000); return value; };
    try { kind(h, await observed(h.client.songs({ offset: 0, limit: 1 })), 'timeout'); }
    finally { JSON.parse = parse; } h.cleaned();
  });
  await test('cancelled auth response cannot expire or cache/fallback', async () => {
    const h = harness(); const external = h.controller(); const body = deferred();
    h.fetch = async () => ({ ...json(empty), text: () => body.promise });
    const result = observed(repository(h).songs({ offset: 0, limit: 1, signal: external.signal }));
    await tick(); external.abort(); kind(h, await result, 'cancelled');
    body.resolve(JSON.stringify({ success: false, error: { code: 106 } })); await tick();
    assert.equal(h.expired, 0); assert.equal(h.cached, 0); assert.equal(h.fallback, 0); h.cleaned();
  });
  await test('network failure retains existing offline cache fallback', async () => {
    const h = harness(); h.fetch = async () => { throw new TypeError('offline'); };
    assert.equal((await repository(h).songs({ offset: 0, limit: 1 })).stale, true);
    assert.equal(h.fallback, 1); assert.equal(h.expired, 0); h.cleaned();
  });
  await test('actual Query cancellation propagates through library, repository and fetch; old cache retained', async () => {
    const h = harness(); const repo = repository(h);
    const metadata = load('src/features/library/load-song-library.ts');
    const old = { items: [{ id: 'old' }], total: 1 };
    const query = new tanstack.QueryClient({ defaultOptions: { queries: { retry: false } } });
    const key = ['song-library', 'fixture']; query.setQueryData(key, old);
    let querySignal;
    h.fetch = () => new Promise(() => {});
    const request = observed(query.fetchQuery({ queryKey: key, staleTime: 0, queryFn: ({ signal }) => {
      querySignal = signal; return metadata.loadSongLibrary(repo, signal);
    } }));
    await tick(); await query.cancelQueries({ queryKey: key }); await request;
    assert.equal(querySignal.aborted, true); assert.equal(h.requests[0].init.signal.aborted, true);
    assert.deepEqual(query.getQueryData(key), old); assert.equal(h.expired, 0); assert.equal(h.fallback, 0); h.cleaned(); query.clear();
  });
  await test('pagination forwards the signal to every page and stops after cancellation', async () => {
    const h = harness(); const external = h.controller(); const second = deferred();
    h.fetch = async uri => new URL(uri).searchParams.get('offset') === '0'
      ? json({ success: true, data: { total: 2, songs: [{ id: 'first', title: 'First' }] } })
      : { ...json(empty), text: () => second.promise };
    const metadata = load('src/features/library/load-song-library.ts');
    const result = observed(metadata.loadSongLibrary(repository(h), external.signal)); await tick();
    assert.equal(h.requests.length, 2); external.abort(); kind(h, await result, 'cancelled'); h.cleaned();
    second.resolve(JSON.stringify(empty)); await tick(); assert.equal(h.requests.length, 2);
  });
  await test('album/artist/checkSession/logout use signals; streams stay outside JSON timeout', async () => {
    const h = harness(); const external = h.controller(); h.fetch = () => new Promise(() => {});
    const album = observed(repository(h).albums({ offset: 0, limit: 1, signal: external.signal }));
    const artist = observed(repository(h).artists({ offset: 0, limit: 1, signal: external.signal }));
    const check = observed(h.client.checkSession(external.signal));
    const logout = observed(h.client.logout(external.signal));
    external.abort(); for (const result of await Promise.all([album, artist, check, logout])) kind(h, result, 'cancelled');
    assert.equal(h.requests.length, 6); assert.ok(h.requests.every(request => request.init.signal.aborted)); h.cleaned();
    const count = h.requests.length; const source = h.client.streamSource({ id: 'stream-fixture' });
    assert.equal(h.requests.length, count); assert.equal(new URL(source.uri).searchParams.get('method'), 'stream'); h.cleaned();
  });
  await test('discovery/login keep POST params and expose cancellation without modifying auth codes', async () => {
    const h = harness(); let stage = 0;
    h.fetch = async (_, init) => ++stage === 1 ? json({ success: true, data: apis }) : json({ success: true, data: { sid: 'fixture-result' } });
    const session = await h.api.login('https://example.invalid', 'fixture', 'fixture-password', 'fixture-otp');
    assert.equal(session.sid, 'fixture-result'); assert.equal(h.requests[1].init.method, 'POST');
    const params = new URLSearchParams(h.requests[1].init.body);
    assert.equal(params.get('session'), 'AudioStation'); assert.equal(params.get('otp_code'), 'fixture-otp'); h.cleaned();
    const external = h.controller(); h.fetch = () => new Promise(() => {});
    const pending = observed(h.api.discover('https://example.invalid', external.signal)); external.abort(); kind(h, await pending, 'cancelled'); h.cleaned();
  });
  console.log('HTTP lifecycle verified with mock fetch, fake timers, RN AbortController and real TanStack Query. No NAS requests or audio downloads were performed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
