const assert = require('node:assert/strict');
const { create } = require('zustand');
const { QueryClient } = require('@tanstack/react-query');
const { loadSource } = require('./test-source-loader.cjs');
const flush = async () => {
  for (let i = 0; i < 80; i++) {
    await Promise.resolve();
  }
};
const song = (id) => ({ id, source: 'nas', title: id, artist: 'Artist', album: 'Album', duration: 20 });

async function nas() {
  let auth = { mode: 'nas', generation: 1, ensureApis: async () => {}, session: { baseUrl: 'https://fixture.invalid', account: 'a' } };
  const snapshots = new Map();
  const snapshotKey = (...parts) => JSON.stringify(parts);
  snapshots.set(snapshotKey('nas', 'a', 'all'), { version: 1, items: [song('cached')], validatedAt: 0 });
  let gate;
  let calls = 0;
  let saved = 0;
  const provider = { id: 'nas', getState: () => ({ scope: auth.session.account }),
    restore: (item) => ({ ...item, artworkUrl: 'current-session-cover' }),
    songs: async () => { calls++; return new Promise((resolve) => { gate = resolve; }); } };
  const boundaries = {
    '@/stores/auth': { useAuthStore: { getState: () => auth } },
    '@/services/music-providers/registry': { musicProvider: () => provider },
    './registry': { musicProvider: () => provider },
    './repository': { libraryIdentity: () => auth.session.account + ':' + auth.generation },
    '@/services/music-providers/library-snapshots': {
      librarySnapshotKey: snapshotKey,
      readLibrarySnapshot: async (key) => snapshots.get(key) ?? null,
      readLegacyNasLibrary: async () => null,
      writeLibrarySnapshot: async (key, snapshot, current) => {
        assert(current());
        saved++;
        snapshots.set(key, snapshot);
      },
    },
  };
  const cache = new Map();
  const library = loadSource('src/features/library/nas-library-cache.ts', boundaries, {}, cache);
  const tasks = loadSource('src/services/music-providers/nas-library-task.ts', boundaries, {}, cache);
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
  const key = ['song-library', 'a:1'];
  const initial = await client.fetchQuery({ queryKey: key, queryFn: ({ signal }) => library.readNasLibrary(signal) });
  assert.equal(initial.items[0].id, 'cached', 'SQLite metadata appears before any network request');
  assert.equal(initial.items[0].artworkUrl, 'current-session-cover');
  assert.equal(calls, 0);
  const stop = tasks.acquireNasLibrary(client, 'a:1');
  await flush();
  assert.equal(calls, 1);
  assert.equal(client.getQueryData(key).items[0].id, 'cached', 'SWR keeps the old library during refresh');
  gate({ items: [song('new')], total: 1 });
  await flush();
  assert.equal(client.getQueryData(key).items[0].id, 'new');
  assert.equal(saved, 1);
  const a = tasks.acquireNasLibrary(client, 'a:1');
  await flush();
  assert.equal(calls, 1, 'Another observer does not perform another full scan');
  a();
  stop();
  auth = { ...auth, generation: 2, session: { ...auth.session, account: 'b' } };
  const readB = library.readNasLibrary(new AbortController().signal);
  await flush();
  assert.equal(library.nasLibraryContext().page, undefined, 'Another account cannot see the old account cache');
  gate({ items: [song('b')], total: 1 });
  assert.equal((await readB).items[0].id, 'b');
  client.clear();
}

