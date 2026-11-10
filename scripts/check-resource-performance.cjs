/* global __dirname */
const assert = require('node:assert/strict');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { QueryClient, QueryObserver } = require('@tanstack/react-query');
const { loadSource } = require('./test-source-loader.cjs');

const baselineDirectory = process.argv[2];
const optimized = !baselineDirectory;
const root = path.resolve(__dirname, '..');
function source(file) {
  if (baselineDirectory) {
    return path.resolve(baselineDirectory, path.basename(file) + '.txt');
  }
  return path.join(root, file);
}

const songs = Array.from({ length: 10000 }, (_, index) => ({
  id: 'track-' + index,
  source: 'local',
  local: { fileName: index + '.mp3' },
  title: '음악 Ａ ' + index,
  artist: 'Artist ' + index % 80,
  album: 'Album ' + index % 400,
  duration: 180,
}));
const library = { items: songs, total: songs.length, stale: true };
const measurements = {};

// Count costly normalization calls as well as timing them; timings are Node/V8, not Hermes.
const { searchSongs } = loadSource(source('src/features/library/search-songs.ts'));
const originalNormalize = String.prototype.normalize;
let normalizations = 0;
const terms = ['음악', 'ARTIST 2', 'album 10', 'Ａ', '음악 42', 'missing', 'artist 79', 'album 399', '음악 album', 'track'];
try {
  String.prototype.normalize = function (...args) {
    normalizations++;
    return originalNormalize.apply(this, args);
  };
  const start = performance.now();
  for (const term of terms) {
    searchSongs(library, term);
  }
  measurements.searchTenTerms = {
    milliseconds: performance.now() - start,
    normalizations,
  };
} finally {
  String.prototype.normalize = originalNormalize;
}
assert.equal(searchSongs(library, '  artist 79\tALBUM 399 ').total, 25);
assert.equal(searchSongs(library, 'a').total, 10000, 'NFKC converts full-width letters');
assert.equal(searchSongs({ items: [{ ...songs[0], title: 'Ａ', artist: '', album: '' }], total: 1 }, 'a').total, 1);
assert.equal(searchSongs(library, '').total, 0);
assert.equal(searchSongs(library, 'missing').stale, true);
const duplicates = { ...library, items: [songs[0], songs[0]], total: 2 };
assert.deepEqual(searchSongs(duplicates, '음악').items, duplicates.items);
const accountSong = { ...songs[0], title: 'Account B', artist: 'Other', album: 'Other' };
assert.equal(searchSongs({ items: [accountSong], total: 1 }, '음악').total, 0, 'Equal IDs in another account do not reuse text');
const changedSong = { ...songs[0], title: 'Changed' };
const changedLibrary = { items: [changedSong], total: 1 };
assert.equal(searchSongs(changedLibrary, 'changed').total, 1);
changedSong.title = 'Renamed';
assert.equal(searchSongs(changedLibrary, 'changed').total, 0, 'In-place display edits cannot leave stale search text');
assert.equal(searchSongs(changedLibrary, 'renamed').total, 1);
if (optimized) {
  assert.equal(measurements.searchTenTerms.normalizations, 30010);
}

// Actual adapters, with native storage/network replaced at their boundaries.
let localSongs = songs;
let s3State = { connection: { id: 'a', prefix: '' }, songs: [] };
const adapters = loadSource(source('src/services/music-providers/file-providers.ts'), {
  './contracts': loadSource('src/services/music-providers/contracts.ts'),
  '@/stores/local-music': { useLocalMusicStore: { getState: () => ({ songs: localSongs }) } },
  '@/stores/google-drive': { useGoogleDriveStore: { getState: () => ({ songs: [], files: [] }) } },
  '@/stores/drive-documents': { useDriveDocumentsStore: { getState: () => ({ songs: [] }) } },
  '@/stores/s3': { useS3Store: { getState: () => s3State } },
  '@/stores/mybox': { useMyboxStore: { getState: () => ({ songs: [] }) } },
  '@/services/local-music/storage': {},
});
let started = performance.now();
for (const song of songs) {
  assert.equal(adapters.localProvider.restore(song), song);
}
measurements.restoreTenThousand = { milliseconds: performance.now() - started };

