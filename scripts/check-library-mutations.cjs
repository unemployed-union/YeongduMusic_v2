/* global __dirname */
const assert = require('node:assert/strict');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { create } = require('zustand');
const { loadSource } = require('./test-source-loader.cjs');
const baseline = process.argv[2];
const source = file => baseline
  ? path.resolve(baseline, file.replaceAll('/', '_') + '.txt')
  : path.resolve(__dirname, '..', file);
const measurements = {};
const tick = () => new Promise(resolve => setImmediate(resolve));

async function checkLocalLookup() {
  const rows = new Map(Array.from({ length: 10000 }, (_, index) => {
    const digest = index.toString(16).padStart(32, '0');
    const song = { id: 'local:' + digest + ':3', source: 'local', title: 'Song', artist: 'Artist', album: 'Album', duration: 180,
      local: { fileName: digest + '-3.mp3', size: 3 } };
    return [song.id, JSON.stringify(song)];
  }));
  let loadedRows = 0;
  let recoveries = 0;
  let deletes = 0;
  const db = {
    getAllAsync: async () => { loadedRows += rows.size; return [...rows.values()].map(value => ({ value })); },
    getFirstAsync: async (_sql, id) => { loadedRows++; return rows.has(id) ? { value: rows.get(id) } : null; },
    runAsync: async (_sql, id) => rows.delete(id),
  };
  const storage = loadSource(source('src/services/local-music/storage.ts'), {
    './database': { openLocalDatabase: async () => db },
    './metadata-recovery': { recoverLocalMetadata: async song => { recoveries++; return song; } },
    './files': { localMusicDirectory: () => 'file:///owned/' },
    './file-copy': {},
    './folders': loadSource('src/services/local-music/folders.ts'),
    'react-native': { Platform: { OS: 'android' } },
    'expo-file-system/legacy': { deleteAsync: async uri => { assert(!uri.includes('..')); deletes++; } },
    'expo-document-picker': {},
    '@/stores/folder-exclusions': {},
  });
  const target = [...rows.keys()][5000];
  const start = performance.now();
  await storage.deleteLocalSong(target);
  measurements.singleLocalDelete = { milliseconds: performance.now() - start, loadedRows, recoveries };
  assert.equal(deletes, 1);
  assert.equal(rows.has(target), false);
  if (!baseline) {
    assert.equal(loadedRows, 1);
    assert.equal(recoveries, 1, 'Single lookup still invokes metadata recovery');
    const validId = [...rows.keys()][0];
    const row = rows.get(validId);
    assert.deepEqual(await storage.readLocalSong(validId), (await storage.readLocalSongs())[0]);
    assert.equal(await storage.readLocalSong('missing'), null);
    rows.set('unrelated-broken', '{');
    assert.equal((await storage.readLocalSong(validId)).id, validId);
    await assert.rejects(storage.readLocalSongs(), 'Full loads still validate the entire library');
    rows.delete('unrelated-broken');
    const invalid = JSON.parse(row);
    invalid.local.fileName = '../outside.mp3';
    rows.set(validId, JSON.stringify(invalid));
    await assert.rejects(storage.deleteLocalSong(validId));
    assert.equal(deletes, 1, 'Malformed paths are rejected before deletion');
    const differentId = [...rows.keys()][1];
    rows.set(validId, rows.get(differentId));
    await assert.rejects(storage.readLocalSong(validId), 'Row key must match the decoded ID');
    rows.set(validId, row);
  }
}

