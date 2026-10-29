/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const ts = require('typescript'), { create } = require('zustand');
function load(file, mocks, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, exports = {};
  const shared = require('./test-cloud-fixtures.cjs').cloudFixtures(globals, mocks);
  new Function('require', 'exports', ...Object.keys(globals), code)(name => {
    if (name in mocks) return mocks[name]; if (name in shared) return shared[name]; throw Error(name);
  }, exports, ...Object.values(globals));
  return exports;
}
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
async function main() {
  let now = 100000, nextId = 0, allocations = 0, writes = 0, saved;
  const timers = new Map(), listeners = new Set();
  const app = { currentState: 'active', addEventListener: (_, fn) => { listeners.add(fn); return { remove: () => listeners.delete(fn) }; } };
  const change = state => { app.currentState = state; [...listeners].forEach(fn => fn(state)); };
  const song = { id: 'one', title: 'Track', artist: 'Artist', album: 'Album', duration: 180 };
  const playback = create(() => ({ queue: [song], index: 0, position: 0, playing: true, shuffle: false, repeat: 'off', playbackRate: 1, preservePitch: true }));
  const persistence = load('src/services/playback/persistence.ts', {
    'react-native': { Platform: { OS: 'android' }, AppState: app }, '@/stores/playback': { usePlaybackStore: playback },
    '@/stores/auth': { useAuthStore: { getState: () => ({ mode: 'mock', session: null }) } },
    '@/features/hidden-music/rules': { privacyScope: () => 'demo', hiddenMatcher: () => () => false },
    '@/stores/hidden-music': { useHiddenMusicStore: { getState: () => ({ ready: true, scope: 'demo', profile: { presets: [] } }) } },
    '@/stores/local-music': { useLocalMusicStore: { getState: () => ({ songs: [] }) } },
    '@/stores/google-drive': { useGoogleDriveStore: { getState: () => ({ songs: [], account: null }) } },
    '@/services/synology/api': { SynologyClient: class {} },
    'expo-sqlite/kv-store': { __esModule: true, default: { setItem: async (_, value) => { writes++; saved = JSON.parse(value); }, removeItem: async () => { writes++; saved = null; } } },
  }, {
    Date: class extends Date { static now() { return now; } },
    setTimeout: (fn, ms) => { allocations++; timers.set(++nextId, { fn, due: now + ms }); return nextId; },
    clearTimeout: id => timers.delete(id),
  });
  async function advance(ms) {
    const until = now + ms;
    while (true) {
      const next = [...timers].sort((a, b) => a[1].due - b[1].due).find(([, value]) => value.due <= until);
      if (!next) break;
      timers.delete(next[0]); now = next[1].due; next[1].fn(); await flush();
    }
    now = until; await flush();
  }
  async function playFor(seconds) {
    for (let i = 0; i < seconds; i++) {
      playback.setState(state => ({ position: state.position + 1 })); await advance(1000);
    }
  }
  const stop = persistence.startPlaybackPersistence();
  playback.setState({ position: 1 });
  assert.equal(allocations, 0, 'Recording must not create a periodic save timer');
  await advance(250); assert.equal(writes, 1); assert.equal(saved.position, 0);
  const foregroundWrites = writes;
  await playFor(60);
  assert.equal(writes, foregroundWrites, 'Continuous foreground progress does not write checkpoints');
  change('inactive'); await flush();
  const backgroundWrites = writes;
  change('background'); await flush();
  assert.equal(writes, backgroundWrites, 'Inactive-to-background does not save twice');
  const beforeAllocations = allocations;
  await playFor(60);
  assert.equal(writes, backgroundWrites, 'Continuous background progress does not write checkpoints');
  assert.equal(allocations, beforeAllocations, 'Progress samples allocate no save timers');
  playback.setState({ playing: false }); await advance(249);
  assert.equal(writes, backgroundWrites + 1);
  await advance(1); assert.equal(saved.playing, false, 'Pause metadata saves without a timer');
  assert.equal(saved.position, 0);
  change('active'); playback.setState({ queue: [song, { ...song, id: 'two' }], index: 1 });
  await advance(250); assert.equal(saved.index, 1, 'Queue/track changes remain prompt'); assert.equal(saved.position, 0);
  stop(); assert.equal(timers.size, 0); assert.equal(listeners.size, 0);

  let focused = true, unsubscribe, observed;
  const visibility = load('src/features/playback/use-playback-visibility.ts', {
    'react-native': { AppState: app }, 'expo-router': { useIsFocused: () => focused },
    react: { useSyncExternalStore: (subscribe, snapshot) => { unsubscribe?.(); unsubscribe = subscribe(() => { observed = snapshot(); }); return snapshot(); } },
  });
  assert.equal(visibility.usePlaybackVisibility(), true);
  change('background'); assert.equal(observed, false); assert.equal(visibility.usePlaybackVisibility(), false);
  change('active'); assert.equal(visibility.usePlaybackVisibility(), true);
  focused = false; assert.equal(visibility.usePlaybackVisibility(), false, 'Covered routes disable visual playback work');
  unsubscribe(); assert.equal(listeners.size, 0);
  console.log('PASS: no foreground/background progress writes or save timers, zero-position records, prompt pause/queue metadata persistence, cleanup and route/AppState visibility. Battery consumption and device rendering are not measured.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
