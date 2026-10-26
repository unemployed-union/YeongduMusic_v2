/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, dependencies) {
  const modules = { ...require('./test-cloud-fixtures.cjs').cloudFixtures({}, dependencies), ...dependencies };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => { if (name in modules) return modules[name]; if (name === 'zustand') return require('zustand'); throw Error('Unexpected recovery dependency ' + name); }, exports);
  return exports;
}
function deferred() { let resolve; const promise = new Promise(ok => { resolve = ok; }); return { promise, resolve }; }
const tick = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const ready = { ready: true, privacyReady: true, privacyScope: 'account', scope: 'account', localReady: true, driveReady: true, s3Ready: true, driveAccountId: 'drive' };
function harness() {
  const refs = [], effects = [], cleanups = [], navigation = [];
  let slot = 0, reads = 0, restores = 0, starts = 0, stops = 0, readGate;
  const live = { queue: [], index: -1, playing: false };
  const saved = { queue: [{ id: 'saved' }], index: 0, position: 17, playing: true, shuffle: true, repeat: 'all' };
  const modules = {
    react: { useRef: value => { const i = slot++; return refs[i] ?? (refs[i] = { current: value }); }, useEffect: effect => effects.push(effect) },
    'expo-router': { router: { navigate: route => navigation.push(route) } },
    '@/stores/playback': { usePlaybackStore: { getState: () => live } },
    '@/services/playback/persistence': { readRestoredPlayback: async () => { reads++; return readGate ? readGate.promise : saved; }, startPlaybackPersistence: () => { starts++; return () => { stops++; }; } },
    '@/services/playback/controller': { restorePlayback: async (queue, index, position, playing, shuffle, repeat) => {
      restores++; assert.equal(playing, false, 'A saved playing flag must never restart stopped music on launch');
      assert.equal(position, 17); assert.equal(shuffle, true); assert.equal(repeat, 'all'); Object.assign(live, { queue, index, position, playing }); return true;
    } },
  };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, 'src/features/startup/use-playback-recovery.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const hooks = {};
  new Function('require', 'exports', code)(name => { if (name in modules) return modules[name]; throw Error('Unexpected dependency ' + name); }, hooks);
  return { live, saved, navigation, render(props = ready) { slot = 0; effects.length = 0; hooks.usePlaybackRecovery(props); effects.forEach(effect => cleanups.push(effect())); },
    unmount() { cleanups.splice(0).forEach(cleanup => cleanup?.()); }, setGate(gate) { readGate = gate; },
    get counts() { return { reads, restores, starts, stops }; } };
}
async function main() {
  for (const field of ['ready', 'privacyReady', 'localReady', 'driveReady', 's3Ready', 'privacyScope']) {
    const h = harness(); h.render({ ...ready, [field]: field === 'privacyScope' ? 'other-account' : false }); await tick();
    assert.deepEqual(h.counts, { reads: 0, restores: 0, starts: 0, stops: 0 }, 'Wait for ' + field);
    h.unmount(); h.render(); await tick();
    assert.deepEqual(h.counts, { reads: 1, restores: 1, starts: 1, stops: 0 }); assert.deepEqual(h.navigation, ['/(tabs)/(library)']);
    assert.equal(h.live.playing, false); assert.equal(h.live.position, 17); assert.equal(h.live.queue[0].id, 'saved');
    h.unmount(); assert.equal(h.counts.stops, 1);
  }
  for (const wasPlaying of [true, false]) {
    const h = harness(); h.saved.playing = wasPlaying; h.render(); await tick();
    assert.equal(h.counts.restores, 1); assert.equal(h.live.playing, false);
    assert.deepEqual(h.navigation, ['/(tabs)/(library)']); h.unmount();
  }
  {
    const h = harness(), gate = deferred(); h.setGate(gate); h.render(); await tick(); h.unmount(); gate.resolve(h.saved); await tick();
    assert.deepEqual(h.counts, { reads: 1, restores: 0, starts: 0, stops: 0 }); assert.equal(h.navigation.length, 0);
  }
  {
    const h = harness(), gate = deferred(); h.setGate(gate); h.render(); await tick();
    Object.assign(h.live, { queue: [{ id: 'user-selected' }], index: 0, playing: true }); gate.resolve(h.saved); await tick();
    assert.equal(h.counts.restores, 0); assert.equal(h.live.queue[0].id, 'user-selected'); assert.equal(h.counts.starts, 1); h.unmount();
  }
  for (const playing of [true, false]) {
    const h = harness(); Object.assign(h.live, { queue: [{ id: 'live' }], index: 0, playing }); h.render(); await tick();
    assert.equal(h.counts.reads, 0); assert.equal(h.counts.restores, 0); assert.equal(h.counts.starts, 1);
    assert.deepEqual(h.navigation, [playing ? '/player' : '/(tabs)/(library)']);
    h.unmount(); assert.equal(h.counts.stops, 1);
  }
  await checkManualResume();
  console.log('PASS: paused cold restoration despite saved playing flags, no audio/source loading before user play, manual resume at saved position, readiness/account gates, cancelled restoration, newer user queue precedence, live background player preservation and persistence cleanup.');
}
async function checkManualResume() {
  const playback = load('src/stores/playback.ts', {}).usePlaybackStore;
  const { create } = require('zustand');
  let engines = 0, sourceReads = 0, listener;
  const loads = [];
  class Engine {
    constructor() { engines++; }
    subscribe(callback) { listener = callback; }
    subscribeRemoteNavigation() {}
    async load(source, song, position) {
      loads.push({ source, id: song.id, position });
      listener({ playing: true, buffering: false, position, duration: 180, ended: false, error: null });
    }
    pause() {}
    release() {}
    setPlaybackRate() {}
    setPreservePitch() {}
  }
  const controller = load('src/services/playback/controller.ts', {
    './audio-engine': { ExpoAudioEngine: Engine }, '@/stores/playback': { usePlaybackStore: playback },
    '@/stores/auth': { useAuthStore: { getState: () => ({ mode: 'mock', session: null }) } },
    '@/stores/hidden-music': { useHiddenMusicStore: create(() => ({ ready: true, scope: 'demo', profile: { presets: [] } })) },
    '@/features/hidden-music/rules': { hiddenMatcher: () => () => false, privacyScope: () => 'demo' },
    '@/features/library/repository': { musicRepository: () => ({ streamSource: async () => { sourceReads++; return { uri: 'https://example.invalid/song.mp3' }; } }) },
    '@/services/synology/api': { SessionExpiredError: class extends Error {}, SynologyError: class extends Error {} },
    '@/stores/player-background': { usePlayerBackgroundStore: { getState: () => ({ selectArtwork() {}, reset() {} }) } },
  });
  const song = { id: 'saved-track', source: 'nas', title: 'Saved', artist: 'Artist', album: 'Album', duration: 180 };
  assert(await controller.restorePlayback([song], 0, 37, false, true, 'all', 1.5, false));
  assert.equal(playback.getState().playing, false); assert.equal(playback.getState().position, 37);
  assert.equal(playback.getState().shuffle, true); assert.equal(playback.getState().repeat, 'all');
  assert.equal(playback.getState().playbackRate, 1.5); assert.equal(playback.getState().preservePitch, false);
  assert.equal(engines, 0); assert.equal(sourceReads, 0, 'Restoration does not open a stream or create an audio player');
  controller.togglePlayback(); await tick();
  assert.equal(sourceReads, 1); assert.equal(engines, 1); assert.equal(loads.length, 1);
  assert.equal(loads[0].position, 37); assert.equal(playback.getState().playing, true);
  controller.stopPlayback();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
