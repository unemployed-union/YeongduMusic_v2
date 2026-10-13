/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const projectRequire = createRequire(path.join(root, 'package.json'));
const ts = projectRequire('typescript');
const tanstack = projectRequire('@tanstack/react-query');
function load(file, overrides = {}) {
  overrides = { ...require('./test-cloud-fixtures.cjs').cloudFixtures({}, overrides), ...overrides };
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => name in overrides ? overrides[name] : projectRequire(name), mod, mod.exports);
  return mod.exports;
}
const albumHelpers = load('src/features/library/album-library.ts');
const metadata = load('src/features/library/load-song-library.ts');
const search = load('src/features/library/search-songs.ts');
const { mockRepository, mockAlbums } = load('src/features/library/mock-repository.ts');
const { refreshLibrary, LIBRARY_PAGE_SIZE } = load('src/features/library/refresh-library.ts');
const { SynologyClient } = load('src/services/synology/api.ts');
const state = { mode: 'nas', session: { baseUrl: 'https://example.invalid', sid: 'fixture-session', apis: {
  'SYNO.AudioStation.Song': { path: 'AudioStation/song.cgi', minVersion: 1, maxVersion: 3 },
  'SYNO.AudioStation.Cover': { path: 'AudioStation/cover.cgi', minVersion: 1, maxVersion: 3 },
  'SYNO.AudioStation.Album': { path: 'AudioStation/album.cgi', minVersion: 1, maxVersion: 3 },
  'SYNO.AudioStation.Artist': { path: 'AudioStation/artist.cgi', minVersion: 1, maxVersion: 4 },
} } };
const records = [];
function record(id, album, artist, albumArtist = '', disc = '1', track = '1') {
  return { id, path: '/fixture/music', title: 'Track ' + id, type: 'file', additional: { song_tag: { album, artist, album_artist: albumArtist, disc, track, year: '2025' } } };
}
records.push(record('disc2', '합본 & + / "제목"', 'Guest Two', 'Various Artists', '2', '1'));
records.push(record('track2', '합본 & + / "제목"', 'Guest One', 'Various Artists', '1', '2'));
records.push(record('track1', '합본 & + / "제목"', 'Guest Three', 'Various Artists', '1', '1'));
records.push(record('same-a', '동일 제목', 'Artist A'));
records.push(record('same-b', '동일 제목', 'Artist B'));
for (let i = 0; i < 205; i++) records.push(record('filler-' + i, 'Back Catalog', 'Filler', '', '1', String(i + 1)));
const requests = [];
const originalFetch = global.fetch;
global.fetch = async uri => {
  const url = new URL(uri);
  const api = url.searchParams.get('api');
  assert.equal(url.searchParams.get('method'), 'list');
  assert.equal(url.searchParams.get('library'), 'all');
  let data;
  if (api === 'SYNO.AudioStation.Song') {
    assert.equal(url.searchParams.get('additional'), 'song_tag');
    assert.equal(url.searchParams.has('album'), false);
    const offset = Number(url.searchParams.get('offset'));
    const limit = Math.min(37, Number(url.searchParams.get('limit')));
    requests.push(offset);
    data = { total: records.length, songs: records.slice(offset, offset + limit) };
  } else if (api === 'SYNO.AudioStation.Album') {
    data = { total: 4, albums: [{ name: '동일 제목', artist: 'Artist A', album_artist: '', display_artist: 'Artist A', year: 2025 }] };
  } else if (api === 'SYNO.AudioStation.Artist') {
    data = { total: 6, artists: [{ name: 'Artist A' }] };
  } else throw new Error('Unexpected API');
  return new Response(JSON.stringify({ success: true, data }), { headers: { 'Content-Type': 'text/plain' } });
};
const repository = () => {
  const client = new SynologyClient(state.session);
  return { songs: page => client.songs(page), albums: page => client.albums(page), artists: page => client.artists(page) };
};
const repoModule = load('src/features/library/repository.ts', {
    '@/stores/streaming-preferences': { useStreamingPreferences: { getState: () => ({ quality: 'original', load: async () => {} }) } },
  './mock-repository': { mockRepository },
  '@/services/synology/cache': {},
  '@/services/synology/api': load('src/services/synology/api.ts'),
  '@/stores/auth': { useAuthStore: { getState: () => state } },
});
const localFixture = { songs: [], ready: true, source: 'nas' };
const libraryPreferences = { ready: true, includeFolderAlbums: true };
const queries = load('src/features/library/queries.ts', {
  '@/stores/library-preferences': { useLibraryPreferences: selector => selector(libraryPreferences) },
  react: { useMemo: factory => factory(), useCallback: callback => callback },
  '@/stores/google-drive': { useGoogleDriveStore: selector => selector({ songs: [], loading: false, error: null }) },
  '@/stores/local-music': { useLocalMusicStore: selector => selector(localFixture) },
  '@tanstack/react-query': { ...tanstack, useQuery: options => options },
  '../hidden-music/rules': { visibleSongs: library => library },
  '@/stores/hidden-music': { useHiddenMusicStore: selector => selector({ ready: true, profile: { presets: [] } }) },
  './album-library': albumHelpers, './load-song-library': metadata, './search-songs': search,
  './repository': { musicRepository: repository, libraryIdentity: repoModule.libraryIdentity },
  '@/stores/auth': { useAuthStore: selector => selector(state) },
  './refresh-library': { LIBRARY_PAGE_SIZE },
});
let queued;
const { playAlbum } = load('src/features/library/play-album.ts', {
  '@/services/playback/controller': { playQueue: async (songs, index) => { queued = { songs, index }; } },
});