async function drive() {
  const calls = [];
  const versions = new Map([['one', 1], ['two', 1]]);
  let changes = [];
  let changeCursor = 'delta-1';
  let status = 200;
  let failures = 0;
  const queue = create(() => ({ queue: [] }));
  const boundaries = {
    zustand: { create },
    '@/services/google-drive/auth': { googleConnectionError: (error) => error.message },
    '@/services/google-drive/session': { createDriveSession: () => ({ clearToken() {} }) },
    '@/services/google-drive/selection': { parseDriveSelection: (raw) => JSON.parse(raw).files, saveDriveSelection: async () => {} },
    '@/services/google-drive/picker': { pickDriveFileIds: async () => null },
    '@/services/google-drive/metadata': { enrichDriveSongs: async (songs, _token, signal, publish) => {
      assert(!signal.aborted);
      publish(songs.map((song) => ({ ...song, album: 'Tagged ' + versions.get(song.drive.fileId), albumSource: 'tag' })));
      return failures;
    } },
    '@/stores/playback': { usePlaybackStore: queue },
    '@/stores/song-metadata': { useSongMetadataStore: { getState: () => ({ patches: {} }) } },
  };
  const globals = { fetch: async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer fixture-token');
    assert(!url.includes('fixture-token'));
    const parsed = new URL(url);
    calls.push(parsed);
    let data;
    if (parsed.pathname.endsWith('startPageToken')) {
      data = { startPageToken: 'start' };
    } else if (parsed.pathname.endsWith('/changes')) {
      if (status !== 200) {
        return new Response('{}', { status });
      }
      data = { changes, newStartPageToken: changeCursor };
    } else {
      const id = parsed.pathname.split('/').at(-1);
      data = { id, name: id + '.mp3', mimeType: 'audio/mpeg', modifiedTime: String(versions.get(id)), size: '100', capabilities: { canDownload: true } };
    }
    return new Response(JSON.stringify(data));
  } };
  const module = loadSource('src/stores/google-drive.ts', boundaries, globals);
  const store = module.useGoogleDriveStore;
  const files = [{ id: 'one', name: 'one.mp3' }, { id: 'two', name: 'two.mp3' }];
  store.setState({ account: { id: 'a', email: 'a@fixture.invalid' }, files, ready: true, accessToken: async () => 'fixture-token' });
  await store.getState().refresh();
  assert.equal(calls[0].pathname.endsWith('startPageToken'), true, 'Checkpoint precedes baseline reads');
  assert.equal(store.getState().syncCursor, 'start');
  assert.deepEqual(store.getState().songs.map(song => song.drive.fileId), ['one', 'two']);
  const originalOne = store.getState().songs[0];
  changes = [{ fileId: 'not-selected' }];
  assert.equal(await store.getState().revalidate(new AbortController().signal), 'unchanged');
  assert.equal(store.getState().songs[0], originalOne);
  assert.equal(calls.filter(url => url.pathname.includes('/files/')).length, 2, 'Unchanged/unauthorized selections never trigger per-file reads');
  versions.set('one', 2);
  changes = [{ fileId: 'one' }, { fileId: 'two', removed: true }, { fileId: 'not-selected' }];
  changeCursor = 'delta-2';
  assert.equal(await store.getState().revalidate(new AbortController().signal), 'updated');
  assert.deepEqual(store.getState().songs.map(song => song.drive.fileId), ['one']);
  assert.equal(store.getState().songs[0].album, 'Tagged 2');
  assert.equal(store.getState().syncCursor, 'delta-2');
  assert.equal(calls.filter(url => url.pathname.includes('/files/')).length, 3);
  failures = 1;
  changes = [{ fileId: 'one' }];
  await store.getState().revalidate(new AbortController().signal);
  assert.deepEqual(store.getState().pendingMetadataIds, ['one']);
  failures = 0;
  changes = [];
  await store.getState().revalidate(new AbortController().signal);
  assert.deepEqual(store.getState().pendingMetadataIds, []);
  status = 410;
  assert.equal(await store.getState().revalidate(new AbortController().signal), 'full-required');
  store.setState({ syncCursor: 'again' });
  status = 403;
  assert.equal(await store.getState().revalidate(new AbortController().signal), 'unchanged');
  assert.equal(store.getState().changesDisabled, true);
  const before = calls.length;
  await store.getState().revalidate(new AbortController().signal);
  assert.equal(calls.length, before, 'Rejected change permissions do not cause repeated API requests');
}

async function main() {
  const apiStorage = new Map();
  const discovery = loadSource('src/services/synology/discovery-cache.ts', {
    '@/services/preferences/storage': {
      readPreference: async (key) => apiStorage.get(key) ?? null,
      writePreference: async (key, value) => apiStorage.set(key, value),
    },
  });
  const apis = Object.fromEntries(['SYNO.API.Auth', 'SYNO.AudioStation.Song', 'SYNO.AudioStation.Album', 'SYNO.AudioStation.Artist', 'SYNO.AudioStation.Stream', 'SYNO.AudioStation.Cover'].map((name) => [name,
    { path: 'entry.cgi', minVersion: 1, maxVersion: 6, token: 'must-not-persist' }]));
  await discovery.cacheNasApis('https://fixture.invalid', apis);
  assert(![...apiStorage.values()][0].includes('must-not-persist'));
  assert((await discovery.readCachedNasApis('https://fixture.invalid'))['SYNO.AudioStation.Song']);
  assert.equal(await discovery.readCachedNasApis('https://another.invalid'), null);
  const savedKey = [...apiStorage.keys()][0];
  const expired = JSON.parse(apiStorage.get(savedKey));
  expired.savedAt -= 25 * 60 * 60_000;
  apiStorage.set(savedKey, JSON.stringify(expired));
  assert.equal(await discovery.readCachedNasApis('https://fixture.invalid'), null);
  await nas();
  await drive();
  console.log('PASS: real NAS cache/task/Query integration, cache-first startup, SWR, shared observers and account isolation; real Drive store/Changes integration, baseline ordering, selected deltas, deletion, unchanged references, metadata retry, expired cursor and permission fallback. HTTP/native services are mocked.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