async function checkPersistence() {
  const playback = loadSource('src/stores/playback.ts', { zustand: { create } }).usePlaybackStore;
  const queue = Array.from({ length: 10000 }, (_, index) => ({
    id: 'nas-' + index, source: 'nas', title: 'Track ' + index, artist: 'Artist', album: 'Album', duration: 180,
    artworkUrl: 'https://fixture.invalid/art?_sid=SECRET',
  }));
  playback.setState({ queue, index: 0, duration: 180 });
  let saved = null;
  let writes = 0;
  let failWrite = false;
  let scope = 'demo';
  const recorder = loadSource(source('src/services/playback/persistence.ts'), {
    'react-native': { Platform: { OS: 'web' } },
    '@/stores/playback': { usePlaybackStore: playback },
    '@/stores/auth': { useAuthStore: { getState: () => ({ mode: 'mock', session: null }) } },
    '@/stores/hidden-music': { useHiddenMusicStore: { getState: () => ({ ready: true, scope: 'demo', profile: { presets: [] } }) } },
    '@/stores/google-drive': { useGoogleDriveStore: { getState: () => ({ account: null }) } },
    '@/stores/s3': { useS3Store: { getState: () => ({ connection: null }) } },
    '@/stores/mybox': { useMyboxStore: { getState: () => ({ connection: null }) } },
    '@/services/music-providers/registry': {
      musicProviders: [{ id: 'nas', getState: () => ({ scope }) }],
      providerForSong: () => ({ id: 'nas', getState: () => ({ scope }), restore: song => song }),
    },
    './playback-rate': loadSource('src/services/playback/playback-rate.ts'),
  }, {
    localStorage: {
      getItem: () => saved,
      removeItem: () => { writes++; saved = null; },
      setItem: (_key, value) => {
        writes++;
        if (failWrite) {
          failWrite = false;
          throw Error('disk full');
        }
        saved = value;
      },
    },
  });
  const start = performance.now();
  const stop = recorder.startPlaybackPersistence();
  playback.setState({ index: 5 });
  playback.setState({ playing: true });
  playback.setState({ shuffle: true });
  playback.setState({ repeat: 'all' });
  playback.setState({ playbackRate: 1.5 });
  playback.setState({ preservePitch: false });
  await tick();
  measurements.queueBurst = { milliseconds: performance.now() - start, writes };
  if (!baseline) {
    assert.equal(writes, 1, 'One synchronous transport burst needs one snapshot/write');
  }
  assert.equal(saved.includes('SECRET'), false, 'Credentials are not serialized');
  const record = JSON.parse(saved);
  assert.equal(record.version, 1, 'Existing snapshot format remains readable');
  const restored = await recorder.readRestoredPlayback();
  assert.equal(restored.queue.length, 10000);
  assert.equal(restored.index, 5);
  assert.equal(restored.position, 0);
  assert.equal(restored.shuffle, true);
  assert.equal(restored.repeat, 'all');
  assert.equal(restored.playbackRate, 1.5);
  assert.equal(restored.preservePitch, false);
  failWrite = true;
  playback.setState({ playing: false });
  await tick();
  playback.setState({ playing: true });
  await tick();
  assert.equal(JSON.parse(saved).playing, true, 'A failed write does not block later saves');
  playback.setState({ index: 9 });
  stop();
  playback.setState({ index: 20 });
  await tick();
  assert.equal(JSON.parse(saved).index, 9, 'Stopping flushes the last observed state');
  scope = 'different-account';
  assert.equal(await recorder.readRestoredPlayback(), null, 'Stored credentials are revalidated');
  scope = 'demo';
  const stopAgain = recorder.startPlaybackPersistence();
  playback.setState({ queue: [], index: -1 });
  await tick();
  assert.equal(saved, null, 'Clearing the queue cannot be overwritten by a pending snapshot');
  stopAgain();
}

async function checkPlaylistMove() {
  const ids = Array.from({ length: 10000 }, (_, index) => 'song-' + index);
  const visible = ids.filter((_id, index) => index % 2 === 0);
  const store = loadSource(source('src/stores/playlists.ts'), {
    zustand: { create },
    '@/services/playlists/storage': {
      readPlaylists: async () => ({ version: 1, presets: [{ id: 'one', name: 'One', songIds: ids }] }),
      writePlaylists: async () => {},
    },
  }).usePlaylistStore;
  await store.getState().load('demo');
  const start = performance.now();
  await store.getState().moveSong('one', 'song-5000', -1, visible);
  measurements.playlistMove = { milliseconds: performance.now() - start };
  const moved = store.getState().profile.presets[0].songIds;
  const expected = [...ids];
  [expected[4998], expected[5000]] = [expected[5000], expected[4998]];
  assert.deepEqual(moved, expected, 'Move between visible neighbors preserves hidden positions');
  await store.getState().moveSong('one', 'song-0', -1, []);
  assert.deepEqual(store.getState().profile.presets[0].songIds, expected);
}

