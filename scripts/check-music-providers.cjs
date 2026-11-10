const assert = require('node:assert/strict');
const { loadSource } = require('./test-source-loader.cjs');
const { providerFixtures } = require('./test-provider-fixtures.cjs');

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function main() {
  const fixtures = providerFixtures();
  const registry = fixtures['@/services/music-providers/registry'];
  assert.deepEqual(
    registry.musicProviders.map((provider) => provider.id),
    ['nas', 'local', 'drive', 's3', 'mybox', 'jellyfin'],
  );
  assert.equal(registry.providerForSong({ id: 'legacy' }).id, 'nas');
  assert.equal(registry.musicProvider('jellyfin').download, undefined);
  assert.equal(registry.musicProvider('jellyfin').fileWrite, undefined);
  assert.equal(registry.musicProvider('jellyfin').lyrics, undefined);
  assert(registry.musicProvider('jellyfin').playlists);
  assert(registry.musicProvider('drive').download);
  assert.equal(registry.musicProvider('drive').fileWrite, undefined);
  assert(registry.musicProvider('s3').fileWrite);
  assert.equal(
    registry.providerSnapshots(),
    registry.providerSnapshots(),
    'External store snapshots remain stable',
  );

  let selectedSource = 'jellyfin';
  const cachedLibrary = {
    ready: true,
    busy: false,
    connection: { baseUrl: 'https://fixture.invalid/music', serverId: 'server', userId: 'user' },
    songs: [{ id: 'cached-track', source: 'jellyfin' }],
    stale: true,
  };
  const cachedRegistry = providerFixtures({
    '@/stores/jellyfin': { useJellyfinStore: { getState: () => cachedLibrary } },
  })['@/services/music-providers/registry'];
  const { useSourceLibraries } = loadSource('src/features/library/use-source-libraries.ts', {
    react: {
      useEffect() {},
      useMemo: (read) => read(),
      useSyncExternalStore: (_subscribe, read) => read(),
    },
    '@/services/music-providers/registry': cachedRegistry,
    '@/services/music-providers/library-tasks': {},
    '@/stores/local-music': { useLocalMusicStore: (select) => select({ source: selectedSource }) },
  });
  assert.equal(
    useSourceLibraries().stale,
    true,
    'A selected cached library keeps its stale notice',
  );
  selectedSource = 'nas';
  assert.equal(
    useSourceLibraries().stale,
    false,
    'An unrelated source does not inherit the cache notice',
  );
  selectedSource = 'all';
  cachedLibrary.connection = null;
  assert.deepEqual(
    useSourceLibraries().libraries.jellyfin,
    [],
    'Disconnected account cache stays hidden',
  );
  assert.equal(useSourceLibraries().stale, false);

  let generation = 1;
  let scope = 'account-a';
  const gate = deferred();
  let releases = 0;
  const sourceProvider = {
    getState: () => ({ generation, scope }),
    streamSource: () => gate.promise,
  };
  const resolver = loadSource('src/services/playback/source.ts', {
    '@/services/music-providers/registry': { providerForSong: () => sourceProvider },
  });
  const pending = resolver.resolvePlaybackSource({ id: 'track' });
  generation++;
  gate.resolve({
    uri: 'https://fixture.invalid/audio',
    release: async () => {
      releases++;
    },
  });
  await assert.rejects(pending, /취소/);
  assert.equal(releases, 1, 'An obsolete prepared stream is released');
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(
    resolver.resolvePlaybackSource({ id: 'track' }, { signal: abort.signal }),
    /취소/,
  );

  const requests = [];
  let cancellations = 0;
  const libraryProvider = {
    id: 'jellyfin',
    catalog: 'stored',
    getState: () => ({ generation, scope, ready: true, connected: true, loading: true, songs: [] }),
    refresh: (signal) => {
      const task = deferred();
      requests.push({ signal, task });
      return task.promise;
    },
    cancelLibrary: () => {
      cancellations++;
    },
  };
  const tasks = loadSource('src/services/music-providers/library-tasks.ts', {
    './registry': { musicProviders: [libraryProvider] },
    './library-snapshots': { librarySnapshotKey: (...parts) => JSON.stringify(parts), readLibrarySnapshot: async () => null, writeLibrarySnapshot: async () => {} },
  });
  const stopFirst = tasks.acquireProviderLibraries('all');
  const stopSecond = tasks.acquireProviderLibraries('jellyfin');
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.equal(requests.length, 1, 'Mounted pages share a selected library request');
  stopFirst();
  assert.equal(requests[0].signal.aborted, false);
  stopSecond();
  assert.equal(requests[0].signal.aborted, true);
  assert.equal(cancellations, 1, 'Only the final consumer cancels the library');
  const stopOld = tasks.acquireProviderLibraries('jellyfin');
  for (let i = 0; i < 10; i++) await Promise.resolve();
  scope = 'account-b';
  generation++;
  const stopNew = tasks.acquireProviderLibraries('jellyfin');
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.equal(requests[1].signal.aborted, true, 'Changing accounts cancels the old request');
  stopOld();
  assert.equal(requests[2].signal.aborted, false, 'An old page cannot cancel the newer account');
  stopNew();
  requests.forEach(({ task }) => task.resolve());

  const timers = new Map();
  let timerId = 0;
  const listeners = new Map();
  const nativeSources = [];
  const nativeSeeks = [];
  const player = {
    currentTime: 0,
    isLoaded: true,
    addListener: (event, listener) => {
      listeners.set(event, listener);
      return { remove: () => listeners.delete(event) };
    },
    replace: (source) => nativeSources.push(source),
    play() {},
    pause() {},
    release() {},
    seekTo: async (position) => {
      nativeSeeks.push(position);
    },
  };
  const { ExpoAudioEngine } = loadSource(
    'src/services/playback/audio-engine.ts',
    {
      'expo-audio': { createAudioPlayer: () => player, setAudioModeAsync: async () => {} },
      'expo-constants': {
        __esModule: true,
        default: { appOwnership: 'expo' },
        AppOwnership: { Expo: 'expo' },
      },
      'react-native': { Platform: { OS: 'android' } },
    },
    {
      __DEV__: false,
      setTimeout: (callback) => {
        timers.set(++timerId, callback);
        return timerId;
      },
      clearTimeout: (id) => timers.delete(id),
    },
  );
  const engine = new ExpoAudioEngine();
  const statuses = [];
  engine.subscribe((status) => statuses.push(status));
  await engine.load(
    {
      uri: 'https://fixture.invalid/stream.mp3',
      positionOffset: 45,
      seekMode: 'reload',
      reloadOnError: true,
      release: async () => {},
    },
    {
      id: 'track',
      title: 'Track',
      artist: 'Artist',
      album: 'Album',
      duration: 120,
      source: 'jellyfin',
    },
    45,
  );
  assert.equal(nativeSources[0].positionOffset, undefined);
  assert.equal(
    nativeSources[0].release,
    undefined,
    'JS lifecycle callbacks never cross the native source boundary',
  );
  player.currentTime = 3;
  listeners.get('playbackStatusUpdate')({
    isLoaded: true,
    currentTime: 3,
    duration: 75,
    playing: true,
    isBuffering: false,
  });
  assert.equal(statuses.at(-1).position, 48);
  assert.equal(statuses.at(-1).duration, 120);
  assert.equal(engine.getPosition(), 48);
  await engine.seek(60);
  assert.equal(nativeSeeks.at(-1), 15, 'The native clock uses stream-relative time');
  listeners.get('playbackStatusUpdate')({
    error: 'fixture failure',
    currentTime: 15,
    duration: 75,
    playing: false,
  });
  assert(statuses.at(-1).error);
  assert.equal(timers.size, 0, 'Provider recovery does not race a native source retry timer');
  engine.release();
  console.log(
    'PASS: Provider registration/capabilities, stable snapshots, obsolete stream cleanup, shared library cancellation and transcoded native clock mapping. Native boundaries are mocked.',
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