async function main() {
  const identity = repoModule.libraryIdentity(state.mode, state.session);
  assert.ok(identity.endsWith(':all:song-path-v3'));
  const client = new tanstack.QueryClient({ defaultOptions: { queries: { staleTime: 30000, retry: false } } });
  const albums = new tanstack.QueryObserver(client, queries.useAlbums());
  const unsubscribeAlbums = albums.subscribe(() => {});
  await albums.refetch();
  assert.deepEqual(requests, [0, 37, 74, 111, 148, 185]);
  const result = albums.getCurrentResult().data;
  assert.equal(result.total, 4);
  const compilation = result.items.find(item => item.artist === 'Various Artists');
  assert.equal(compilation.songCount, 3);
  const cover = new URL(compilation.artworkUrl);
  assert.equal(cover.pathname, '/webapi/AudioStation/cover.cgi');
  assert.equal(cover.searchParams.get('method'), 'getsongcover');
  assert.equal(cover.searchParams.get('id'), 'disc2');
  assert.equal(cover.searchParams.get('library'), 'all');
  const sameTitle = result.items.filter(item => item.title === '동일 제목');
  assert.equal(sameTitle.length, 2);
  assert.notEqual(sameTitle[0].id, sameTitle[1].id);
  const detail = new tanstack.QueryObserver(client, queries.useAlbumSongs(compilation));
  const unsubscribeDetail = detail.subscribe(() => {});
  assert.deepEqual(detail.getCurrentResult().data.items.map(song => song.id), ['track1', 'track2', 'disc2']);
  assert.equal(detail.getCurrentResult().data.items[0].discNumber, 1);
  assert.equal(detail.getCurrentResult().data.items[0].year, 2025);
  await playAlbum(detail.getCurrentResult().data.items, 1);
  assert.deepEqual(queued.songs.map(song => song.id), ['track1', 'track2', 'disc2']);
  assert.equal(queued.index, 1);
  await assert.rejects(playAlbum([]), /재생할 곡/);
  const backCatalog = result.items.find(item => item.title === 'Back Catalog');
  const allSongs = client.getQueryData(['song-library', identity]);
  assert.equal(albumHelpers.songsForAlbum(allSongs, backCatalog).total, 205);
  assert.equal(albumHelpers.songsForAlbum(allSongs, sameTitle.find(item => item.artist === 'Artist A')).items[0].id, 'same-a');
  const artist = new tanstack.QueryObserver(client, queries.useArtistSongs({ id: 'fixture', name: 'Artist A' }));
  const searchObserver = new tanstack.QueryObserver(client, queries.useSearch('동일 제목'));
  assert.equal(artist.getCurrentResult().data.total, 1);
  assert.equal(searchObserver.getCurrentResult().data.total, 2);
  assert.equal(requests.length, 6);

  records.push(record('new-track', compilation.title, 'Another Guest', 'Various Artists', '2', '2'));
  client.setQueryData(['song-library', 'other-account'], allSongs);
  await refreshLibrary(client, repository(), identity, () => true);
  assert.equal(albums.getCurrentResult().data.items.find(item => item.id === compilation.id).songCount, 4);
  assert.deepEqual(detail.getCurrentResult().data.items.map(song => song.id), ['track1', 'track2', 'disc2', 'new-track']);
  assert.equal(client.getQueryState(['song-library', 'other-account']).isInvalidated, false);
  const oldSid = state.session.sid;
  state.session = { ...state.session, sid: 'different-account' };
  const other = new tanstack.QueryObserver(client, queries.useAlbums());
  assert.equal(other.getCurrentResult().data, undefined);
  state.session.sid = oldSid;

  const mockLibrary = await metadata.loadSongLibrary(mockRepository, new AbortController().signal);
  const mockResult = albumHelpers.albumsFromSongs(mockLibrary);
  assert.equal(mockResult.total, 9);
  for (const album of mockAlbums) {
    assert.equal(albumHelpers.songsForAlbum(mockLibrary, album).total, 5);
    assert.deepEqual(mockResult.items.find(item => item.id === album.id).palette, album.palette);
  }
  assert.equal(albumHelpers.albumsFromSongs({ items: [], total: 0 }).total, 0);
  const folderRecords = [
    { ...record('folder-fallback', '', 'Artist'), album: 'Folder Name' },
    { ...record('real-tag', 'Folder Name', 'Artist'), album: 'Server fallback' },
    { ...record('blank-tag', ' \t ', 'Artist'), album: 'Blank Tag Folder' },
  ];
  const folderOffset = records.length;
  records.push(...folderRecords);
  const folderLibrary = await repository().songs({ offset: folderOffset, limit: 3 });
  records.splice(folderOffset);
  assert.deepEqual(folderLibrary.items.map(song => [song.album, song.albumSource]), [['Folder Name', 'fallback'], ['Folder Name', 'tag'], ['Blank Tag Folder', 'fallback']]);
  const taggedAlbums = albumHelpers.albumsFromSongs(folderLibrary, false);
  assert.equal(taggedAlbums.total, 1);
  assert.equal(taggedAlbums.items[0].songCount, 1, 'Folder songs must not join a tagged album with the same title');
  libraryPreferences.includeFolderAlbums = false;
  assert.equal(queries.useAlbums().select(folderLibrary).total, 1);
  assert.equal(queries.useSongs().select(folderLibrary).items.length, 3, 'The toggle must preserve songs');
  assert.equal(albumHelpers.songsForAlbum(folderLibrary, taggedAlbums.items[0]).items.length, 1);
  libraryPreferences.includeFolderAlbums = true;
  assert.equal(queries.useAlbums().select(folderLibrary).total, 3);
  libraryPreferences.ready = false;
  assert.equal(queries.useAlbums().enabled, false);
  libraryPreferences.ready = true;
  assert.equal(albumHelpers.albumsFromSongs({ ...mockLibrary, stale: true }).stale, true);
  const stale = albumHelpers.songsForAlbum({ ...mockLibrary, stale: true }, mockAlbums[0]);
  assert.equal(stale.stale, true);
  const fallbackArt = albumHelpers.albumsFromSongs({ items: [{ ...mockLibrary.items[0], artworkUrl: undefined }, { ...mockLibrary.items[1], artworkUrl: 'https://example.invalid/cover' }], total: 2 });
  assert.equal(fallbackArt.items[0].artworkUrl, 'https://example.invalid/cover');

  // Older cached pages may contain empty/whitespace artist tags. Keep those tracks accessible.
  const unknownName = '알 수 없는 아티스트';
  const artistFixture = { items: ['', '  \t', unknownName, 'Known Artist'].map((name, index) => ({ ...mockLibrary.items[0], id: 'artist-fixture-' + index, artist: name })), total: 4, stale: true };
  const grouped = queries.useArtists().select(artistFixture);
  assert.equal(grouped.total, 2);
  assert(grouped.items.every(item => item.id.trim() && item.name.trim()), 'Every artist has a usable nonempty route ID');
  assert.equal(grouped.items.filter(item => item.name === unknownName).length, 1);
  const unknownArtist = grouped.items.find(item => item.name === unknownName);
  const unknownSongs = queries.useArtistSongs(unknownArtist).select(artistFixture);
  assert.deepEqual(unknownSongs.items.map(item => item.id), ['artist-fixture-0', 'artist-fixture-1', 'artist-fixture-2']);
  assert.equal(unknownSongs.stale, true);
  assert.equal(metadata.songsForArtist(artistFixture, 'Known Artist').total, 1);
  assert.equal(metadata.artistName('Known Artist'), 'Known Artist');
  assert.equal(metadata.songsForArtist({ items: [], total: 0 }, unknownName).total, 0);
  // Exercise the real NAS adapter with missing/empty tags, not fabricated success from a NAS.
  const noTag = record('empty-artist', 'Fixture', '');
  const tagFallback = { ...record('tag-artist', 'Fixture', 'Tag Artist'), artist: '   ' };
  const noArtist = { id: 'missing-artist', title: 'Fixture' };
  const blankTag = record('blank-artist', 'Fixture', ' \t ');
  const fixtureOffset = records.length;
  records.push(noTag, tagFallback, noArtist, blankTag);
  const mapped = await repository().songs({ offset: fixtureOffset, limit: 4 });
  assert.deepEqual(mapped.items.map(item => item.artist), [unknownName, 'Tag Artist', unknownName, unknownName]);
  records.splice(fixtureOffset);
  console.log('PASS: empty/whitespace/missing NAS artist mapping, song-tag fallback, old cached unknown-artist grouping with nonempty route IDs and matching detail songs; known artists unchanged.');

  const abort = new AbortController();
  let calls = 0;
  await assert.rejects(metadata.loadSongLibrary({ songs: async () => { calls++; abort.abort(); return { items: [], total: 0 }; } }, abort.signal), /취소/);
  assert.equal(calls, 1);
  unsubscribeAlbums(); unsubscribeDetail();
  for (const observer of [albums, detail, artist, searchObserver, other]) observer.destroy();
  client.clear();
  console.log('PASS: NAS-shaped song_tag mapping, 6-page metadata loading, album covers, same-title separation, compilation grouping, disc/track ordering, 205-track album completeness, playback queue selection, shared search/artist cache, refresh, account isolation, mock palettes, offline/empty handling, and cancellation. NAS HTTP and playback engine are mocked; no actual NAS/device verification.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { global.fetch = originalFetch; });
