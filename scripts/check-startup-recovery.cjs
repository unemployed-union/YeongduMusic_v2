/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
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
      restores++; assert.equal(position, 17); assert.equal(shuffle, true); assert.equal(repeat, 'all'); Object.assign(live, { queue, index, playing }); return true;
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
    assert.deepEqual(h.counts, { reads: 1, restores: 1, starts: 1, stops: 0 }); assert.deepEqual(h.navigation, ['/player']);
    h.unmount(); assert.equal(h.counts.stops, 1);
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
  console.log('PASS: startup readiness/account gates, cancelled restoration, newer user queue precedence, live/paused player routing and persistence cleanup.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
