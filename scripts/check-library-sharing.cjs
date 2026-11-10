/* global __dirname */
const assert = require('node:assert/strict');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { loadSource } = require('./test-source-loader.cjs');

const baseline = process.argv[2];
const source = file => baseline
  ? path.resolve(baseline, file.replaceAll('/', '_') + '.txt')
  : path.resolve(__dirname, '..', file);
const metadata = loadSource('src/features/metadata/rules.ts');
const artwork = loadSource('src/features/artwork/rules.ts');
const musicSource = loadSource('src/services/music-source.ts');
let edits = 0;
let hiddenVisits = 0;
const processing = loadSource(source('src/features/library/song-library.ts'), {
  '@/features/metadata/rules': {
    ...metadata,
    applyMetadataLibrary(...args) {
      edits++;
      return metadata.applyMetadataLibrary(...args);
    },
  },
  '@/features/artwork/rules': artwork,
});
const privacy = loadSource(source('src/features/hidden-music/rules.ts'), {
  '@/services/music-source': {
    isNasSong(song) {
      hiddenVisits++;
      return musicSource.isNasSong(song);
    },
  },
});
const songs = Array.from({ length: 10000 }, (_, index) => ({
  id: 'song-' + index, source: 'nas', title: 'Track ' + index,
  artist: 'Artist ' + index % 80, album: 'Album ' + index % 400,
  duration: 180, path: '/music/' + index + '.mp3',
}));
const raw = { items: songs, total: songs.length };
const localSong = { ...songs[0], id: 'local-extra', source: 'local', local: { fileName: 'one.mp3' } };
let libraries = { local: [localSong] };
let sourceFilter = 'all';
let accountKey = 'a';
let identity = 'nas-a';
let metadataPatches = {};
let artworkPatches = {};
let presets = [];
let stale = false;
let failed = false;
const settings = { ready: true, includeFolderAlbums: true, groupAlbumsByTitle: false };
const resultHelpers = loadSource('src/features/library/library-result.ts');
const queries = loadSource(source('src/features/library/queries.ts'), {
  react: { useMemo: compute => compute(), useCallback: callback => callback, useEffect() {} },
  '@tanstack/react-query': { useQuery: options => ({ ...options, isError: failed, error: failed ? Error('NAS offline') : null }), useQueryClient: () => ({}) },
  './use-library-activity': { useLibraryActivity: (enabled) => enabled },
  './nas-library-cache': {},
  './refresh-music-library': {},
  '@/services/music-providers/library-policy': loadSource('src/services/music-providers/library-policy.ts'),
  '@/services/music-providers/library-tasks': {},
  '@/services/music-providers/nas-library-task': {},
  './song-library': processing,
  './use-source-libraries': { useSourceLibraries: () => ({ libraries: { ...libraries }, accountKey, preferredSource: sourceFilter, ready: true, stale }) },
  './album-library': loadSource('src/features/library/album-library.ts'),
  './load-song-library': loadSource('src/features/library/load-song-library.ts'),
  './search-songs': loadSource('src/features/library/search-songs.ts'),
  './repository': { libraryIdentity: () => identity },
  './library-result': { libraryResult: (query, options) => ({ ...query, ...resultHelpers.libraryResult(query, options) }) },
  '../hidden-music/rules': privacy,
  '@/stores/auth': { useAuthStore: select => select({ mode: 'mock', session: null }) },
  '@/stores/hidden-music': { useHiddenMusicStore: select => select({ ready: true, profile: { presets } }) },
  '@/stores/song-metadata': { useSongMetadataStore: select => select({ ready: true, patches: metadataPatches }) },
  '@/stores/song-artwork': { useSongArtworkStore: select => select({ ready: true, patches: artworkPatches, baseUri: 'file:///art/' }) },
  '@/stores/library-preferences': { useLibraryPreferences: select => select(settings) },
  '@/services/music-providers/registry': {},
});

const start = performance.now();
assert.equal(queries.useSongs(true, undefined, true).enabled, false, 'Automatic metadata consumes cached data without starting library queries');
const selected = [queries.useSongs(), queries.useAlbums(), queries.useArtists()].map(query => query.select(raw));
const measurement = { milliseconds: performance.now() - start, editPasses: edits, hiddenSongVisits: hiddenVisits };
assert.equal(selected[0].total, 10001);
if (!baseline) {
  assert.equal(edits, 1, 'Three observers share one merge/edit pass');
  assert.equal(hiddenVisits, 10001, 'Hidden filtering is shared across observers');
}

const key = metadata.metadataKey(songs[0], 'demo');
metadataPatches = { [key]: { title: 'Edited', artist: 'Edited artist', album: 'Edited album' } };
assert.equal(queries.useSearch('Edited').select(raw).total, 1);
artworkPatches = { [key]: 'data:image/png;base64,AAAA' };
assert.equal(queries.useSongs().select(raw).items[0].artworkUrl, artworkPatches[key]);
presets = [{ id: 'hide', enabled: true, songIds: [songs[0].id], folders: [] }];
assert.equal(queries.useSongs().select(raw).total, 10000);
assert.equal(queries.useRawSongLibrary().select(raw).total, 10000, 'Raw settings selection excludes local data but keeps hidden NAS tracks');
assert.equal(queries.useSearch('Edited').select(raw).total, 0);
presets = [];
metadataPatches = {};
artworkPatches = {};
assert.equal(queries.useSongs().select(raw).items[0].title, songs[0].title, 'Removing an edit restores original values');
stale = true;
assert.equal(queries.useAlbums().select(raw).stale, true);
stale = false;
sourceFilter = 'local';
assert.deepEqual(queries.useSongs().select(raw).items, [localSong]);
sourceFilter = 'all';
const beforeAccount = edits;
accountKey = 'b';
queries.useSongs().select(raw);
assert.equal(edits, beforeAccount + 1, 'Account change invalidates equal song-array references');
identity = 'nas-b';
const otherPage = { items: [{ ...songs[0], title: 'Other account' }], total: 1 };
assert.equal(queries.useSongs().select(otherPage).items[0].title, 'Other account');
libraries = { local: [] };
assert.equal(queries.useSongs().select(otherPage).total, 1, 'Disconnected source data disappears');

// Grouping settings change derived results even when the prepared song page is shared.
const compilation = { items: [
  { ...songs[0], album: 'Same', artist: 'A' },
  { ...songs[1], album: 'Same', artist: 'B' },
], total: 2 };
assert.equal(queries.useAlbums().select(compilation).total, 2);
settings.groupAlbumsByTitle = true;
assert.equal(queries.useAlbums().select(compilation).total, 1);
settings.includeFolderAlbums = false;
const folder = { items: [{ ...localSong, albumSource: 'fallback' }], total: 1 };
sourceFilter = 'nas';
assert.equal(queries.useAlbums().select(folder).total, 0);
sourceFilter = 'all';
libraries = { local: [localSong] };
failed = true;
const offline = queries.useSongs();
assert.equal(offline.isRefetchError, true);
assert.equal(offline.error.message, 'NAS offline');
assert.deepEqual(offline.data.items, [localSong], 'Local fallback does not suppress the NAS error');

console.log(JSON.stringify({ mode: baseline ? 'baseline' : 'optimized', songs: songs.length, ...measurement }));
console.log('PASS: shared preparation, edit/art/privacy removal and invalidation, account/source/grouping isolation and offline fallback. Hooks are mocked; native frames are not measured.');
