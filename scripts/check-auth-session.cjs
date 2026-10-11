const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..');
const staged = process.argv[3];
const projectRequire = createRequire(path.join(root, 'package.json'));
const ts = projectRequire('typescript');
const { create } = projectRequire('zustand');
function load(file, overrides = {}) {
  const stagedFile = staged && path.join(staged, path.basename(file));
  const source = fs.readFileSync(stagedFile && fs.existsSync(stagedFile) ? stagedFile : path.join(root, file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => name in overrides ? overrides[name] : projectRequire(name), mod, mod.exports);
  return mod.exports;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate) {
  for (let i = 0; i < 50; i++) { if (predicate()) return; await tick(); }
  throw new Error('Expected asynchronous step was not reached');
}
const observed = promise => promise.then(() => null, error => error);
const fixture = (account, sid = account) => ({ baseUrl: 'https://example.invalid', account, sid, apis: {} });
const saved = session => JSON.stringify({ baseUrl: session.baseUrl, account: session.account, sid: session.sid });
const api = load('src/services/synology/api.ts');
function harness(initial = null) {
  const h = {
    value: initial && saved(initial), calls: [], login: async (_, account) => fixture(account),
    discover: async () => ({}), check: async () => {}, logout: async () => {},
    songs: async () => ({ items: [], total: 0 }), storageHook: async () => {},
  };
  const secure = {
    getItemAsync: async () => { h.calls.push('get'); await h.storageHook('get'); return h.value; },
    setItemAsync: async (_, value) => { h.calls.push('set'); await h.storageHook('set', value); h.value = value; },
    deleteItemAsync: async () => { h.calls.push('delete'); await h.storageHook('delete'); h.value = null; },
  };
  class Client {
    constructor(session) { this.session = session; }
    checkSession() { return h.check(this.session); }
    logout() { return h.logout(this.session); }
    songs(page) { return h.songs(this.session, page); }
    albums() { return Promise.resolve({ items: [], total: 0 }); }
    artists() { return Promise.resolve({ items: [], total: 0 }); }
    streamSource() { return { uri: 'https://example.invalid/audio' }; }
  }
  h.api = { ...api, discover: (...args) => h.discover(...args), login: (...args) => h.login(...args), SynologyClient: Client };
  h.auth = load('src/stores/auth.ts', { 'expo-secure-store': secure, '@/services/synology/api': h.api }).useAuthStore;
  h.connect = account => h.auth.getState().connect('https://example.invalid', account, 'fixture-password');
  h.repository = load('src/features/library/repository.ts', {
    '@/stores/streaming-preferences': { useStreamingPreferences: { getState: () => ({ quality: 'original', load: async () => {} }) } },
    './mock-repository': { mockRepository: {} }, '@/services/synology/api': h.api,
    '@/stores/auth': { useAuthStore: h.auth },
    '@/services/synology/cache': { cachePage: async () => {}, cachedPage: async () => null },
  }).musicRepository;
  return h;
}
function assertAccount(h, account) {
  assert.equal(h.auth.getState().mode, 'nas');
  assert.equal(h.auth.getState().session.account, account);
  assert.equal(JSON.parse(h.value).account, account);
}
async function test(name, run) { await run(); console.log('PASS: ' + name); }
async function main() {
  await test('normal login, saved-session bootstrap and logout', async () => {
    const h = harness(fixture('restored'));
    await h.auth.getState().bootstrap();
    assertAccount(h, 'restored');
    await h.connect('  next  ');
    assertAccount(h, 'next');
    await h.auth.getState().disconnect('https://next.invalid');
    assert.equal(h.auth.getState().mode, 'setup');
    assert.equal(h.auth.getState().preferredAddress, 'https://next.invalid');
    assert.equal(h.value, null);
  });
  for (const error of [new api.SynologyError('NAS HTTP 오류 401.'), new api.SessionExpiredError(106), new api.SynologyError('denied', 105)]) {
    await test('old library error cannot expire a newer login: ' + (error.code ?? 'HTTP 401'), async () => {
      const h = harness(); await h.connect('old');
      const response = deferred(); h.songs = () => response.promise;
      const request = observed(h.repository().songs({ offset: 0, limit: 1 }));
      await h.connect('new');
      const deletes = h.calls.filter(call => call === 'delete').length;
      response.reject(error); assert.equal(await request, error);
      assertAccount(h, 'new');
      assert.equal(h.calls.filter(call => call === 'delete').length, deletes);
    });
  }
  await test('old expiry cannot cancel a newer login while it is pending', async () => {
    const h = harness(); await h.connect('old');
    const response = deferred(); h.songs = () => response.promise;
    const request = observed(h.repository().songs({ offset: 0, limit: 1 }));
    const login = deferred(); h.login = () => login.promise;
    const connecting = h.connect('new');
    response.reject(new api.SessionExpiredError(106)); await request;
    login.resolve(fixture('new')); await connecting;
    assertAccount(h, 'new');
  });
  for (const fails of [false, true]) {
    await test('older login ' + (fails ? 'failure' : 'success') + ' cannot overwrite the latest login', async () => {
      const h = harness(); const login = deferred();
      h.login = (_, account) => account === 'old' ? login.promise : Promise.resolve(fixture(account));
      const older = observed(h.connect('old'));
      await h.connect('new');
      if (fails) login.reject(new api.SynologyError('fixture login failure', 401));
      else login.resolve(fixture('old'));
      assert.ok(await older instanceof Error); assertAccount(h, 'new');
    });
  }
  await test('bootstrap completing after logout cannot restore authentication', async () => {
    const h = harness(fixture('old')); const discovery = deferred();
    h.discover = () => discovery.promise;
    const bootstrap = h.auth.getState().bootstrap();
    await until(() => h.calls.includes('get'));
    await tick(); await h.auth.getState().disconnect();
    discovery.resolve({}); await bootstrap;
    assert.equal(h.auth.getState().mode, 'setup'); assert.equal(h.value, null);
    await h.auth.getState().bootstrap(); assert.equal(h.auth.getState().mode, 'setup');
  });
  await test('obsolete bootstrap failure cannot delete a new saved session', async () => {
    const h = harness(fixture('old')); const discovery = deferred();
    h.discover = () => discovery.promise;
    const bootstrap = h.auth.getState().bootstrap(); await tick();
    await h.connect('new'); discovery.reject(new api.SessionExpiredError(106)); await bootstrap;
    assertAccount(h, 'new'); assert.equal(h.calls.includes('delete'), false);
  });
  await test('delayed logout cannot delete or clear a newer session', async () => {
    const h = harness(); await h.connect('old'); const logout = deferred();
    h.logout = () => logout.promise;
    const disconnecting = h.auth.getState().disconnect();
    await h.connect('new'); logout.resolve(); await disconnecting;
    assertAccount(h, 'new'); assert.equal(h.calls.includes('delete'), false);
  });
  await test('in-flight expiry delete is serialized before a newer saved session', async () => {
    const h = harness(); await h.connect('old'); const deletion = deferred();
    h.storageHook = action => action === 'delete' ? deletion.promise : Promise.resolve();
    const state = h.auth.getState(); const expiry = state.expire(state.session, state.generation);
    await until(() => h.calls.includes('delete'));
    const connecting = h.connect('new'); await tick();
    assert.equal(JSON.parse(h.value).account, 'old');
    deletion.resolve(); await Promise.all([expiry, connecting]); assertAccount(h, 'new');
  });
  for (const newerFails of [false, true]) {
    await test('obsolete in-flight write rolls back, newer login ' + (newerFails ? 'fails' : 'succeeds'), async () => {
      const h = harness(); await h.connect('original'); const write = deferred();
      h.storageHook = (action, value) => action === 'set' && JSON.parse(value).account === 'old' ? write.promise : Promise.resolve();
      const older = observed(h.connect('old'));
      await until(() => h.calls.filter(call => call === 'set').length === 2);
      if (newerFails) h.login = async () => { throw new api.SynologyError('fixture login failure', 401); };
      const newer = observed(h.connect('new')); await tick(); write.resolve();
      assert.ok(await older instanceof Error);
      if (newerFails) { assert.ok(await newer instanceof Error); assertAccount(h, 'original'); }
      else { assert.equal(await newer, null); assertAccount(h, 'new'); }
    });
  }
  await test('current-session expiry still clears authentication and storage', async () => {
    const h = harness(); await h.connect('current');
    h.songs = async () => { throw new api.SessionExpiredError(106); };
    await assert.rejects(h.repository().songs({ offset: 0, limit: 1 }), api.SessionExpiredError);
    assert.equal(h.auth.getState().mode, 'setup'); assert.equal(h.auth.getState().session, null);
    assert.equal(h.value, null); assert.ok(h.auth.getState().notice);
  });
  await test('failed storage write does not poison later logins', async () => {
    const h = harness(); h.storageHook = async action => { if (action === 'set') throw new Error('fixture storage failure'); };
    await assert.rejects(h.connect('failed'), /storage failure/);
    h.storageHook = async () => {}; await h.connect('new'); assertAccount(h, 'new');
  });
  await test('mock mode invalidates a pending login without overwriting saved credentials', async () => {
    const h = harness(fixture('saved')); const login = deferred(); h.login = () => login.promise;
    const connecting = observed(h.connect('old')); h.auth.getState().useMock();
    login.resolve(fixture('old')); assert.ok(await connecting instanceof Error);
    assert.equal(h.auth.getState().mode, 'mock'); assert.equal(JSON.parse(h.value).account, 'saved');
  });
  await test('playback session check cannot expire a newer login', async () => {
    const h = harness(); await h.connect('old');
    const rules = load('src/features/hidden-music/rules.ts');
    const privacy = create(() => ({ ready: true, scope: rules.privacyScope('nas', h.auth.getState().session), profile: rules.emptyProfile() }));
    const playback = load('src/stores/playback.ts').usePlaybackStore;
    let listener;
    class Engine {
      subscribe(callback) { listener = callback; return () => {}; }
      subscribeRemoteNavigation() { return () => {}; }
      async load() {} pause() {} release() {}
    }
    const controller = load('src/services/playback/controller.ts', {
      './audio-engine': { ExpoAudioEngine: Engine }, '@/services/synology/api': h.api,
      '@/features/library/repository': { musicRepository: h.repository }, '@/stores/auth': { useAuthStore: h.auth },
      '@/stores/playback': { usePlaybackStore: playback }, '@/stores/hidden-music': { useHiddenMusicStore: privacy },
      '@/features/hidden-music/rules': rules,
      '@/stores/player-background': { usePlayerBackgroundStore: { getState: () => ({ selectArtwork() {}, reset() {} }) } },
    });
    await controller.playQueue([{ id: 'fixture', title: 'fixture', artist: 'fixture', album: 'fixture', duration: 1 }]);
    const check = deferred(); h.check = session => session.account === 'old' ? check.promise : Promise.resolve();
    listener({ playing: false, buffering: false, position: 0, duration: 1, error: 'fixture playback error' });
    await h.connect('new'); check.reject(new api.SessionExpiredError(106)); await tick();
    assertAccount(h, 'new'); controller.stopPlayback();
  });
  console.log('Auth races verified with actual store/repository/controller code. NAS, SecureStore and audio native modules are mocked; no credentials are printed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
