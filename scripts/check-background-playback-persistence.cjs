const assert = require('node:assert/strict');
const { loadSource } = require('./test-source-loader.cjs');
const { create } = require('zustand');
const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
async function main() {
  let now = Date.now(), timerId = 0, writes = 0;
  const timers = new Map(), values = new Map(), listeners = new Set();
  const playback = loadSource('src/stores/playback.ts', { zustand: { create } }).usePlaybackStore;
  const state = { currentState: 'active', addEventListener: (_event, listener) => { listeners.add(listener); return { remove: () => listeners.delete(listener) }; } };
  const background = () => { state.currentState = 'background'; listeners.forEach(listener => listener('background')); };
  const song = id => ({ id, source: 'nas', title: id, artist: 'Artist', album: 'Album', albumSource: 'tag', duration: 180 });
  const queue = [song('first'), song('last')];
  const empty = { connection: null, songs: [] };
  const dependencies = {
    'react-native': { Platform: { OS: 'android' }, AppState: state },
    'expo-sqlite/kv-store': { __esModule: true, default: {
      getItem: async key => values.get(key) ?? null,
      setItem: async (key, value) => { writes++; values.set(key, value); },
      removeItem: async key => { writes++; values.delete(key); },
    } },
    '@/stores/playback': { usePlaybackStore: playback },
    '@/stores/auth': { useAuthStore: { getState: () => ({ mode: 'nas', session: { baseUrl: 'https://nas.invalid', account: 'user' } }) } },
    '@/stores/hidden-music': { useHiddenMusicStore: { getState: () => ({ ready: true, scope: 'account', profile: { presets: [] } }) } },
    '@/stores/google-drive': { useGoogleDriveStore: { getState: () => ({ account: null, files: [], songs: [] }) } },
    '@/stores/drive-documents': { useDriveDocumentsStore: { getState: () => ({ songs: [] }) } },
    '@/stores/local-music': { useLocalMusicStore: { getState: () => ({ songs: [] }) } },
    '@/stores/s3': { useS3Store: { getState: () => empty } },
    '@/stores/mybox': { useMyboxStore: { getState: () => empty } },
    '@/features/hidden-music/rules': { privacyScope: () => 'account', hiddenMatcher: () => () => false },
    '@/features/artwork/rules': { applySongArtwork: song => song },
    '@/services/synology/api': { SynologyClient: class { coverUrl(id) { return 'https://nas.invalid/cover/' + id; } } },
  };
  const globals = {
    Date: class extends Date { static now() { return now; } },
    setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout: id => timers.delete(id),
  };
  const persistence = loadSource('src/services/playback/persistence.ts', dependencies, globals);
  playback.getState().setQueue(queue, 0); playback.getState().setStatus({ position: 15, duration: 180, playing: true, buffering: false });
  const stop = persistence.startPlaybackPersistence();
  background(); await flush();
  assert.equal((await persistence.readRestoredPlayback()).position, 0);
  const baselineWrites = writes;
  // Android pauses JS timer frames while native audio status events still arrive.
  // Never run the virtual timer callbacks throughout this background session.
  for (let i = 1; i <= 60; i++) {
    now += 1000;
    playback.getState().setStatus({ position: 15 + i });
    await flush();
  }
  assert.equal((await persistence.readRestoredPlayback()).position, 0);
  assert.equal(playback.getState().position, 75, 'Progress continues normally in the live player');
  assert.equal(writes, baselineWrites, 'Elapsed background progress must never write a periodic checkpoint');
  playback.getState().setQueue(queue, 1);
  playback.getState().setStatus({ playing: true, buffering: false, position: 12, duration: 180 });
  await flush();
  let restored = await persistence.readRestoredPlayback();
  assert.equal(restored.queue[restored.index].id, 'last', 'Auto-advance must checkpoint the current song immediately');
  assert.equal(restored.position, 0);
  assert.equal(persistence.startPlaybackPersistence(), stop, 'Activity recreation must reuse the existing recorder');
  assert.equal(listeners.size, 0, 'Recording no longer listens for lifecycle position saves');
  const afterTrackWrites = writes;
  // Fine-grained progress must not accumulate into a periodic checkpoint either.
  for (let i = 1; i <= 120; i++) {
    now += 250; playback.getState().setStatus({ position: 12 + i / 4 }); await flush();
  }
  restored = await persistence.readRestoredPlayback(); assert.equal(restored.position, 0);
  assert.equal(writes, afterTrackWrites);
  // Simulate process death: dispose the recorder, then restore from disk only.
  stop(); playback.getState().clear();
  restored = await persistence.readRestoredPlayback();
  assert.equal(restored.queue[restored.index].id, 'last'); assert.equal(restored.position, 0);
  assert.equal(restored.queue[restored.index].duration, 180, 'A zero-position restore still has its complete slider range');
  const nextStop = persistence.startPlaybackPersistence(); stop();
  assert.equal(persistence.startPlaybackPersistence(), nextStop, 'A disposed recorder cannot stop a newer recorder');
  playback.getState().setQueue(queue, 1); playback.getState().setStatus({ position: 21.25, playing: false, buffering: false, duration: 180 });
  await flush(); assert.equal((await persistence.readRestoredPlayback()).position, 0);
  const pausedWrites = writes;
  playback.getState().setStatus({ position: 23.5 }); await flush();
  assert.equal(playback.getState().position, 23.5); assert.equal(writes, pausedWrites, 'Paused seeking remains in memory without a position write');
  nextStop();
  console.log('PASS: no periodic or seek-position writes, latest-song checkpoints, full slider duration, recorder reuse, uninterrupted live progress and cold restoration at zero. Native audio, lifecycle and SQLite are mocked.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
