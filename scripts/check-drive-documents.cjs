/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const { create } = require('zustand'), { Sha256 } = require('@aws-crypto/sha256-js');
function load(file, dependencies = {}) {
  const modules = { ...require('./test-cloud-fixtures.cjs').cloudFixtures({}, dependencies), ...dependencies };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => { if (name in modules) return modules[name]; if (name === 'zustand') return { create }; throw Error('Unexpected document dependency ' + name); }, exports);
  return exports;
}
const uri = id => 'content://com.google.android.apps.docs.storage/document/acc%3D1%3Bdoc%3D' + id;
const asset = (id, name = id + '.mp3') => ({ uri: uri(id), name, mimeType: 'audio/mpeg', size: 1234 });
function harness(saved = null, grants = new Set()) {
  const h = { saved, grants, selection: { canceled: false, assets: [asset('one'), asset('two')] }, calls: [], failWrite: false, failGrant: false, failRelease: false, available: true, platform: 'android' };
  const bridge = {
    documentPermissions: async () => [...grants],
    persistDocuments: async uris => { h.calls.push(['persist', uris]); if (h.failGrant) throw Error('permission denied'); uris.forEach(value => grants.add(value)); return uris; },
    releaseDocuments: async uris => { h.calls.push(['release', uris]); if (h.failRelease) throw Error('release failed'); uris.forEach(value => grants.delete(value)); },
  };
  const service = load('src/services/google-drive/documents.ts', {
    'react-native': { Platform: { get OS() { return h.platform; } } },
    expo: { requireOptionalNativeModule: () => h.available ? bridge : null },
    'expo-document-picker': { getDocumentAsync: async options => { h.calls.push(['pick', options]); assert.equal(options.copyToCacheDirectory, false, 'Never copy remote audio to cache'); assert.equal(options.base64, false); assert.equal(options.multiple, true); return h.selection; } },
    'expo-sqlite/kv-store': { __esModule: true, default: { getItem: async () => h.saved, setItem: async (_, value) => { if (h.failWrite) throw Error('disk full'); h.saved = value; } } },
    '@aws-crypto/sha256-js': { Sha256 }, '@/services/music-source': load('src/services/music-source.ts'),
  });
  const module = load('src/stores/drive-documents.ts', { '@/services/google-drive/documents': service });
  return Object.assign(h, { service, store: module.useDriveDocumentsStore, source: module.driveDocumentSource });
}
async function main() {
  const h = harness(); await h.store.getState().load(); assert(h.store.getState().ready);
  await h.store.getState().add();
  assert.equal(h.store.getState().error, null); assert.equal(h.store.getState().songs.length, 2); assert.equal(h.grants.size, 2);
  const one = h.store.getState().songs[0], saved = h.saved;
  assert.equal(one.drive.accountId, 'saf'); assert.equal(one.drive.documentUri, uri('one')); assert.equal(one.path, 'one.mp3');
  assert.match(one.id, /^drive:saf:[a-f0-9]{64}$/);
  assert.deepEqual(await h.source(one), { uri: uri('one') }, 'Playback uses the original content URI with no OAuth/header/file copy');
  const revision = h.store.getState().revision;
  await h.store.getState().load(); assert.equal(h.store.getState().revision, revision, 'Unchanged grant checks do not invalidate library refreshes');
  const restarted = harness(h.saved, h.grants); await restarted.store.getState().load();
  assert.equal(restarted.store.getState().songs[0].id, one.id); assert.deepEqual(await restarted.source(one), { uri: uri('one') });
  h.selection = { canceled: false, assets: [asset('one'), asset('one')] }; await h.store.getState().add();
  assert.equal(h.store.getState().documents.length, 2, 'Re-selecting documents preserves stable IDs and does not duplicate songs');
  h.selection = { canceled: true }; const beforeCancel = h.saved; await h.store.getState().add(); assert.equal(h.saved, beforeCancel);
  h.selection = { canceled: false, assets: [{ ...asset('bad'), uri: 'content://downloads/document/one' }] }; await h.store.getState().add();
  assert.match(h.store.getState().error, /Google Drive/); assert.equal(h.saved, beforeCancel);
  h.selection = { canceled: false, assets: [asset('three'), asset('notes', 'notes.txt')] }; h.failWrite = true;
  await h.store.getState().add(); assert.match(h.store.getState().error, /disk full/); assert.equal(h.saved, beforeCancel);
  assert(h.grants.has(uri('one'))); assert(!h.grants.has(uri('three')), 'Failed publication releases only newly retained permissions');
  h.failWrite = false; h.failGrant = true; await h.store.getState().add(); assert.equal(h.saved, beforeCancel); h.failGrant = false;
  h.grants.delete(uri('one')); await h.store.getState().load(); assert.equal(h.store.getState().songs.length, 1);
  assert.equal(h.store.getState().documents.length, 2, 'Revoked items remain available for re-selection/removal');
  await assert.rejects(h.source(one), /읽기 권한/);
  h.selection = { canceled: false, assets: [asset('one')] }; await h.store.getState().add(); assert.equal(h.store.getState().songs.length, 2);
  await h.store.getState().remove(one.drive.fileId); assert(!h.grants.has(uri('one'))); await assert.rejects(h.source(one), /제외/);
  const two = h.store.getState().songs[0]; h.failRelease = true; await h.store.getState().remove(two.drive.fileId);
  assert.equal(h.store.getState().songs.length, 0); await assert.rejects(h.source(two), /제외/, 'Cleanup failure never republishes removed files');
  const corrupt = harness(saved); corrupt.saved = saved.replace('content://', 'https://');
  await corrupt.store.getState().add(); assert(corrupt.store.getState().error); assert(!corrupt.calls.some(([name]) => name === 'pick'));
  const missing = harness(); missing.available = false; await missing.store.getState().add(); assert.match(missing.store.getState().error, /네이티브 빌드/); assert.equal(missing.calls.length, 0);
  missing.platform = 'ios'; assert.deepEqual(await missing.service.readDriveDocuments(), []); await assert.rejects(missing.service.pickDriveDocuments(), /Android/);
  const playback = harness(saved, new Set([uri('one'), uri('two')])); await playback.store.getState().load();
  await checkPlaybackRouting(playback, one);
  await checkExplicitDownload(playback, one);
  await checkRecovery(playback, one);
  await checkSettings();
  console.log('PASS: SAF document selection without copies, stable URI IDs, retained read grants, duplicate/cancel handling, persistence/restart, revocation/re-selection, write rollback, removal, direct playback routing and Android settings entry. Provider caching/audio need device verification.');
}
async function checkPlaybackRouting(h, song) {
  const google = load('src/stores/google-drive.ts', {
    'react-native': { Platform: { OS: 'android' } }, 'expo-secure-store': {},
    '@/services/google-drive/config': {}, '@/services/google-drive/api': {}, '@/services/google-drive/metadata': {},
    '@/services/google-drive/picker': {}, '@/services/google-drive/selection': {},
    '@/stores/playback': {}, '@/stores/drive-documents': { driveDocumentSource: h.source },
  });
  const cloud = load('src/services/cloud-music/source.ts', { '@/stores/google-drive': google });
  assert.deepEqual(await cloud.cloudStreamSource(song), { uri: song.drive.documentUri });
}
async function checkRecovery(h, song) {
  let current = [song];
  const saved = JSON.stringify({ version: 1, queue: [song], index: 0, position: 31, playing: true, shuffle: false, repeat: 'off', nasScope: null, driveAccountId: null, savedAt: Date.now() });
  const service = load('src/services/playback/persistence.ts', {
    'react-native': { Platform: { OS: 'android' } },
    '@/stores/auth': { useAuthStore: { getState: () => ({ mode: 'setup', session: null }) } },
    '@/stores/google-drive': { useGoogleDriveStore: { getState: () => ({ account: null, files: [], songs: [] }) } },
    '@/stores/drive-documents': { useDriveDocumentsStore: { getState: () => ({ songs: current }) } },
    '@/stores/hidden-music': { useHiddenMusicStore: { getState: () => ({ ready: true, scope: null, profile: { presets: [] } }) } },
    '@/stores/local-music': { useLocalMusicStore: { getState: () => ({ songs: [] }) } }, '@/stores/playback': {},
    '@/services/synology/api': {},
    '@/features/hidden-music/rules': { privacyScope: () => null, hiddenMatcher: () => () => false },
    'expo-sqlite/kv-store': { __esModule: true, default: { getItem: async () => saved } },
  });
  const restored = await service.readRestoredPlayback();
  assert.equal(restored.queue[0].id, song.id); assert.equal(restored.position, 0, 'SAF playback restores at zero without a Google API account');
  current = []; assert.equal(await service.readRestoredPlayback(), null, 'Removed or revoked documents cannot be restored');
  assert.deepEqual(await h.source(song), { uri: song.drive.documentUri });
}
async function checkExplicitDownload(h, song) {
  const copies = [], deleted = []; let stored = 0;
  const downloader = load('src/services/offline-music/download.ts', {
    'react-native': { Platform: { OS: 'android' } },
    'expo-file-system/legacy': { cacheDirectory: 'file:///cache/', copyAsync: async copy => { copies.push(copy); }, getInfoAsync: async () => ({ exists: true, isDirectory: false, size: 1234 }), deleteAsync: async value => { deleted.push(value); } },
    '@/services/cloud-music/source': { resolveCloudDownloadSource: h.source }, '@/services/music-source': load('src/services/music-source.ts'),
    './formats': load('src/services/offline-music/formats.ts'), '@/services/synology/api': {},
    '@/stores/auth': { useAuthStore: { getState: () => ({ mode: 'setup' }) } },
    '@/services/local-music/storage': { storeDownloadedSong: async (_, destination, extension) => { stored++; assert.equal(extension, 'mp3'); assert.equal(destination, copies[0].to); return { duplicate: false }; } },
  });
  await downloader.downloadSong(song, new AbortController().signal, () => {}, () => {});
  assert.equal(copies.length, 1); assert.equal(copies[0].from, song.drive.documentUri); assert.equal(stored, 1); assert.equal(deleted[0], copies[0].to);
}
async function checkSettings() {
  const jsx = (type, props) => ({ type, props }), h = harness(); let selected;
  const store = Object.assign(() => h.store.getState(), { getState: h.store.getState });
  const Settings = load('src/features/google-drive/document-settings.tsx', {
    react: { useState: value => [value, () => {}] }, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { View: 'View', Pressable: 'Button', FlatList: 'List', Platform: { OS: 'android' }, useWindowDimensions: () => ({ height: 800 }), StyleSheet: { create: value => value } },
    '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Icon' }, '@/components/text': { Text: 'Text' }, '@/features/playlists/dialogs': { PlaylistSheet: 'Sheet' },
    '@/stores/drive-documents': { useDriveDocumentsStore: store }, '@/stores/local-music': { useLocalMusicStore: { getState: () => ({ setSource: value => { selected = value; } }) } }, '@/theme/tokens': { useColors: () => ({}) },
  }).DriveDocumentSettings;
  const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
  const button = nodes(Settings({ blocked: false })).find(node => node.props?.accessibilityLabel === '파일 앱에서 Google Drive 음원 선택');
  assert(button && !button.props.disabled); await button.props.onPress();
  // onPress intentionally launches an async UI action without blocking React.
  for (let i = 0; i < 50 && !selected; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(selected, 'drive'); assert.equal(h.store.getState().songs.length, 2);
  assert(nodes(Settings({ blocked: true })).find(node => node.props?.accessibilityLabel === '파일 앱에서 Google Drive 음원 선택').props.disabled);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
