/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript'), { create } = require('zustand');
function load(file, mocks = {}, globals = {}) {
  mocks = { ...require('./test-cloud-fixtures.cjs').cloudFixtures(globals, mocks), ...mocks };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', ...Object.keys(globals), code)(name => {
    if (name in mocks) return mocks[name];
    if (name === 'zustand') return { create };
    throw new Error('Unexpected module: ' + name);
  }, exports, ...Object.values(globals));
  return exports;
}
const rules = load('src/features/playlists/rules.ts'), hiddenRules = load('src/features/hidden-music/rules.ts');
const settingsFormat = load('src/features/settings/backup-format.ts', {
  './menu-layout': load('src/features/settings/menu-layout.ts'),
  '@/features/hidden-music/rules': hiddenRules, '@/features/playlists/rules': rules,
  '@/services/local-music/folders': load('src/services/local-music/folders.ts'),
});
const format = load('src/features/playlists/backup-format.ts', { '@/features/settings/backup-format': settingsFormat, './rules': rules });
const operation = load('src/services/backup-operation.ts');
const values = new Map(), hidden = new Map(), db = new DatabaseSync(':memory:');
let authCalls = 0, cancelAuth = false, failWrite = false, failHidden = false, gate, release, writes = 0;
const storage = load('src/services/playlists/storage.ts', {
  '@/features/playlists/rules': rules,
  'expo-sqlite': { openDatabaseAsync: async () => ({
    execAsync: async sql => db.exec(sql),
    getFirstAsync: async (sql, ...args) => db.prepare(sql).get(...args),
    runAsync: async (sql, ...args) => {
      writes++;
      if (gate) await new Promise(resolve => { release = resolve; });
      if (failWrite) throw new Error('disk full');
      return db.prepare(sql).run(...args);
    },
  }) },
});
const playlistMocks = { '@/features/playlists/rules': rules, '@/services/playlists/storage': storage };
const playlists = load('src/stores/playlists.ts', playlistMocks).usePlaylistStore;
const privacy = load('src/stores/hidden-music.ts', {
  '@/features/hidden-music/rules': hiddenRules,
  '@/services/hidden-music/biometrics': { authenticateHiddenSettings: async () => { authCalls++; if (cancelAuth) throw new Error('인증 취소'); } },
  '@/services/hidden-music/storage': {
    readHiddenProfile: async scope => hidden.has(scope) ? hiddenRules.parseProfile(hidden.get(scope)) : hiddenRules.emptyProfile(),
    writeHiddenProfile: async (scope, profile) => { if (failHidden) throw new Error('hidden disk full'); hidden.set(scope, JSON.stringify(profile)); },
  },
}).useHiddenMusicStore;
const access = load('src/stores/hidden-feature-access.ts', {
  '@/components/text': { Text: 'Text' },
  '@/components/text': { Text: 'Text' },
  '@/components/text': { Text: 'Text' },
  'react-native': { Platform: { OS: 'android' } },
  'expo-secure-store': { getItemAsync: async key => values.get(key) ?? null, setItemAsync: async (key, value) => values.set(key, value) },
}).useHiddenFeatureAccess;
const service = load('src/services/playlists/backup.ts', {
  '@/stores/playlists': { usePlaylistStore: playlists }, '@/stores/hidden-music': { useHiddenMusicStore: privacy },
  '@/stores/hidden-feature-access': { useHiddenFeatureAccess: access }, '@/features/playlists/backup-format': format,
  '../backup-operation': operation, '@/features/playlists/rules': rules,
});
const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
const initial = { version: 1, presets: [
  { id: 'public', name: '산책', songIds: ['b', 'a', 'missing'] },
  { id: 'secret', name: '비밀', songIds: ['secret-song'] },
  { id: 'empty', name: '빈 목록', songIds: [] },
] };
async function switchAccount(scope) { await privacy.getState().load(scope); await playlists.getState().load(scope); }
async function main() {
  await access.getState().load(); await access.getState().restoreEnabled(false);
  await assert.rejects(service.createPlaylistBackup(), /먼저 불러/);
  hidden.set('demo', JSON.stringify({ ...hiddenRules.emptyProfile(), biometricLock: true, hiddenPlaylistIds: ['secret'], presets: [{ id: 'music', name: '숨긴 음악', enabled: true, songIds: ['hidden-song'], folders: [] }] }));
  await storage.writePlaylists('demo', initial); await switchAccount('demo');
  const backup = format.parsePlaylistBackup(await service.createPlaylistBackup());
  assert.deepEqual(backup.playlists.presets.map(preset => preset.id), ['public', 'empty']);
  assert.deepEqual(backup.playlists.presets[0].songIds, ['b', 'a', 'missing']);
  assert.deepEqual(backup.hiddenPlaylistIds, []); assert.equal(authCalls, 0, 'Normal export excludes hidden lists without unlocking');
  await assert.rejects(service.createPlaylistBackup(true), /기타 설정/);
  await access.getState().restoreEnabled(true);
  cancelAuth = true; await assert.rejects(service.createPlaylistBackup(true), /먼저 열어/); cancelAuth = false;
  assert.equal(privacy.getState().unlocked, false);
  const privateBackup = format.parsePlaylistBackup(await service.createPlaylistBackup(true));
  assert.equal(privateBackup.playlists.presets.length, 3); assert.deepEqual(privateBackup.hiddenPlaylistIds, ['secret']);
  assert.equal(privacy.getState().unlocked, false, 'Private export relocks after taking its snapshot');
  const clean = format.parsePlaylistBackup('\uFEFF' + JSON.stringify({ ...backup, password: 'DO_NOT_EXPORT', playlists: {
    ...backup.playlists, presets: backup.playlists.presets.map(preset => ({ ...preset, artworkUrl: 'SECRET_URL', token: 'SECRET_TOKEN' })),
  } }));
  const text = format.serializePlaylistBackup(clean);
  for (const secret of ['DO_NOT_EXPORT', 'SECRET_URL', 'SECRET_TOKEN']) assert.ok(!text.includes(secret));
  for (const change of [{ format: 'other' }, { version: 2 }, { exportedAt: 'bad' }, { scope: '' }, { playlists: { version: 1, presets: [initial.presets[0], initial.presets[0]] } }, { hiddenPlaylistIds: ['unknown'] }, { hiddenPlaylistIds: [42] }]) {
    assert.throws(() => format.parsePlaylistBackup(JSON.stringify({ ...backup, ...change })));
  }
  assert.throws(() => format.parsePlaylistBackup('bad'));
  assert.throws(() => format.parsePlaylistBackup('가'.repeat(settingsFormat.MAX_BACKUP_BYTES / 2)), /2MB/);
  const beforeInvalid = writes;
  await assert.rejects(service.restorePlaylistBackup({ ...backup, version: 2 }), /백업 버전/);
  await assert.rejects(service.restorePlaylistBackup({ ...backup, scope: 'another' }), /같은 보관함/);
  assert.equal(writes, beforeInvalid, 'Invalid/incompatible backups never write');
  await playlists.getState().removePreset('empty'); await playlists.getState().addSongs('public', ['new']);
  const extraId = await playlists.getState().createPreset('빈 목록', ['extra']);
  await access.getState().restoreEnabled(false);
  await service.restorePlaylistBackup(backup);
  let profile = playlists.getState().profile;
  assert.deepEqual(profile.presets.find(preset => preset.id === 'public').songIds, ['b', 'a', 'missing']);
  assert.equal(profile.presets.find(preset => preset.id === 'empty').name, '빈 목록 (복구 2)');
  assert.deepEqual(profile.presets.find(preset => preset.id === extraId).songIds, ['extra']);
  assert.deepEqual(profile.presets.find(preset => preset.id === 'secret'), initial.presets[1]);
  assert.deepEqual(privacy.getState().profile.hiddenPlaylistIds, ['secret']);
  await service.restorePlaylistBackup(backup);
  assert.equal(playlists.getState().profile.presets.length, 4, 'Repeated restore updates IDs instead of duplicating lists');
  const restarted = load('src/stores/playlists.ts', playlistMocks).usePlaylistStore;
  await restarted.getState().load('demo'); assert.deepEqual(restarted.getState().profile, playlists.getState().profile, 'Restored lists survive database/store restart');
  assert.deepEqual(rules.playlistSongs(backup.playlists.presets[0], [{ id: 'a' }, { id: 'b' }]).map(song => song.id), ['b', 'a'], 'Missing songs remain saved for future imports');
  const forgedVisible = { ...backup, playlists: { version: 1, presets: [{ id: 'secret', name: 'changed', songIds: [] }] } };
  await assert.rejects(service.restorePlaylistBackup(forgedVisible), /기타 설정/, 'A file cannot change a hidden list by omitting its hidden flag');
  await assert.rejects(service.restorePlaylistBackup(privateBackup), /기타 설정/);
  await access.getState().restoreEnabled(true);
  cancelAuth = true; const previous = playlists.getState().profile;
  await assert.rejects(service.restorePlaylistBackup(privateBackup), /먼저 열어/); cancelAuth = false;
  assert.equal(playlists.getState().profile, previous);
  // Simulate the same NAS account on a fresh device, while preserving other privacy settings.
  hidden.set('demo', JSON.stringify({ ...hiddenRules.emptyProfile(), biometricLock: true, presets: privacy.getState().profile.presets }));
  await privacy.getState().load('demo');
  failWrite = true; await assert.rejects(service.restorePlaylistBackup(privateBackup), /disk full/); failWrite = false;
  assert.deepEqual(privacy.getState().profile.hiddenPlaylistIds, [], 'A playlist write failure rolls back the preceding privacy write');
  assert.equal(playlists.getState().profile, previous);
  assert.deepEqual(await storage.readPlaylists('demo'), previous);
  failHidden = true; const beforePrivacyFailure = writes;
  await assert.rejects(service.restorePlaylistBackup(privateBackup), /hidden disk full/); failHidden = false;
  assert.equal(writes, beforePrivacyFailure, 'A privacy write failure cannot insert a visible private list');
  await service.restorePlaylistBackup(privateBackup);
  assert.deepEqual(privacy.getState().profile.hiddenPlaylistIds, ['secret']);
  assert.equal(privacy.getState().profile.biometricLock, true);
  assert.equal(privacy.getState().profile.presets[0].id, 'music', 'Playlist restore preserves music hiding settings');
  assert.equal(privacy.getState().unlocked, false);
  assert.ok(!rules.visiblePlaylists(playlists.getState().profile.presets, privacy.getState().profile.hiddenPlaylistIds).some(preset => preset.id === 'secret'));
  gate = true; const pending = service.restorePlaylistBackup(backup); await flush();
  await assert.rejects(service.createPlaylistBackup(), /작업이 진행 중/);
  await assert.rejects(operation.withBackupOperation(async () => {}), /작업이 진행 중/, 'Settings and playlist backup share an operation lock');
  const accountChange = switchAccount('another'); await flush(); release(); gate = false;
  await assert.rejects(pending, /계정이 변경/);
  await accountChange;
  assert.equal(playlists.getState().scope, 'another'); assert.deepEqual(playlists.getState().profile.presets, []);
  await switchAccount('demo');
  await checkFiles(text); await checkUI(backup, privateBackup); await checkDeviceBackups(backup);
  db.close();
  console.log('PASS: playlist backup/restore with SQLite persistence, saved/missing song order, empty lists, merge/name conflicts/idempotency, format/size/credential stripping, scope isolation, protected hidden export/restore/cancel/relock, hidden state preservation, write failure compensation, shared-operation/account-change guards, native/web files/cancel/cache cleanup, and preview/disabled/repeated UI actions. Native files/UI/authentication are mocked.');
}
async function checkDeviceBackups(nasBackup) {
  await switchAccount(null);
  const songs = ['drive:account:file', 'local:0123456789abcdef0123456789abcdef:1234', 'missing-local'];
  const id = await playlists.getState().createPreset('내 기기', songs);
  const backup = format.parsePlaylistBackup(await service.createPlaylistBackup());
  assert.equal(backup.scope, 'device'); assert.deepEqual(backup.hiddenPlaylistIds, []);
  assert.deepEqual(backup.playlists.presets[0].songIds, songs);
  await assert.rejects(service.createPlaylistBackup(true), /NAS 계정/);
  const rebooted = load('src/stores/playlists.ts', playlistMocks).usePlaylistStore;
  await rebooted.getState().load(null);
  assert.deepEqual(rebooted.getState().profile, backup.playlists, 'Device playlists survive restart without a NAS login');
  await playlists.getState().restoreProfile({ version: 1, presets: [] }, null);
  await service.restorePlaylistBackup(backup); await service.restorePlaylistBackup(backup);
  assert.deepEqual(playlists.getState().profile, backup.playlists, 'Device restore is ordered and idempotent');
  assert.deepEqual(rules.playlistSongs(backup.playlists.presets[0], [{ id: songs[1] }, { id: songs[0] }]).map(song => song.id), songs.slice(0, 2));
  const previous = playlists.getState().profile;
  failWrite = true; await assert.rejects(service.restorePlaylistBackup(backup), /disk full/); failWrite = false;
  assert.equal(playlists.getState().profile, previous);
  const beforeHiddenWrite = writes;
  await assert.rejects(service.restorePlaylistBackup({ ...backup, hiddenPlaylistIds: [id] }), /NAS 계정/);
  await assert.rejects(service.restorePlaylistBackup(nasBackup), /같은 보관함/);
  assert.equal(writes, beforeHiddenWrite, 'Hidden or NAS backups cannot write to an unauthenticated device profile');
  await switchAccount('demo');
  const nasProfile = playlists.getState().profile;
  await assert.rejects(service.restorePlaylistBackup(backup), /같은 보관함/);
  await switchAccount(null);
  assert.deepEqual(playlists.getState().profile, previous, 'NAS switching preserves the device profile');
  gate = true;
  const pending = service.restorePlaylistBackup(backup); await flush();
  const changed = switchAccount('demo'); await flush();
  const rejected = assert.rejects(pending, /계정이 변경/);
  release(); gate = false; await rejected; await changed;
  assert.deepEqual(playlists.getState().profile, nasProfile, 'An old device restore cannot overwrite NAS playlists');
  await switchAccount(null);
  assert.deepEqual(playlists.getState().profile, previous);
  console.log('PASS: NAS-free Drive/local device playlists, file backup/restore/restart, missing-song order, repeated restore, disk failure, account switching and private/NAS scope isolation.');
}
async function checkFiles(text) {
  const files = new Map(), deleted = [], platform = { OS: 'android' };
  let canceled = false, cancelDirectory = false, asset, fileWrites = 0;
  class File {
    constructor(uri) { this.uri = uri; }
    get size() { return Buffer.byteLength(files.get(this.uri) ?? '', 'utf8'); }
    async text() { return files.get(this.uri); }
    write(value) { fileWrites++; files.set(this.uri, value); }
    delete() { deleted.push(this.uri); files.delete(this.uri); }
  }
  const downloads = [];
  const shared = load('src/features/settings/backup-files.ts', {
    '@/components/text': { Text: 'Text' },
  '@/components/text': { Text: 'Text' },
  '@/components/text': { Text: 'Text' },
  'react-native': { Platform: platform }, './backup-format': settingsFormat,
    'expo-file-system': { File, Paths: { cache: { uri: 'file:///cache/' } }, Directory: { pickDirectoryAsync: async () => {
      if (cancelDirectory) throw Object.assign(new Error('cancel'), { code: 'ERR_FILE_PICKING_CANCELLED' });
      return { createFile: name => new File('content://chosen/' + name) };
    } } },
    'expo-document-picker': { getDocumentAsync: async options => { assert.equal(options.copyToCacheDirectory, true); return canceled ? { canceled: true } : { canceled: false, assets: [asset] }; } },
  }, { document: { body: { appendChild: () => {} }, createElement: () => ({ click() { downloads.push(this.download); }, remove: () => {} }) },
    URL: { createObjectURL: () => 'blob:backup', revokeObjectURL: () => {} }, setTimeout: callback => callback(),
  });
  const api = load('src/features/playlists/backup-files.ts', { '@/features/settings/backup-files': shared, './backup-format': format });
  const name = await api.savePlaylistBackup(text);
  assert.match(name, /^yeongdu-music-playlists-.*\.json$/); assert.equal(files.get('content://chosen/' + name), text);
  cancelDirectory = true; assert.equal(await api.savePlaylistBackup(text), null); cancelDirectory = false;
  assert.equal(fileWrites, 1);
  canceled = true; assert.equal(await api.pickPlaylistBackup(), null); canceled = false;
  asset = { name: 'backup.json', uri: 'file:///cache/backup.json' }; files.set(asset.uri, text);
  assert.deepEqual((await api.pickPlaylistBackup()).backup, format.parsePlaylistBackup(text));
  assert.ok(deleted.includes(asset.uri));
  asset = { name: 'bad.json', uri: 'file:///cache/bad.json' }; files.set(asset.uri, 'bad');
  await assert.rejects(api.pickPlaylistBackup()); assert.ok(deleted.includes(asset.uri));
  asset = { name: 'original.json', uri: 'content://original', size: settingsFormat.MAX_BACKUP_BYTES + 1 };
  await assert.rejects(api.pickPlaylistBackup(), /2MB/); assert.ok(!deleted.includes(asset.uri));
  platform.OS = 'web'; asset = { name: 'web.json', file: { text: async () => text } };
  assert.equal((await api.pickPlaylistBackup()).name, 'web.json');
  assert.equal(await api.savePlaylistBackup(text), downloads[0]);
  assert.equal(fileWrites, 1, 'Web exports use downloads, not native file writes');
}
async function checkUI(backup, privateBackup) {
  const jsx = (type, props) => ({ type, props }), states = [], refs = [];
  let stateIndex = 0, refIndex = 0, nextFile, readFailure = false, restoreCount = 0, exportCount = 0;
  const screen = load('src/features/playlists/backup-settings.tsx', {
    react: { useEffect: () => {}, useRef: value => refs[refIndex++] ??= { current: value }, useState: initial => {
      const index = stateIndex++; if (!(index in states)) states[index] = initial;
      return [states[index], value => { states[index] = value; }];
    } }, 'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/components/text': { Text: 'Text' },
  '@/components/text': { Text: 'Text' },
  '@/components/text': { Text: 'Text' },
  'react-native': { Platform: { OS: 'android' }, Text: 'Text', View: 'View', Pressable: 'Pressable', ActivityIndicator: 'Spinner', StyleSheet: { create: styles => styles } },
    '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Icon' }, '@/components/animated-switch': { AnimatedSwitch: 'Switch' },
    '@/stores/playlists': { usePlaylistStore: () => playlists.getState() }, '@/stores/hidden-music': { useHiddenMusicStore: () => privacy.getState() },
    '@/stores/hidden-feature-access': { useHiddenFeatureAccess: () => access.getState() }, '@/theme/tokens': { useColors: () => ({ tint: '#f48', text: '#111', muted: '#888', separator: '#ddd' }) },
    '@/services/playlists/backup': { createPlaylistBackup: async () => { exportCount++; return 'backup'; }, restorePlaylistBackup: async () => { restoreCount++; return 2; } },
    './rules': rules,
    './backup-files': { savePlaylistBackup: async () => 'backup.json', pickPlaylistBackup: async () => { if (readFailure) throw Error('bad file'); return nextFile; } },
    '@/features/settings/settings-menu-layout': { settingsMenuStyles: { row: {}, icon: {} } }, '@/features/settings/settings-ui': { SettingsPage: 'Page', SettingsSection: 'Section' },
  }).PlaylistBackupSettings;
  function render() { stateIndex = 0; refIndex = 0; return screen(); }
  function nodes(node) { if (Array.isArray(node)) return node.flatMap(nodes); return node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : []; }
  const button = title => nodes(render()).find(node => node.type === 'Pressable' && nodes(node).some(child => child.type === 'Text' && child.props.children === title));
  await access.getState().restoreEnabled(false);
  assert.equal(nodes(render()).filter(node => node.type === 'Switch').length, 0);
  const save = button('플레이리스트 백업하기'); save.props.onPress(); save.props.onPress(); await flush(); assert.equal(exportCount, 1);
  nextFile = { name: 'backup.json', backup }; button('플레이리스트 백업 파일 선택').props.onPress(); await flush();
  assert.equal(restoreCount, 0, 'Picking a file only previews, never writes');
  const restore = button('플레이리스트 복구하기'); restore.props.onPress(); restore.props.onPress(); await flush(); assert.equal(restoreCount, 1);
  assert.equal(button('플레이리스트 복구하기'), undefined);
  nextFile = { name: 'private.json', backup: privateBackup }; button('플레이리스트 백업 파일 선택').props.onPress(); await flush();
  assert.equal(button('플레이리스트 복구하기').props.disabled, true, 'Private restore is disabled while Other is concealed');
  assert.equal(button('플레이리스트 복구하기').props.children.props.style[1].color, '#888');
  button('플레이리스트 복구하기').props.onPress(); await flush(); assert.equal(restoreCount, 1);
  nextFile = { name: 'wrong.json', backup: { ...backup, scope: 'another' } }; button('플레이리스트 백업 파일 선택').props.onPress(); await flush();
  assert.equal(button('플레이리스트 복구하기').props.disabled, true);
  readFailure = true; button('플레이리스트 백업 파일 선택').props.onPress(); await flush();
  assert.equal(button('플레이리스트 복구하기'), undefined); assert.ok(nodes(render()).some(node => node.props?.accessibilityRole === 'alert'));
  readFailure = false; nextFile = null; button('플레이리스트 백업 파일 선택').props.onPress(); await flush(); assert.equal(button('플레이리스트 복구하기'), undefined);
  await switchAccount(null);
  assert.equal(button('플레이리스트 백업하기').props.disabled, false, 'Local/Drive mode does not require NAS login');
  button('플레이리스트 백업하기').props.onPress(); await flush(); assert.equal(exportCount, 2);
  await access.getState().restoreEnabled(true);
  assert.equal(nodes(render()).filter(node => node.type === 'Switch').length, 0, 'Device mode does not offer unsupported NAS hidden backups');
  nextFile = { name: 'device.json', backup: { ...backup, scope: 'device', hiddenPlaylistIds: [] } };
  button('플레이리스트 백업 파일 선택').props.onPress(); await flush();
  assert.equal(button('플레이리스트 복구하기').props.disabled, false);
  button('플레이리스트 복구하기').props.onPress(); await flush(); assert.equal(restoreCount, 2);
  playlists.setState({ ready: false, error: 'device read failed' });
  assert.equal(button('플레이리스트 백업하기').props.disabled, true);
  assert.ok(button('플레이리스트 다시 불러오기'), 'Device storage failures offer retry without an account');
  await switchAccount('demo');
}
const watchdog = setTimeout(() => { console.error('Playlist backup checks did not finish'); process.exitCode = 1; }, 5000);
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(watchdog));
