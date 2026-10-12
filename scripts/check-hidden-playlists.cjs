/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));
const { create } = require(path.join(root, 'node_modules/zustand'));
function load(file, modules = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => { if (name in modules) return modules[name]; throw new Error('Unexpected module: ' + name); }, exports);
  return exports;
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
const rules = load('src/features/hidden-music/rules.ts');
const playlistRules = load('src/features/playlists/rules.ts');
const db = new DatabaseSync(':memory:');
let failedWrite = false, authFailure = false, authDelay = null, authCalls = 0;
const storage = load('src/services/hidden-music/storage.ts', {
  'react-native': { Platform: { OS: 'android' } }, '@/features/hidden-music/rules': rules,
  'expo-sqlite': { openDatabaseAsync: async () => ({
    execAsync: async sql => db.exec(sql),
    getFirstAsync: async (sql, ...args) => db.prepare(sql).get(...args),
    runAsync: async (sql, ...args) => { if (failedWrite) throw new Error('disk full'); return db.prepare(sql).run(...args); },
  }) },
});
const freshStore = () => load('src/stores/hidden-music.ts', {
  zustand: { create }, '@/features/hidden-music/rules': rules, '@/services/hidden-music/storage': storage,
  '@/services/hidden-music/biometrics': { authenticateHiddenSettings: async () => { authCalls++; if (authDelay) await authDelay.promise; if (authFailure) throw new Error('cancelled'); } },
}).useHiddenMusicStore;
const privacy = freshStore();
const presets = [{ id: 'public', name: 'Public', songIds: ['song'] }, { id: 'private', name: 'Private', songIds: ['song'] }];
let playlistState = { scope: 'demo', ready: true, busy: false, profile: { version: 1, presets }, load: async () => {} };
const nativeNames = ['ActivityIndicator', 'FlatList', 'Pressable', 'Text', 'View', 'Modal', 'KeyboardAvoidingView', 'ScrollView', 'TextInput', 'Switch'];
let cleanup;
const featureAccess = { ready: true, enabled: true, load: async () => {} };
const colors = { text: '#fff', tint: '#f48', muted: '#aaa', surface: '#222', separator: '#333', background: '#000' };
const selectPrivacy = selector => selector ? selector(privacy.getState()) : privacy.getState();
const jsx = (type, props) => ({ type, props });
const uiModules = {
  react: { useState: initial => [initial, () => {}], useMemo: fn => fn(), useCallback: fn => fn, useEffect: () => {} },
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'react-native': { ...Object.fromEntries(nativeNames.map(name => [name, name])), Alert: { alert: () => {} }, Platform: { OS: 'android' }, StyleSheet: { create: x => x, absoluteFill: {}, hairlineWidth: 1 } },
  'expo-router': { Redirect: 'Redirect', router: { push: () => {}, replace: () => {} }, useLocalSearchParams: () => ({ id: 'private' }), useFocusEffect: fn => { cleanup = fn(); } },
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
  'react-native-keyboard-controller': { KeyboardAvoidingView: 'KeyboardAvoidingView' },
  '@expo/vector-icons/Ionicons': { default: 'Icon', __esModule: true },
  '@/components/tab-scroll-edge-fade': { TabScrollEdgeFade: 'ScrollEdgeFade' },
  '@/components/scroll-edge-fade': { ScrollEdgeFade: 'ScrollEdgeFade' },
  '@/components/animated-switch': { AnimatedSwitch: 'Switch' },
  '@/components/screen-header': { ScreenHeader: 'ScreenHeader' }, '@/components/settings-button': { SettingsButton: 'SettingsButton' },
  '@/components/list-loading': { ListLoading: 'ListLoading' },
  '@/components/artwork': { Artwork: 'Artwork' }, '@/components/async-state': { AsyncState: 'AsyncState' },
  '@/theme/tokens': { useColors: () => colors }, '@/stores/hidden-music': { useHiddenMusicStore: selectPrivacy },
  '@/stores/playlists': { usePlaylistStore: () => playlistState },
  '@/stores/hidden-feature-access': { useHiddenFeatureAccess: selector => selector ? selector(featureAccess) : featureAccess },
  '@/features/playlists/rules': playlistRules, './rules': playlistRules,
  '@/features/playlists/dialogs': { PlaylistNameDialog: 'PlaylistNameDialog' },
  '@/features/playlists/song-picker': { PlaylistSongPicker: 'PlaylistSongPicker' },
  '@/features/hidden-music/rules': rules,
  '@/features/library/queries': { useSongs: () => ({ data: { items: [{ id: 'song', title: 'Music', artist: 'Artist', album: 'Album' }] } }) },
  '@/features/playback/play-and-open-player': { playAndOpenPlayer: async () => {} },
  '@/services/playback/controller': { enqueue: async () => {} },
};
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== 'object') return [];
  return [node, ...nodes(node.props?.children)];
}
function flatList(tree) { return nodes(tree).find(node => node.type === 'FlatList'); }
function text(tree) { return nodes(tree).filter(node => node.type === 'Text').flatMap(node => node.props.children).join(' '); }
async function main() {
  // Old saved profiles migrate without discarding presets or changing lock preferences.
  const old = rules.parseProfile(JSON.stringify({ version: 1, biometricLock: true, presets: [] }));
  assert.deepEqual(old.hiddenPlaylistIds, []);
  for (const bad of [null, 3, [''], [1]]) assert.throws(() => rules.parseProfile(JSON.stringify({ ...rules.emptyProfile(), hiddenPlaylistIds: bad })));
  assert.deepEqual(rules.parseProfile(JSON.stringify({ ...rules.emptyProfile(), hiddenPlaylistIds: ['private', 'private'] })).hiddenPlaylistIds, ['private']);
  await assert.rejects(privacy.getState().setPlaylistHidden('private', true), /먼저/);
  await privacy.getState().load('demo');
  await privacy.getState().savePreset({ id: 'music-rule', name: 'Music', enabled: true, songIds: ['nas-song'], folders: [] });
  await privacy.getState().setPlaylistHidden('private', true);
  await privacy.getState().setPlaylistHidden('private', true);
  assert.deepEqual(privacy.getState().profile.hiddenPlaylistIds, ['private']);
  assert.deepEqual(playlistRules.visiblePlaylists(presets, privacy.getState().profile.hiddenPlaylistIds).map(item => item.id), ['public']);
  assert.equal(rules.hiddenMatcher(privacy.getState().profile.presets)({ id: 'song', source: 'local' }), false, 'Playlist privacy does not hide music');
  assert.equal(privacy.getState().profile.presets.length, 1);
  const restarted = freshStore(); await restarted.getState().load('demo');
  assert.deepEqual(restarted.getState().profile.hiddenPlaylistIds, ['private']);
  assert.ok(!db.prepare('SELECT value FROM profiles WHERE scope = ?').get('demo').value.includes('Private'), 'Persist only playlist IDs');
  failedWrite = true;
  await assert.rejects(privacy.getState().setPlaylistHidden('private', false), /disk full/);
  assert.deepEqual(privacy.getState().profile.hiddenPlaylistIds, ['private']); failedWrite = false;
  authFailure = true;
  await assert.rejects(privacy.getState().setBiometricLock(true), /cancelled/);
  assert.equal(privacy.getState().profile.biometricLock, false); authFailure = false;
  await privacy.getState().setBiometricLock(true); privacy.getState().lock();
  await assert.rejects(privacy.getState().setPlaylistHidden('private', false), /생체 인증/);
  authFailure = true; await privacy.getState().unlock(); assert.equal(privacy.getState().unlocked, false); authFailure = false;
  const Gate = load('src/features/hidden-music/settings-gate.tsx', uiModules).HiddenSettingsGate;
  const marker = jsx('PrivateManager', {});
  assert.ok(!nodes(Gate({ children: marker })).includes(marker), 'Locked management must not render names');
  await privacy.getState().unlock();
  assert.ok(nodes(Gate({ children: marker })).includes(marker));
  // Normal lists always hide private playlists, including while management is unlocked.
  const List = load('src/app/(tabs)/(playlists)/playlists/index.tsx', uiModules).default;
  assert.deepEqual(flatList(List()).props.data.map(item => item.id), ['public']);
  assert.ok(!text(flatList(List()).props.ListHeaderComponent).includes('숨김 관리'), 'Management stays in settings even when concealed features are enabled');
  featureAccess.enabled = false;
  assert.ok(!text(flatList(List()).props.ListHeaderComponent).includes('숨김 관리'));
  assert.deepEqual(flatList(List()).props.data.map(item => item.id), ['public'], 'Concealing the feature preserves playlist filtering');
  assert.equal(Gate({ children: marker }).type, 'Redirect');
  assert.equal(Gate({ children: marker }).props.href, '/settings');
  assert.ok(!nodes(Gate({ children: marker })).includes(marker));
  featureAccess.ready = false;
  assert.ok(!nodes(Gate({ children: marker })).includes(marker));
  featureAccess.ready = true; featureAccess.enabled = true;
  const Settings = load('src/app/settings.tsx', {
    ...uiModules,
    'react-native': { ...uiModules['react-native'], Keyboard: { dismiss: () => {} } },
    'react-native-keyboard-controller': { KeyboardAwareScrollView: 'KeyboardAwareScrollView' },
    '@/features/playback/streaming-quality-settings': { StreamingQualitySettings: 'StreamingQualitySettings' },
    '@/features/playback/playback-options-settings': { PlaybackOptionsSettings: 'PlaybackOptionsSettings' },
    '@/features/google-drive/settings': { GoogleDriveSettings: 'GoogleDriveSettings' },
    '@/features/library/folder-exclusion-settings': { FolderExclusionSettings: 'FolderExclusionSettings' },
    '@/features/settings/version-settings': { VersionSettings: 'VersionSettings' },
    '@/features/settings/settings-ui': { SettingsLink: 'SettingsLink', SettingsPage: 'SettingsPage', SettingsSection: 'SettingsSection' },
    '@/services/synology/api': { discover: async () => ({}), normalizeAddress: x => x },
    '@/services/synology/cache': { clearLibraryCache: async () => {} },
    '@/services/playback/controller': { stopNasPlayback: () => {} },
    '@/stores/auth': { useAuthStore: selector => selector({ mode: 'mock', session: null, disconnect: async () => {} }) },
  }).default;
  assert.ok(nodes(Settings()).some(node => node.type === 'SettingsLink' && node.props.title === '기타'));
  assert.ok(!text(Settings()).includes('음악 숨기기')); assert.ok(!text(Settings()).includes('플레이리스트 숨기기'), 'Hidden controls live only in Other');
  featureAccess.enabled = false;
  assert.ok(!nodes(Settings()).some(node => node.type === 'SettingsLink' && node.props.title === '기타'));
  assert.ok(!text(Settings()).includes('음악 숨기기')); assert.ok(!text(Settings()).includes('플레이리스트 숨기기'));
  assert.ok(nodes(Settings()).some(node => node.type === 'VersionSettings'));
  assert.ok(nodes(Settings()).some(node => node.type === 'SettingsLink' && node.props.href === '/settings/library'), 'Ordinary library settings remain available');
  const Other = load('src/app/settings/other.tsx', {
    ...uiModules,
    '@/features/settings/settings-ui': { SettingsLink: 'SettingsLink', SettingsPage: 'SettingsPage', SettingsSection: 'SettingsSection' },
  }).default;
  assert.equal(Other().props.href, '/settings', 'Direct Other route requires feature activation');
  featureAccess.ready = false;
  assert.ok(!nodes(Other()).some(node => node.type === 'SettingsLink'));
  featureAccess.ready = true;
  featureAccess.enabled = true;
  assert.deepEqual(nodes(Other()).filter(node => node.type === 'SettingsLink').map(node => node.props.href), ['/hidden-music', '/hidden-playlists']);
  const Detail = load('src/app/(tabs)/(playlists)/playlists/[id].tsx', uiModules).default;
  assert.equal(flatList(Detail()), undefined, 'A direct hidden route must not reveal tracks');
  assert.ok(!text(Detail()).includes('Private'));
  const Dialog = load('src/features/playlists/dialogs.tsx', uiModules).AddToPlaylistDialog;
  const dialog = Dialog({ songs: [{ id: 'song', source: 'local' }], onClose: () => {} });
  assert.ok(!text(dialog).includes('Private')); assert.ok(text(dialog).includes('Public'));
  const Manager = load('src/features/playlists/hidden-playlist-manager.tsx', uiModules).HiddenPlaylistManager;
  assert.equal(flatList(Manager()).props.data.length, 2, 'Authorized manager includes hidden playlists');
  cleanup(); assert.equal(privacy.getState().unlocked, false, 'Leaving either manager relocks the shared setting');
  authDelay = deferred(); const lateUnlock = privacy.getState().unlock(); privacy.getState().lock(); authDelay.resolve(); await lateUnlock; authDelay = null;
  assert.equal(privacy.getState().unlocked, false);
  authDelay = deferred(); const otherUnlock = privacy.getState().unlock(); await privacy.getState().load('bob'); authDelay.resolve(); await otherUnlock; authDelay = null;
  assert.equal(privacy.getState().scope, 'bob'); assert.equal(privacy.getState().unlocked, false);
  assert.deepEqual(privacy.getState().profile.hiddenPlaylistIds, []);
  // Scope changes and incomplete reads may not show an old account's names.
  assert.equal(flatList(List()), undefined);
  assert.equal(flatList(Detail()), undefined);
  assert.ok(!text(Dialog({ songs: [], onClose: () => {} })).includes('Private'));
  await privacy.getState().load('demo'); await privacy.getState().unlock();
  await privacy.getState().setPlaylistHidden('private', false);
  assert.deepEqual(playlistRules.visiblePlaylists(presets, privacy.getState().profile.hiddenPlaylistIds), presets);
  assert.deepEqual(flatList(List()).props.data, presets);
  assert.ok(flatList(Detail()), 'Unhide restores the existing detail screen');
  assert.equal(privacy.getState().profile.presets.length, 1);
  privacy.setState({ ready: false }); assert.equal(flatList(List()), undefined); assert.equal(flatList(Detail()), undefined);
  assert.ok(!nodes(Gate({ children: marker })).includes(marker));
  assert.ok(authCalls > 0);
  console.log('PASS: playlist hide/unhide, SQLite restart/account persistence, legacy profile migration, corrupt data and disk failures; shared lock/cancel/late authentication, manager relocking, list/add-dialog filtering and hidden direct-route protection. Native biometrics/UI and NAS are mocked.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.close());