async function checkPicker() {
  const items = Array.from({ length: 10000 }, (_, index) => ({ id: 'track-' + index, title: 'Track ' + index, artist: 'Artist', album: 'Album' }));
  let filterPasses = 0;
  items.filter = function (predicate) {
    filterPasses++;
    return Array.prototype.filter.call(this, predicate);
  };
  const query = { data: { items, total: items.length } };
  const store = { busy: false, addSongs: async (_id, ids) => { added = ids; } };
  let added;
  let preset = { id: 'one', songIds: ['track-1'] };
  let cursor = 0;
  const slots = [];
  const react = {
    useState(initial) {
      const slot = cursor++;
      if (!slots[slot]) {
        slots[slot] = { value: typeof initial === 'function' ? initial() : initial };
      }
      return [slots[slot].value, next => { slots[slot].value = typeof next === 'function' ? next(slots[slot].value) : next; }];
    },
    useMemo(compute, dependencies) {
      const slot = cursor++;
      if (!slots[slot] || dependencies.some((value, index) => !Object.is(value, slots[slot].dependencies[index]))) {
        slots[slot] = { value: compute(), dependencies };
      }
      return slots[slot].value;
    },
  };
  const jsx = (type, props) => ({ type, props });
  const { PlaylistSongPicker } = loadSource(source('src/features/playlists/song-picker.tsx'), {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { View: 'View', Pressable: 'Pressable', FlatList: 'FlatList', ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: value => value }, useWindowDimensions: () => ({ height: 800 }) },
    '@/components/scroll-edge-fade': { ScrollEdgeFade: 'Fade' },
    '@/components/text': { Text: 'Text' },
    '@/components/text-input': { TextInput: 'TextInput' },
    '@/components/artwork': { Artwork: 'Artwork' },
    '@expo/vector-icons/Ionicons': { default: 'Icon' },
    '@/features/library/queries': { useSongs: () => query },
    '@/stores/playlists': { usePlaylistStore: () => store },
    '@/theme/tokens': { useColors: () => ({}) },
    './dialogs': { PlaylistSheet: 'Sheet' },
  });
  function find(node, type) {
    if (!node || typeof node !== 'object') {
      return undefined;
    }
    if (node.type === type) {
      return node;
    }
    const children = Array.isArray(node.props?.children) ? node.props.children : [node.props?.children];
    for (const child of children) {
      const match = find(child, type);
      if (match) {
        return match;
      }
    }
  }
  function render() {
    cursor = 0;
    return PlaylistSongPicker({ preset, onClose() {} });
  }
  let tree = render();
  for (let index = 0; index < 12; index++) {
    tree = render();
  }
  measurements.pickerRepeatedRenders = { fullEligibilityPasses: filterPasses };
  if (!baseline) {
    assert.equal(filterPasses, 1);
  }
  find(tree, 'TextInput').props.onChangeText('Artist');
  tree = render();
  assert.equal(find(tree, 'FlatList').props.data.length, 10000);
  const list = find(tree, 'FlatList');
  list.props.renderItem({ item: items[2] }).props.onPress();
  tree = render();
  find(tree, 'FlatList').props.renderItem({ item: items[0] }).props.onPress();
  tree = render();
  const save = tree.props.children.props.children.at(-1);
  save.props.onPress();
  await tick();
  assert.deepEqual(added, ['track-0', 'track-2'], 'Selection order follows the library, not checkbox order');
  preset = { ...preset, songIds: [...preset.songIds, 'track-0'] };
  tree = render();
  tree.props.children.props.children.at(-1).props.onPress();
  await tick();
  assert.deepEqual(added, ['track-2'], 'Newly saved songs are excluded from eligibility');
}

async function main() {
  await checkLocalLookup();
  await checkPersistence();
  await checkPlaylistMove();
  await checkPicker();
  console.log(JSON.stringify({ mode: baseline ? 'baseline' : 'optimized', ...measurements }));
  console.log('PASS: single-row validation/recovery boundary, final v1 snapshot/state/coalescing/failure/clear/stop/account handling and visible playlist order. Native storage is mocked.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