let idReads = 0;
localSongs = songs.map((song) => ({
  ...song,
  get id() {
    idReads++;
    return song.id;
  },
}));
for (const song of songs) {
  adapters.localProvider.restore(song);
}
measurements.restoreTenThousand.idReads = idReads;
if (optimized) {
  assert.equal(idReads, 20000, 'Build one index; do not scan the catalog once per queued song');
}
localSongs = [{ ...songs[0], title: 'Updated' }, { ...songs[0], title: 'Duplicate' }];
assert.equal(adapters.localProvider.restore(songs[0]).title, 'Updated', 'Refresh and first-duplicate semantics');
localSongs = [];
assert.equal(adapters.localProvider.restore(songs[0]), null, 'Removed songs cannot be restored from the old index');
const s3Song = { ...songs[0], source: 's3', s3: { connectionId: 'a', key: 'one.mp3' } };
s3State.songs = [s3Song];
assert.equal(adapters.s3Provider.restore(s3Song).id, s3Song.id);
s3State = { connection: { id: 'b', prefix: '' }, songs: [{ ...s3Song, title: 'Account B', s3: { ...s3Song.s3, connectionId: 'b' } }] };
assert.equal(adapters.s3Provider.restore(s3Song), null, 'Changing accounts rejects the old queue reference');
assert.equal(adapters.s3Provider.restore(s3State.songs[0]).title, 'Account B');

