/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const projectRequire = createRequire(path.join(root, 'package.json'));
const ts = projectRequire('typescript');
const { QueryClient, QueryObserver } = projectRequire('@tanstack/react-query');
function load(file, overrides = {}) {
  const source = fs.readFileSync(file, 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => name in overrides ? overrides[name] : projectRequire(name), mod, mod.exports);
  return mod.exports;
}
const helpers = load(path.join(root, 'src/features/library/album-library.ts'));
const rules = load(path.join(root, 'src/features/hidden-music/rules.ts'));
const metadata = load(path.join(root, 'src/features/library/load-song-library.ts'));
const search = load(path.join(root, 'src/features/library/search-songs.ts'));
let presets = [];
let account = 'fixture-a';
let activeHook;
let hookSlot = 0;
let selections = 0;
// Model React's dependency comparison; QueryObserver itself is the installed implementation.
const callbacks = new Map();
const localFixture = { songs: [], ready: true, source: 'nas' };
const queries = load(process.argv[2] || path.join(root, 'src/features/library/queries.ts'), {
  react: { useMemo: factory => factory(), useCallback: (callback, dependencies) => {
    const previous = callbacks.get(activeHook + ':' + hookSlot++);
    if (previous && previous.dependencies.length === dependencies.length && dependencies.every((value, index) => Object.is(value, previous.dependencies[index]))) return previous.callback;
    callbacks.set(activeHook + ':' + (hookSlot - 1), { callback, dependencies });
    return callback;
  } },
  '@/stores/local-music': { useLocalMusicStore: selector => selector(localFixture) },
  '@tanstack/react-query': { useQuery: options => options },
  './album-library': helpers,
  './load-song-library': metadata,
  './search-songs': search,
  '../hidden-music/rules': { visibleSongs: (...args) => { selections++; return rules.visibleSongs(...args); } },
  './repository': { libraryIdentity: () => account, musicRepository: () => { throw new Error('No network request expected'); } },
  '@/stores/auth': { useAuthStore: selector => selector({ mode: 'mock', session: null }) },
  '@/stores/hidden-music': { useHiddenMusicStore: selector => selector({ ready: true, profile: { presets } }) },
});
function options(hook, enabled) {
  activeHook = hook; hookSlot = 0;
  return queries[hook](enabled);
}
const songs = Array.from({ length: 10000 }, (_, index) => ({
  id: 'song-' + index, title: 'Track ' + index, artist: 'Artist ' + index % 80,
  album: 'Album ' + index % 400, albumArtist: 'Artist ' + index % 80,
  path: '/music/' + (index % 2 ? 'public' : 'hidden') + '/' + index + '.mp3', duration: 180,
}));
const library = { items: songs, total: songs.length, stale: false };
const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
const key = () => ['song-library', account];
client.setQueryData(key(), library);
const observers = ['useAlbums', 'useSongs', 'useArtists'].map((hook, index) => ({ hook, observer: new QueryObserver(client, options(hook, index === 0)) }));
try {
  const initial = observers.map(({ observer }) => observer.getCurrentResult().data);
  assert.equal(selections, 3);
  for (let swipe = 0; swipe < 12; swipe++) {
    for (let index = 0; index < observers.length; index++) {
      const { hook, observer } = observers[index];
      observer.setOptions(options(hook, index === swipe % 3));
      assert.equal(observer.getCurrentResult().data, initial[index], 'Unchanged metadata must keep selected data references');
    }
  }
  assert.equal(selections, 3, 'Tab changes must not filter/group all songs again');
  const fresh = { ...songs[0], id: 'new-song', title: 'New track', album: 'New album', artist: 'New artist', albumArtist: 'New artist', path: '/music/public/new.mp3' };
  client.setQueryData(key(), { ...library, items: [...songs, fresh], total: 10001 });
  for (const { hook, observer } of observers) observer.setOptions(options(hook, true));
  assert.equal(selections, 6, 'Fresh metadata must recompute each selection once');
  assert.equal(observers[1].observer.getCurrentResult().data.total, 10001);
  presets = [{ id: 'hide', name: 'Hidden fixture', enabled: true, songIds: ['song-1'], folders: ['/music/hidden'] }];
  for (const { hook, observer } of observers) observer.setOptions(options(hook, true));
  assert.equal(selections, 9, 'Preset changes must invalidate selected lists');
  const visible = rules.visibleSongs({ items: [...songs, fresh], total: 10001, stale: false }, presets);
  assert.deepEqual(observers[1].observer.getCurrentResult().data, visible);
  assert.deepEqual(observers[0].observer.getCurrentResult().data, helpers.albumsFromSongs(visible));
  assert.equal(observers[2].observer.getCurrentResult().data.items.some(item => item.name === 'New artist'), true);
  account = 'fixture-b';
  for (const { hook, observer } of observers) observer.setOptions(options(hook, false));
  for (const { observer } of observers) assert.equal(observer.getCurrentResult().data, undefined, 'Another account must not reuse prior results');
  client.setQueryData(key(), { items: [], total: 0, stale: true });
  for (const { hook, observer } of observers) {
    observer.setOptions(options(hook, false));
    assert.equal(observer.getCurrentResult().data.total, 0);
    assert.equal(observer.getCurrentResult().data.stale, true);
  }
  console.log('PASS: 10,000-song fixture, 12 tab changes with zero extra selections, metadata/preset invalidation, account isolation, empty/offline lists. Hook callbacks are mocked; native frame rates are not measured.');
} finally {
  for (const { observer } of observers) observer.destroy();
  client.clear();
}
