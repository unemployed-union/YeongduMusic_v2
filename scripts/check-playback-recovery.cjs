/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { create } = require('../node_modules/zustand');
const ts = require('../node_modules/typescript');

const file = path.join(__dirname, '..', 'src/services/playback/persistence.ts');
const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const values = new Map();
const storage = { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); }, removeItem: async key => { values.delete(key); } };
const auth = create(() => ({ mode: 'nas', session: { baseUrl: 'https://example.invalid', account: 'tester' } }));
const privacy = create(() => ({ ready: true, scope: 'https://example.invalid:tester', profile: { presets: [] } }));
const local = create(() => ({ songs: [] }));
const drive = create(() => ({ account: { id: 'drive-account' }, songs: [] }));
const playback = create(() => ({ queue: [], index: -1, position: 0, playing: false, shuffle: false, repeat: 'off' }));
let appStateListener;
const modules = {
  '@/components/text': { Text: 'Text' },
  'react-native': { Platform: { OS: 'android' }, AppState: { addEventListener: (_, listener) => { appStateListener = listener; return { remove() { appStateListener = undefined; } }; } } },
  '@/features/hidden-music/rules': {
    privacyScope: (mode, session) => mode === 'nas' ? `${session.baseUrl}:${session.account}` : mode === 'mock' ? 'demo' : null,
    hiddenMatcher: presets => song => presets.some(preset => preset.enabled && preset.songIds.includes(song.id)),
  },
  '@/stores/auth': { useAuthStore: auth },
  '@/stores/google-drive': { useGoogleDriveStore: drive },
  '@/stores/hidden-music': { useHiddenMusicStore: privacy },
  '@/stores/local-music': { useLocalMusicStore: local },
  '@/stores/playback': { usePlaybackStore: playback },
  '@/services/synology/api': { SynologyClient: class { coverUrl(id) { return `https://example.invalid/cover/${id}?_sid=current`; } } },
  'expo-sqlite/kv-store': { __esModule: true, default: storage },
};
const moduleExports = {};
new Function('require', 'exports', 'setTimeout', 'clearTimeout', code)(name => {
  Object.assign(modules, { ...require('./test-cloud-fixtures.cjs').cloudFixtures(), ...modules });
  if (!(name in modules)) throw new Error(`Unexpected dependency: ${name}`);
  return modules[name];
}, moduleExports, setTimeout, clearTimeout);