// Model dependency comparison while using the installed QueryObserver and actual catalog transforms.
// This counts selector work, not React commits or native frames.
let activeHook;
let slot;
const slots = new Map();
function memoize(factory, dependencies) {
  const key = activeHook + ':' + slot++;
  const previous = slots.get(key);
  if (previous && dependencies.every((value, index) => Object.is(value, previous.dependencies[index]))) {
    return previous.value;
  }
  const value = factory();
  slots.set(key, { dependencies, value });
  return value;
}
const react = {
  useMemo: memoize,
  useCallback: (callback, dependencies) => memoize(() => callback, dependencies),
  useEffect() {},
  useSyncExternalStore: (_subscribe, read) => read(),
};
let sourceFilter = 'all';
let presets = [];
let metadataPatches = {};
const providers = [
  { id: 'nas', catalog: 'remote' },
  { id: 'local', catalog: 'stored' },
  { id: 'drive', catalog: 'stored' },
];
let states = providers.map((provider) => ({
  ready: true,
  connected: provider.id !== 'drive',
  scope: provider.id,
  generation: 0,
  songs: provider.id === 'local' ? songs : [],
  loading: false,
  error: null,
}));
const registry = { musicProviders: providers, providerSnapshots: () => states, subscribeProviders: () => () => {} };
const sourceHook = loadSource(source('src/features/library/use-source-libraries.ts'), {
  react,
  '@/services/music-providers/registry': registry,
  '@/services/music-providers/library-tasks': {},
  '@/stores/local-music': { useLocalMusicStore: (select) => select({ source: sourceFilter }) },
});
const albumRules = loadSource('src/features/library/album-library.ts');
const privacyRules = loadSource('src/features/hidden-music/rules.ts');
const metadataRules = loadSource('src/features/metadata/rules.ts');
const artworkState = { ready: true, patches: {}, baseUri: '' };
const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity, retry: false } } });
client.setQueryData(['song-library', 'fixture'], { items: [], total: 0 });
const observers = new Map();
let selections = 0;
let privacySelections = 0;
const queries = loadSource(source('src/features/library/queries.ts'), {
  react,
  '@tanstack/react-query': {
    useQueryClient: () => client,
    useQuery(options) {
      let observer = observers.get(activeHook);
      if (!observer) {
        observer = new QueryObserver(client, options);
        observers.set(activeHook, observer);
      } else {
        observer.setOptions(options);
      }
      return observer.getCurrentResult();
    },
  },
  './use-source-libraries': sourceHook,
  './use-library-activity': { useLibraryActivity: (enabled) => enabled },
  './nas-library-cache': {},
  './refresh-music-library': {},
  '@/services/music-providers/nas-library-task': { acquireNasLibrary: () => () => {} },
  '@/services/music-providers/library-policy': loadSource('src/services/music-providers/library-policy.ts'),
  './song-library': loadSource('src/features/library/song-library.ts'),
  './load-song-library': loadSource('src/features/library/load-song-library.ts'),
  './search-songs': { searchSongs },
  './library-result': loadSource('src/features/library/library-result.ts'),
  '../hidden-music/rules': {
    ...privacyRules,
    visibleSongs(...args) {
      privacySelections++;
      return privacyRules.visibleSongs(...args);
    },
  },
  './repository': { libraryIdentity: () => 'fixture' },
  '@/services/music-providers/registry': registry,
  '@/stores/auth': { useAuthStore: (select) => select({ mode: 'mock', session: null }) },
  '@/stores/song-metadata': { useSongMetadataStore: (select) => select({ ready: true, patches: metadataPatches }) },
  '@/stores/song-artwork': { useSongArtworkStore: (select) => select(artworkState) },
  '@/stores/hidden-music': { useHiddenMusicStore: (select) => select({ ready: true, profile: { presets } }) },
  '@/stores/library-preferences': { useLibraryPreferences: (select) => select({ ready: true, includeFolderAlbums: true }) },
  './album-library': {
    ...albumRules,
    albumsFromSongs(...args) {
      selections++;
      return albumRules.albumsFromSongs(...args);
    },
  },
});
function render(name, argument) {
  activeHook = name;
  slot = 0;
  return queries[name](argument);
}
try {
  const initial = render('useAlbums', true);
  const initialSelections = selections;
  started = performance.now();
  for (let update = 0; update < 12; update++) {
    states = states.map((state, index) => index === 1 ? { ...state, loading: !state.loading } : state);
    const result = render('useAlbums', true);
    assert.deepEqual(result.data, initial.data);
  }
  measurements.statusOnlyUpdates = {
    milliseconds: performance.now() - started,
    extraAlbumSelections: selections - initialSelections,
  };
  if (optimized) {
    assert.equal(selections, initialSelections, 'Status updates must not regroup 10,000 songs');
  }
  states = states.map((state, index) => index === 1 ? { ...state, error: 'offline' } : state);
  assert.equal(render('useAlbums', true).isRefetchError, true, 'Errors remain visible with cached data');
  states = states.map((state, index) => index === 1 ? { ...state, error: null, stale: true } : state);
  assert.equal(render('useAlbums', true).data.stale, true, 'Cache staleness still invalidates displayed data');
  states = states.map((state, index) => index === 1 ? { ...state, songs: [], connected: false } : state);
  assert.equal(render('useAlbums', true).data.total, 0, 'Disconnect hides account data');
  states = states.map((state, index) => index === 1 ? { ...state, songs, connected: true, stale: false } : state);
  assert.equal(render('useAlbums', true).data.total, 400);
  const beforeScope = selections;
  states = states.map((state, index) => index === 1 ? { ...state, scope: 'another-account', generation: 1 } : state);
  render('useAlbums', true);
  assert.equal(selections, beforeScope + 1, 'Account replacement invalidates selection even with equal array identity');
  sourceFilter = 'nas';
  assert.equal(render('useAlbums', true).data.total, 0);
  const beforeUnrelated = selections;
  states = states.map((state, index) => index === 1 ? { ...state, songs: [...songs] } : state);
  render('useAlbums', true);
  if (optimized) {
    assert.equal(selections, beforeUnrelated, 'An unselected catalog must not invalidate the NAS list');
  }
  sourceFilter = 'all';
  assert.equal(render('useSearch', 'artist 79').data.total, 392);
  const beforeSearch = privacySelections;
  for (let renderCount = 0; renderCount < 12; renderCount++) {
    assert.equal(render('useSearch', 'artist 79').data.total, 392);
  }
  measurements.identicalSearchRenders = { extraSelections: privacySelections - beforeSearch };
  if (optimized) {
    assert.equal(privacySelections, beforeSearch, 'Unchanged search renders must not filter the library again');
  }
  const nasSong = { ...songs[0], id: 'nas-only', source: 'nas', title: 'Protected', artist: 'Secret' };
  client.setQueryData(['song-library', 'fixture'], { items: [nasSong], total: 1 });
  assert.equal(render('useSearch', 'protected').data.total, 1);
  presets = [{ id: 'hidden', enabled: true, songIds: [nasSong.id], folders: [] }];
  assert.equal(render('useSearch', 'protected').data.total, 0, 'Privacy edits invalidate cached search selections');
  metadataPatches = {
    [metadataRules.metadataKey(songs[0], 'demo')]: metadataRules.parseMetadata({ ...songs[0], title: 'Unique edit' }),
  };
  assert.equal(render('useSearch', 'Unique edit').data.total, 1, 'Display edits invalidate normalized search fields');
} finally {
  for (const observer of observers.values()) {
    observer.destroy();
  }
  client.clear();
}

console.log(JSON.stringify({ mode: optimized ? 'optimized' : 'baseline', environment: 'Node/V8; mocked hooks and native boundaries', ...measurements }, null, 2));
console.log('PASS: search normalization, Unicode/edit/account isolation, stored catalog refresh/duplicates/removal, request-status selection stability and preserved errors/cache notices. Native performance is not measured.');
