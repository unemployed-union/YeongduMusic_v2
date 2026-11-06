const assert = require('node:assert/strict');
const { create } = require('zustand');
const { loadSource } = require('./test-source-loader.cjs');

const calls = [];
let handler;
const globals = {
  fetch: async (url, options) => {
    calls.push({ url: new URL(url), options });
    return handler(new URL(url), options);
  },
};
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const api = loadSource('src/services/jellyfin/api.ts', {}, globals);
const session = {
  baseUrl: 'https://music.invalid/jellyfin',
  userId: 'user-a',
  username: 'Fixture',
  serverId: 'server-a',
  version: '12.4',
  deviceId: 'device-fixture',
  token: 'secret-fixture-token',
};
const client = new api.JellyfinClient(session);
const mapping = loadSource('src/services/jellyfin/mapping.ts', { './api': api });
const item = {
  Id: 'track-a',
  Type: 'Audio',
  Name: 'Track',
  AlbumId: 'album-a',
  RunTimeTicks: 123_000_000,
  MediaStreams: [{ Type: 'Audio', Codec: 'flac' }],
};
const song = mapping.jellyfinSong(item, session);
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function main() {
  assert.equal(api.normalizeJellyfinAddress('music.invalid/jellyfin/'), session.baseUrl);
  assert.throws(() => api.normalizeJellyfinAddress('http://music.invalid'), /HTTP/);
  assert.equal(
    api.normalizeJellyfinAddress('http://music.invalid/base/', true),
    'http://music.invalid/base',
  );
  for (const address of [
    'https://user:password@music.invalid',
    'https://music.invalid?token=x',
    'file:///tmp/music',
    'https://music.invalid/#token',
  ]) {
    assert.throws(() => api.normalizeJellyfinAddress(address));
  }
  assert.equal(
    client.url('Items', { ParentId: 'one & two' }),
    'https://music.invalid/jellyfin/Items?ParentId=one+%26+two',
  );
  assert.equal(song.duration, 12.3);
  assert.equal(song.artist, '알 수 없는 아티스트');
  assert.notEqual(song.id, mapping.jellyfinSong(item, { ...session, userId: 'user-b' }).id);
  assert.notEqual(
    song.albumId,
    mapping.jellyfinSong(item, { ...session, baseUrl: 'https://another.invalid' }).albumId,
  );
  assert(!JSON.stringify(song).includes(session.token));
  handler = async (url, options) => {
    assert.equal(options.redirect, 'error');
    assert(!url.toString().includes(session.token));
    if (url.pathname.endsWith('/System/Info/Public')) {
      return json({ Id: session.serverId, Version: '12.4' });
    }
    const body = JSON.parse(options.body);
    assert.deepEqual(body, { Username: 'Fixture', Pw: 'fixture-password' });
    return json({ User: { Id: session.userId, Name: 'Fixture' }, AccessToken: session.token });
  };
  const loggedIn = await api.loginJellyfin(
    session.baseUrl,
    ' Fixture ',
    'fixture-password',
    session.deviceId,
  );
  assert.equal(loggedIn.token, session.token);
  for (const status of [401, 403, 500]) {
    handler = async () => json({}, status);
    await assert.rejects(
      client.check(),
      (error) =>
        error instanceof api.JellyfinError &&
        error.status === status &&
        !error.message.includes(session.token),
    );
  }
  handler = async () =>
    new Response('<html>Access login</html>', { headers: { 'content-type': 'text/html' } });
  await assert.rejects(client.check(), /Cloudflare Access/);
  handler = async () => new Response('{', { headers: { 'content-type': 'application/json' } });
  await assert.rejects(client.check(), /형식/);
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(client.check(cancelled.signal), /취소/);

  const playback = loadSource('src/services/jellyfin/playback.ts', {
    'react-native': { Platform: { OS: 'ios' } },
    './api': api,
  });
  handler = async (url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.StartTimeTicks, 0);
    assert.equal(body.DeviceProfile.TranscodingProfiles[0].Protocol, 'http');
    return json({
      MediaSources: [{ Id: 'media-a', SupportsDirectPlay: true }],
      PlaySessionId: 'play-a',
    });
  };
  const direct = await playback.jellyfinPlaybackSource(client, song, 'original');
  assert.equal(direct.lossless, true);
  assert.equal(new URL(direct.uri).searchParams.get('Static'), 'true');
  assert(direct.headers.Authorization.includes(session.token));
  let released = 0;
  handler = async (url, options) => {
    if (options.method === 'DELETE') {
      released++;
      assert.equal(url.searchParams.get('PlaySessionId'), 'play-b');
      return new Response(null, { status: 204 });
    }
    assert.equal(JSON.parse(options.body).StartTimeTicks, 45 * 10_000_000);
    return json({
      MediaSources: [
        {
          Id: 'media-a',
          SupportsTranscoding: true,
          TranscodingUrl:
            '/jellyfin/Audio/track-a/stream.mp3?api_key=secret-fixture-token&startTimeTicks=0&AudioBitRate=128000',
        },
      ],
      PlaySessionId: 'play-b',
    });
  };
  const transcode = await playback.jellyfinPlaybackSource(client, song, 'mp3', { position: 45 });
  assert.equal(transcode.seekMode, 'reload');
  assert.equal(transcode.positionOffset, 45);
  assert.equal(transcode.lossless, false);
  assert(!transcode.uri.includes(session.token));
  assert.equal(new URL(transcode.uri).searchParams.get('startTimeTicks'), '450000000');
  await transcode.release();
  await transcode.release();
  assert.equal(released, 1);
  handler = async () =>
    json({
      MediaSources: [
        { Id: 'a', SupportsTranscoding: true, TranscodingUrl: 'https://other.invalid/stream.mp3' },
      ],
      PlaySessionId: 'play-c',
    });
  await assert.rejects(playback.jellyfinPlaybackSource(client, song, 'mp3'), /주소/);
  handler = async () => json({ MediaSources: [] });
  await assert.rejects(
    playback.jellyfinPlaybackSource(client, song, 'original'),
    /재생할 수 없습니다/,
  );

  const library = loadSource('src/services/jellyfin/library.ts', {
    './api': api,
    './artwork': { jellyfinArtwork: () => undefined },
  });
  const pages = [];
  const collected = await library.collectJellyfinItems(async (page) => {
    pages.push(page.offset);
    return { items: page.offset ? [item] : Array.from({ length: 100 }, () => item), total: 101 };
  });
  assert.deepEqual(pages, [0, 100]);
  assert.equal(collected.length, 101, 'Playlist duplicate occurrences survive pagination');
  await assert.rejects(
    library.collectJellyfinItems(async () => ({ items: [], total: 1 })),
    /목록이 변경/,
  );

  let saved = null;
  let checkFailure = false;
  let loginGate = null;
  let preferenceGate = null;
  const libraryRequests = [];
  const sessionApi = {
    ...api,
    loginJellyfin: async () => (loginGate ? loginGate.promise : { ...session }),
    JellyfinClient: class extends api.JellyfinClient {
      async check() {
        if (checkFailure) {
          throw new api.JellyfinError('offline');
        }
      }
      async request() {}
      async libraries() {
        return [{ id: 'library-a', name: 'Music' }];
      }
      async items(_page, query) {
        libraryRequests.push(query.ParentId);
        return { items: [item], total: 1 };
      }
    },
  };
  const storeModule = loadSource('src/stores/jellyfin.ts', {
    zustand: { create },
    'react-native': { Platform: { OS: 'android' } },
    'expo-secure-store': {
      getItemAsync: async () => saved,
      setItemAsync: async (_, value) => {
        saved = value;
      },
      deleteItemAsync: async () => {
        saved = null;
      },
    },
    '@/services/preferences/storage': {
      readPreference: async () => null,
      writePreference: async () => {
        if (preferenceGate) {
          await preferenceGate.promise;
        }
      },
    },
    '@/services/music-providers/cache': {
      cachedPage: async () => null,
      cachePage: async (_, page) => {
        assert(!JSON.stringify(page).includes(session.token));
      },
    },
    '@/services/jellyfin/api': sessionApi,
    '@/services/jellyfin/library': library,
  });
  const store = storeModule.useJellyfinStore;
  await store.getState().connect(session.baseUrl, session.username, 'password', false);
  assert(store.getState().connection);
  assert(!JSON.stringify(store.getState()).includes(session.token));
  await store.getState().refresh();
  assert.equal(store.getState().songs.length, 1);
  const provider = loadSource('src/services/music-providers/jellyfin.ts', {
    '@/stores/jellyfin': storeModule,
    '@/stores/streaming-preferences': {},
    '@/services/jellyfin/api': sessionApi,
    '@/services/jellyfin/playback': {},
    '@/services/jellyfin/library': library,
  }).jellyfinProvider;
  preferenceGate = deferred();
  const selecting = store.getState().selectLibraries([]);
  assert.equal(
    provider.getState().ready,
    false,
    'Selection storage must finish before automatic scans',
  );
  const beforeSelection = libraryRequests.length;
  await assert.rejects(store.getState().refresh(), /설정을 확인 중/);
  assert.equal(
    libraryRequests.length,
    beforeSelection,
    'A scan cannot abort pending authentication or settings',
  );
  preferenceGate.resolve();
  await selecting;
  preferenceGate = null;
  assert.equal(provider.getState().ready, true);
  await store.getState().refresh();
  assert.equal(
    store.getState().songs.length,
    0,
    'An empty selection cannot receive songs from the previous selection',
  );
  const oldClient = store.getState().client();
  loginGate = deferred();
  const pending = store.getState().connect('https://new.invalid', 'new', 'password', false);
  assert.equal(
    provider.getState().ready,
    false,
    'Account replacement does not start scans with old credentials',
  );
  await assert.rejects(store.getState().refresh(), /설정을 확인 중/);
  await store.getState().disconnect();
  loginGate.resolve({ ...session, userId: 'new-user' });
  await pending;
  assert.equal(store.getState().connection, null);
  assert.equal(saved, null, 'Obsolete login cannot resurrect a disconnected account');
  loginGate = null;
  await store.getState().connect(session.baseUrl, session.username, 'password', false);
  await store.getState().expire(oldClient);
  assert(store.getState().connection, 'Old client cannot expire a newer login');
  checkFailure = true;
  const persisted = saved;
  const fresh = loadSource('src/stores/jellyfin.ts', {
    zustand: { create },
    'react-native': { Platform: { OS: 'android' } },
    'expo-secure-store': {
      getItemAsync: async () => persisted,
      setItemAsync: async () => {},
      deleteItemAsync: async () => {
        throw new Error('Transient failure must preserve the saved session');
      },
    },
    '@/services/preferences/storage': { readPreference: async () => null },
    '@/services/music-providers/cache': { cachedPage: async () => null },
    '@/services/jellyfin/api': sessionApi,
    '@/services/jellyfin/library': library,
  }).useJellyfinStore;
  await fresh.getState().bootstrap();
  assert(fresh.getState().connection);
  assert.match(fresh.getState().error, /offline/);
  console.log(
    'PASS: Jellyfin URL/authentication errors, token isolation, direct/transcoded playback, seeking contract, cleanup, pagination/duplicates and session races. Native audio and a real server are not exercised.',
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