async function checkRootRemount({ playing = true, cold = false } = {}) {
  const effects = [], navigation = [];
  let privacyLoads = 0, stopped = 0, savedReads = 0, persistenceStarts = 0;
  const saved = { queue: [{ id: 'nas-live', source: 'nas' }], index: 0, playing, position: 37, shuffle: false, repeat: 'off', playbackRate: 1.75, preservePitch: false };
  const live = { queue: cold ? [] : saved.queue, index: cold ? -1 : 0, playing: cold ? false : playing, playbackRate: cold ? 1 : saved.playbackRate, preservePitch: cold ? true : saved.preservePitch };
  let restores = 0;
  const hidden = { ready: true, scope: 'current-account', profile: { presets: [] },
    load: async () => {
      privacyLoads++;
      hidden.ready = false;
      await Promise.resolve();
      hidden.ready = true;
    }, lock() {},
  };
  const reconcile = () => {
    if (!hidden.ready && live.queue[live.index]?.source === 'nas') {
      stopped++;
      live.queue = [];
      live.index = -1;
    }
  };
  const store = state => Object.assign(selector => selector ? selector(state) : state, { getState: () => state });
  const localState = { ready: true, songs: [], allSongs: [], load: async () => {
    await Promise.resolve();
    // Reloading the device library completes while the profile load is pending.
    // In production this update triggers the exclusion reconciliation effect.
    reconcile();
  } };
  const jsx = (type, props) => ({ type, props });
  const rootMocks = {
    react: { useEffect: effect => effects.push(effect), useMemo: compute => compute(), useRef: value => ({ current: value }) },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/components/text': { Text: 'Text' },
  'react-native': { View: 'View', ActivityIndicator: 'Spinner', Pressable: 'Button', Text: 'Text', useColorScheme: () => 'dark', AppState: { addEventListener: () => ({ remove() {} }) } },
    'react-native-gesture-handler': { GestureHandlerRootView: 'Root' },
    'expo-router': { router: { navigate: route => navigation.push(route) }, DarkTheme: {}, DefaultTheme: {}, ThemeProvider: 'Theme', Stack: Object.assign('Stack', { Screen: 'Screen' }) },
    '@tanstack/react-query': { QueryClient: class {}, QueryClientProvider: 'QueryProvider' },
    'expo-status-bar': { StatusBar: 'StatusBar' },
    'react-native-keyboard-controller': { KeyboardProvider: 'KeyboardProvider' },
    '@/stores/auth': { useAuthStore: store({ ready: true, mode: 'nas', session: {}, bootstrap: async () => {} }) },
    '@/stores/google-drive': { useGoogleDriveStore: store({ ready: true, account: null, bootstrap: async () => {} }) },
    '@/stores/local-music': { useLocalMusicStore: store(localState) },
    '@/stores/display-preferences': { useDisplayPreferences: store({ ready: true, load: async () => {} }) },
    '@/stores/library-preferences': { useLibraryPreferences: store({ ready: true, load: async () => {} }) },
    '@/stores/menu-preferences': { useMenuPreferences: store({ ready: true, load: async () => {} }) },
    '@/stores/hidden-music': { useHiddenMusicStore: store(hidden) },
    '@/stores/playlists': { usePlaylistStore: store({ load: async () => {} }) },
    '@/stores/playback': { usePlaybackStore: store(live) },
    '@/features/hidden-music/rules': { privacyScope: () => 'current-account' },
    '@/services/playback/controller': { reconcilePlaybackVisibility: reconcile, checkSleepTimer() {}, restorePlayback: async (queue, index, position, wasPlaying, shuffle, repeat, playbackRate, preservePitch) => {
      assert.equal(live.queue.length, 0, 'Live playback must not be reloaded');
      restores++;
      Object.assign(live, { queue, index, position, playing: wasPlaying, playbackRate, preservePitch });
      return true;
    } },
    '@/services/playback/persistence': { readRestoredPlayback: async () => { savedReads++; return saved; }, startPlaybackPersistence: () => { persistenceStarts++; return () => {}; } },
    '@/theme/tokens': { useColors: () => ({}) },
    '@/features/metadata/automatic-metadata': { AutomaticMetadata: 'AutomaticMetadata' },
  };
  const rootCode = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', 'src/app/_layout.tsx'), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const rootModule = {};
  new Function('require', 'exports', rootCode)(name => {
    Object.assign(rootMocks, { ...require('./test-cloud-fixtures.cjs').cloudFixtures({}, rootMocks), ...rootMocks });
    if (!(name in rootMocks)) throw new Error(`Unexpected root dependency: ${name}`);
    return rootMocks[name];
  }, rootModule);
  for (let remount = 0; remount < 2; remount++) {
    effects.length = 0;
    let node = rootModule.default();
    while (typeof node.type !== 'function') node = node.props.children;
    node.type();
    const cleanups = effects.map(effect => effect());
    for (let i = 0; i < 8; i++) await Promise.resolve();
    assert.equal(privacyLoads, 0, 'Remount must not clear the loaded account profile');
    assert.equal(stopped, 0, 'Remount and local-library refresh must retain the live NAS player');
    assert.equal(savedReads, cold ? 1 : 0, 'A live queue takes precedence over the persisted snapshot');
    assert.equal(restores, cold ? 1 : 0);
    assert.equal(live.playing, playing);
    assert.equal(live.playbackRate, saved.playbackRate, 'Cold restore forwards saved speed and remount preserves live speed');
    assert.equal(live.preservePitch, false, 'Cold restore and remount retain the pitch preference');
    assert.equal(live.queue[0].id, 'nas-live', 'Paused queue remains available to the mini player');
    assert.equal(navigation.at(-1), playing ? '/player' : '/(tabs)/(library)', 'Only active playback opens the player at startup');
    cleanups.forEach(cleanup => { if (typeof cleanup === 'function') cleanup(); });
  }
  assert.equal(persistenceStarts, 2, 'Each mounted root resumes snapshot updates');
}

