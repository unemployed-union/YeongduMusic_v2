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
  overrides = { ...require('./test-cloud-fixtures.cjs').cloudFixtures({}, overrides), ...overrides };
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
const EMPTY_DRIVE_SONGS = [];
const localFixture = { songs: [], ready: true, source: 'nas' };
const displayMetadata = { ready: true, patches: {} };
const editRules = load(path.join(root, 'src/features/metadata/rules.ts'));
const queries = load(process.argv[2] || path.join(root, 'src/features/library/queries.ts'), {
  '@/stores/song-metadata': { useSongMetadataStore: selector => selector(displayMetadata) },
  '@/stores/library-preferences': { useLibraryPreferences: selector => selector({ ready: true, includeFolderAlbums: true }) },
  react: { useMemo: factory => factory(), useCallback: (callback, dependencies) => {
    const previous = callbacks.get(activeHook + ':' + hookSlot++);
    if (previous && previous.dependencies.length === dependencies.length && dependencies.every((value, index) => Object.is(value, previous.dependencies[index]))) return previous.callback;
    callbacks.set(activeHook + ':' + (hookSlot - 1), { callback, dependencies });
    return callback;
  } },
  '@/stores/google-drive': { useGoogleDriveStore: selector => selector({ songs: EMPTY_DRIVE_SONGS, loading: false, error: null }) },
  '@/stores/local-music': { useLocalMusicStore: selector => selector(localFixture) },
  '@tanstack/react-query': { useQuery: options => options },
  './album-library': helpers,
  './load-song-library': metadata,
  './search-songs': search,
  '../hidden-music/rules': { privacyScope: rules.privacyScope, visibleSongs: (...args) => { selections++; return rules.visibleSongs(...args); } },
  './repository': { libraryIdentity: () => account, musicRepository: () => { throw new Error('No network request expected'); } },
  '@/stores/auth': { useAuthStore: selector => selector({ mode: 'mock', session: null }) },
  '@/stores/hidden-music': { useHiddenMusicStore: selector => selector({ ready: true, profile: { presets } }) },
});
function options(hook, enabled, sourceOverride) {
  activeHook = hook; hookSlot = 0;
  return queries[hook](enabled, sourceOverride);
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
  const editedSong = songs[3];
  displayMetadata.patches = { [editRules.metadataKey(editedSong, 'demo')]: editRules.parseMetadata({ ...editedSong, title: 'Edited track', artist: 'Edited artist', album: 'Edited album', albumArtist: 'Edited artist' }) };
  for (const { hook, observer } of observers) observer.setOptions(options(hook, true));
  assert.equal(observers[1].observer.getCurrentResult().data.items[0].title, 'Edited track', 'Saving a display edit immediately invalidates the actual QueryObserver selection');
  assert(observers[0].observer.getCurrentResult().data.items.some(item => item.title === 'Edited album'));
  assert(observers[2].observer.getCurrentResult().data.items.some(item => item.name === 'Edited artist'));
  assert.equal(client.getQueryData(key()).items[3].title, editedSong.title, 'Display edits never overwrite source query metadata');
  const afterEdit = selections;
  for (const { hook, observer } of observers) observer.setOptions(options(hook, true));
  assert.equal(selections, afterEdit, 'Unrelated renders keep edited selections cached');
  displayMetadata.patches = {};
  for (const { hook, observer } of observers) observer.setOptions(options(hook, true));
  assert.equal(observers[1].observer.getCurrentResult().data.items[0].title, editedSong.title, 'Removing an edit restores the original query selection');
  account = 'fixture-b';
  for (const { hook, observer } of observers) observer.setOptions(options(hook, false));
  for (const { observer } of observers) assert.equal(observer.getCurrentResult().data, undefined, 'Another account must not reuse prior results');
  client.setQueryData(key(), { items: [], total: 0, stale: true });
  for (const { hook, observer } of observers) {
    observer.setOptions(options(hook, false));
    assert.equal(observer.getCurrentResult().data.total, 0);
    assert.equal(observer.getCurrentResult().data.stale, true);
  }
  localFixture.source = 'local';
  localFixture.songs = [{ ...songs[0], id: 'local-one', source: 'local' }];
  const allSources = options('useSongs', false, 'all');
  assert.deepEqual(allSources.queryKey, ['song-library', account], 'Favorite collection includes NAS even while the library filter is local');
  const allVisible = allSources.select({ items: [fresh, songs[0]], total: 2 });
  assert.deepEqual(allVisible.items.map(song => song.id), [fresh.id, 'local-one'], 'All-source collection retains the hidden-song filter');
  assert.equal(localFixture.source, 'local', 'Opening favorites preserves the user\'s library source filter');
  localFixture.source = 'nas'; account = 'fixture-a';
  client.setQueryData(key(), library);
  function detailOptions(hook, target) {
    activeHook = hook; hookSlot = 0;
    return queries[hook](target);
  }
  const detailTargets = [
    ['useAlbumSongs', { id: helpers.albumId(songs[3]), title: songs[3].album, artist: songs[3].artist }],
    ['useArtistSongs', { id: songs[3].artist, name: songs[3].artist }],
  ];
  for (const [hook, target] of detailTargets) {
    const detailObserver = new QueryObserver(client, detailOptions(hook, target));
    const first = detailObserver.getCurrentResult().data, count = selections;
    assert(first.items.length > 0);
    for (let render = 0; render < 12; render++) {
      detailObserver.setOptions(detailOptions(hook, { ...target }));
      assert.equal(detailObserver.getCurrentResult().data, first, 'Layout, focus and header updates retain detail list references');
    }
    assert.equal(selections, count, 'Detail renders never rescan the 10,000-song library without changed inputs');
    const changedTarget = hook === 'useAlbumSongs'
      ? { ...target, id: helpers.albumId(songs[5]) }
      : { ...target, name: songs[5].artist };
    detailObserver.setOptions(detailOptions(hook, changedTarget));
    assert.notEqual(detailObserver.getCurrentResult().data, first, 'Changing the selected album or artist recomputes the list');
    assert.equal(selections, count + 1);
    const beforeHidden = detailObserver.getCurrentResult().data;
    presets = [...presets];
    detailObserver.setOptions(detailOptions(hook, changedTarget));
    assert.equal(selections, count + 2, 'Privacy changes still invalidate detail selections');
    assert.deepEqual(detailObserver.getCurrentResult().data, beforeHidden);
    detailObserver.destroy();
  }
  console.log('PASS: 10,000-song fixture, 12 tab and detail rerenders with zero extra selections, album/artist route and privacy invalidation, metadata updates, account isolation, empty/offline lists and all-source favorites. Hook callbacks are mocked; native frame rates are not measured.');
} finally {
  for (const { observer } of observers) observer.destroy();
  client.clear();
}