async function main() {
  const nas = { id: 'nas-1', source: 'nas', title: 'NAS track', artist: 'Artist', album: 'Album', duration: 180, artworkUrl: 'file:///documents/album-art/custom.jpg',
    artworkOriginal: { artworkUrl: 'https://example.invalid/cover?_sid=private', palette: ['#111111', '#222222'] } };
  const device = { id: 'local-1', source: 'local', title: 'Device track', artist: 'Artist', album: 'Album', duration: 90, local: { fileName: 'file.mp3', originalName: 'file.mp3', size: 123 } };
  const cloud = { id: 'drive-1', source: 'drive', title: 'Drive track', artist: 'Artist', album: 'Album', duration: 80, drive: { fileId: 'file-id', accountId: 'drive-account', mimeType: 'audio/mpeg' } };
  local.setState({ songs: [device] });
  drive.setState({ songs: [{ ...cloud, artworkUrl: 'file:///cache/drive-current.jpg' }] });
  playback.setState({ queue: [nas, device, cloud], index: 0, position: 37, playing: true, shuffle: true, repeat: 'all', playbackRate: 1.75, preservePitch: false });
  const stop = moduleExports.startPlaybackPersistence();
  appStateListener('background');
  await new Promise(resolve => setTimeout(resolve, 20));
  const raw = [...values.values()][0];
  assert.ok(raw && !raw.includes('_sid=private'), 'Session-bearing artwork URL is not persisted');
  assert.equal(JSON.parse(raw).queue[0].artworkOriginal, undefined, 'Artwork overrides are reapplied from their own store after restoring fresh source images');
  assert.deepEqual(JSON.parse(raw).queue[0].palette, nas.artworkOriginal.palette);
  assert.equal(JSON.parse(raw).position, 37);
  assert.equal(JSON.parse(raw).playbackRate, 1.75);
  assert.equal(JSON.parse(raw).preservePitch, false);
  let saved = await moduleExports.readRestoredPlayback();
  assert.deepEqual(saved.queue.map(song => song.id), ['nas-1', 'local-1', 'drive-1']);
  assert.ok(saved.queue[0].artworkUrl.endsWith('_sid=current'));
  assert.equal(saved.queue[2].artworkUrl, 'file:///cache/drive-current.jpg', 'Drive original artwork uses the current account cache after restart');
  assert.equal(saved.playing, true);
  assert.equal(saved.repeat, 'all');
  assert.equal(saved.playbackRate, 1.75);
  assert.equal(saved.preservePitch, false);
  const legacyRate = JSON.parse(raw); delete legacyRate.playbackRate; delete legacyRate.preservePitch;
  values.set('yeongdumusic-playback-v1', JSON.stringify(legacyRate));
  assert.equal((await moduleExports.readRestoredPlayback()).playbackRate, 1, 'Old playback snapshots use the normal rate');
  assert.equal((await moduleExports.readRestoredPlayback()).preservePitch, true, 'Old snapshots keep the existing pitch-preserving behavior');
  legacyRate.playbackRate = 99; values.set('yeongdumusic-playback-v1', JSON.stringify(legacyRate));
  assert.equal((await moduleExports.readRestoredPlayback()).playbackRate, 1, 'Invalid saved rates cannot reach the native player');
  legacyRate.preservePitch = 'false'; values.set('yeongdumusic-playback-v1', JSON.stringify(legacyRate));
  assert.equal((await moduleExports.readRestoredPlayback()).preservePitch, true, 'Malformed pitch preferences use the default');
  values.set('yeongdumusic-playback-v1', raw);

  privacy.setState({ profile: { presets: [{ enabled: true, songIds: ['nas-1'] }] } });
  assert.equal(await moduleExports.readRestoredPlayback(), null, 'Hidden selected track must not be restored');
  privacy.setState({ profile: { presets: [] } });
  auth.setState({ session: { baseUrl: 'https://example.invalid', account: 'other' } });
  assert.equal(await moduleExports.readRestoredPlayback(), null, 'Another NAS account must not receive the prior queue');
  auth.setState({ session: { baseUrl: 'https://example.invalid', account: 'tester' } });

  const parsed = JSON.parse(raw);
  parsed.index = 1;
  values.set('yeongdumusic-playback-v1', JSON.stringify(parsed));
  local.setState({ songs: [] });
  assert.equal(await moduleExports.readRestoredPlayback(), null, 'Missing local selected track must not be restored');
  local.setState({ songs: [device] });
  saved = await moduleExports.readRestoredPlayback();
  assert.equal(saved.index, 1);
  assert.equal(saved.position, 37);

  playback.setState({ queue: [], index: -1 });
  appStateListener('background');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(values.size, 0, 'Explicitly cleared playback also clears saved playback');
  stop();
  await checkRootRemount();
  await checkRootRemount({ playing: false });
  await checkRootRemount({ playing: true, cold: true });
  await checkRootRemount({ playing: false, cold: true });
  console.log('Playback recovery checks passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
