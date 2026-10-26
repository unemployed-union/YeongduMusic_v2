/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { create } = require('zustand');
function load(file, mocks = {}, globals = {}) {
  mocks = { ...require('./test-cloud-fixtures.cjs').cloudFixtures(globals, mocks), ...mocks };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'exports', ...Object.keys(globals), code)(name => {
    if (name in mocks) return mocks[name];
    if (name === 'zustand') return { create };
    throw new Error('Unexpected module: ' + name);
  }, exports, ...Object.values(globals));
  return exports;
}
const folders = load('src/services/local-music/folders.ts');
const hiddenRules = load('src/features/hidden-music/rules.ts');
const playlistRules = load('src/features/playlists/rules.ts');
const menuRules = load('src/features/settings/menu-layout.ts');
const hapticRules = load('src/features/haptics/preferences.ts');
const favoriteDisplayRules = load('src/features/favorites/display-preferences.ts');
const blurRules = load('src/features/settings/blur-preferences.ts');
const appearanceRules = load('src/theme/appearance.ts');
const format = load('src/features/settings/backup-format.ts', {
  '@/features/haptics/preferences': hapticRules,
  './menu-layout': menuRules,
  '@/features/hidden-music/rules': hiddenRules, '@/features/playlists/rules': playlistRules, '@/services/local-music/folders': folders,
});
const saved = new Map(), hiddenProfiles = new Map(), playlistProfiles = new Map();
let failKey = '', failures = 0, storageWrites = 0, authCalls = 0, failAuth = false, held, release;
const storage = {
  getItemAsync: async key => saved.get(key) ?? null,
  setItemAsync: async (key, value) => {
    storageWrites++;
    if (held === key) await new Promise(resolve => { release = resolve; });
    if (failKey === key && failures-- > 0) throw new Error('disk full');
    saved.set(key, value);
  },
};
const common = { '@/components/text': { Text: 'Text' },
  '@/components/text': { Text: 'Text' },
  '@/components/text': { Text: 'Text' },
  'react-native': { Platform: { OS: 'android' } }, 'expo-secure-store': storage };
const display = load('src/stores/display-preferences.ts', common).useDisplayPreferences;
const library = load('src/stores/library-preferences.ts', common).useLibraryPreferences;
const menus = load('src/stores/menu-preferences.ts', { ...common, '@/features/settings/menu-layout': menuRules }).useMenuPreferences;
const streaming = load('src/stores/streaming-preferences.ts', common).useStreamingPreferences;
const exclusions = load('src/stores/folder-exclusions.ts', { ...common, '@/services/local-music/folders': folders }).useFolderExclusionStore;
const access = load('src/stores/hidden-feature-access.ts', common).useHiddenFeatureAccess;
const themeMocks = { ...common, 'react-native': { Platform: { OS: 'android' }, Appearance: { setColorScheme() {} } },
  'expo-sqlite/kv-store': { __esModule: true, default: { getItem: storage.getItemAsync, setItem: storage.setItemAsync } } };
const theme = load('src/stores/theme-preferences.ts', themeMocks).useThemePreferences;
const details = load('src/stores/library-detail-preferences.ts', themeMocks).useLibraryDetailPreferences;
const haptics = load('src/stores/haptic-preferences.ts', { ...themeMocks, '@/features/haptics/preferences': hapticRules }).useHapticPreferences;
const favoriteDisplay = load('src/stores/favorite-display-preferences.ts', themeMocks).useFavoriteDisplayPreferences;
const blur = load('src/stores/blur-preferences.ts', themeMocks).useBlurPreferences;
const appearance = load('src/stores/appearance-preferences.ts', themeMocks).useAppearancePreferences;
const hiddenMocks = {
  '@/features/hidden-music/rules': hiddenRules,
  '@/services/hidden-music/biometrics': { authenticateHiddenSettings: async () => { authCalls++; if (failAuth) throw new Error('인증 취소'); } },
  '@/services/hidden-music/storage': {
    readHiddenProfile: async scope => hiddenProfiles.has(scope) ? hiddenRules.parseProfile(hiddenProfiles.get(scope)) : hiddenRules.emptyProfile(),
    writeHiddenProfile: async (scope, profile) => hiddenProfiles.set(scope, JSON.stringify(profile)),
  },
};
const privacy = load('src/stores/hidden-music.ts', hiddenMocks).useHiddenMusicStore;
const playlistMocks = {
  '@/features/playlists/rules': playlistRules,
  '@/services/playlists/storage': {
    readPlaylists: async scope => playlistProfiles.has(scope) ? playlistRules.parsePlaylists(playlistProfiles.get(scope)) : playlistRules.emptyPlaylists(),
    writePlaylists: async (scope, profile) => playlistProfiles.set(scope, JSON.stringify(profile)),
  },
};
const playlists = load('src/stores/playlists.ts', playlistMocks).usePlaylistStore;
const service = load('src/services/settings-backup.ts', {
  '@/stores/appearance-preferences': { useAppearancePreferences: appearance },
  '@/stores/blur-preferences': { useBlurPreferences: blur },
  '@/stores/favorite-display-preferences': { useFavoriteDisplayPreferences: favoriteDisplay },
  '@/stores/haptic-preferences': { useHapticPreferences: haptics },
  '@/stores/theme-preferences': { useThemePreferences: theme },
  '@/stores/library-detail-preferences': { useLibraryDetailPreferences: details },
  '@/stores/menu-preferences': { useMenuPreferences: menus },
  '@/stores/display-preferences': { useDisplayPreferences: display }, '@/stores/library-preferences': { useLibraryPreferences: library },
  '@/stores/streaming-preferences': { useStreamingPreferences: streaming }, '@/stores/folder-exclusions': { useFolderExclusionStore: exclusions },
  '@/stores/hidden-feature-access': { useHiddenFeatureAccess: access }, '@/stores/hidden-music': { useHiddenMusicStore: privacy },
  '@/stores/playlists': { usePlaylistStore: playlists }, '@/features/settings/backup-format': format,
  './backup-operation': load('src/services/backup-operation.ts'),
});
const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
const general = {
  format: 'yeongdu-music-settings', version: 1, exportedAt: '2026-10-13T00:00:00Z',
  preferences: { hideArtwork: true, includeFolderAlbums: false, quality: 'mp3', excludedFolders: ['/storage/emulated/0/Music/제외'] },
};
async function main() {
  const clean = format.parseSettingsBackup('\uFEFF' + JSON.stringify({ ...general, token: 'DO_NOT_EXPORT', preferences: { ...general.preferences, password: 'secret' } }));
  assert.equal(clean.preferences.excludedFolders[0], '/storage/primary/Music/제외');
  assert.ok(!format.serializeSettingsBackup(clean).includes('DO_NOT_EXPORT'));
  assert.ok(!format.serializeSettingsBackup(clean).includes('password'));
  assert.throws(() => format.parseSettingsBackup('garbage'));
  for (const change of [{ format: 'other' }, { version: 999 }, { exportedAt: 'invalid' }, { preferences: { ...general.preferences, hideArtwork: 'true' } },
    { preferences: { ...general.preferences, quality: 'lossless' } }, { preferences: { ...general.preferences, excludedFolders: [null] } },
    { preferences: { ...general.preferences, excludedFolders: Array(201).fill('/Music') } }, { preferences: { ...general.preferences, themeMode: 'blue' } }]) {
    assert.throws(() => format.parseSettingsBackup(JSON.stringify({ ...general, ...change })));
  }
  assert.throws(() => format.checkBackupSize('가'.repeat(format.MAX_BACKUP_BYTES / 2)), /2MB/, 'Size limit counts UTF-8 bytes');
  await privacy.getState().load('demo'); await playlists.getState().load('demo');
  const before = JSON.parse(await service.createSettingsBackup());
  assert.equal(before.account, undefined, 'Default backups exclude private/account data');
  const initialWrites = storageWrites;
  await assert.rejects(service.restoreSettingsBackup({ ...general, version: 2 }, false), /백업 버전/);
  assert.equal(storageWrites, initialWrites, 'Invalid input causes no writes');
  await service.restoreSettingsBackup(clean, false);
  assert.equal(display.getState().hideArtwork, true); assert.equal(library.getState().includeFolderAlbums, false);
  assert.equal(streaming.getState().quality, 'mp3'); assert.deepEqual(exclusions.getState().folders, ['/storage/primary/Music/제외']);
  const restored = JSON.parse(await service.createSettingsBackup());
  assert.deepEqual(restored.preferences, { ...clean.preferences, menus: menus.getState().layout, themeMode: 'auto', libraryDetails: { artistPhotos: true, albumColors: true }, haptics: hapticRules.DEFAULT_HAPTIC_PREFERENCES, favoriteDisplay: favoriteDisplayRules.DEFAULT_FAVORITE_DISPLAY, blurEnabled: true, blur: blurRules.DEFAULT_BLUR_PREFERENCES, appearance: appearanceRules.DEFAULT_APPEARANCE }, 'Round trip includes all general settings');
  const customColors = { ...appearanceRules.DEFAULT_APPEARANCE, accent: '#123456', miniBackground: '#F29B4B' };
  const colorBackup = { ...clean, preferences: { ...clean.preferences, appearance: customColors } };
  await service.restoreSettingsBackup(colorBackup, false);
  assert.deepEqual(JSON.parse(await service.createSettingsBackup()).preferences.appearance, customColors);
  await service.restoreSettingsBackup(clean, false); assert.deepEqual(appearance.getState().preferences, customColors, 'Older backups preserve color choices');
  failKey = 'yeongdumusic-appearance-v1'; failures = 1;
  await assert.rejects(service.restoreSettingsBackup({ ...clean, preferences: { ...clean.preferences, appearance: appearanceRules.DEFAULT_APPEARANCE } }, false), /기존 설정으로 되돌렸습니다/);
  assert.deepEqual(appearance.getState().preferences, customColors); failKey = ''; failures = 0;
  assert.throws(() => format.parseSettingsBackup(JSON.stringify({ ...colorBackup, preferences: { ...colorBackup.preferences, appearance: { ...customColors, accent: 'red' } } })));
  await appearance.getState().restore(appearanceRules.DEFAULT_APPEARANCE);
  const blurBackup = { ...clean, preferences: { ...clean.preferences, blurEnabled: false } };
  await service.restoreSettingsBackup(blurBackup, false); assert.equal(blur.getState().enabled, false);
  assert.equal(JSON.parse(await service.createSettingsBackup()).preferences.blurEnabled, false);
  await service.restoreSettingsBackup(clean, false); assert.equal(blur.getState().enabled, false, 'Older backups retain the blur choice');
  failKey = 'yeongdumusic-blur-enabled-v1'; failures = 1;
  await assert.rejects(service.restoreSettingsBackup({ ...blurBackup, preferences: { ...blurBackup.preferences, blurEnabled: true } }, false), /기존 설정으로 되돌렸습니다/);
  assert.equal(blur.getState().enabled, false); failKey = ''; failures = 0;
  assert.throws(() => format.parseSettingsBackup(JSON.stringify({ ...clean, preferences: { ...clean.preferences, blurEnabled: 'false' } })));
  await blur.getState().setEnabled(true);
  const customBlur = blurRules.parseBlurPreferences(false); customBlur.areas.libraryMenu.enabled = false; customBlur.areas.miniPlayer.intensity = 83;
  const detailedBlurBackup = { ...clean, preferences: { ...clean.preferences, blur: customBlur } };
  await service.restoreSettingsBackup(detailedBlurBackup, false);
  assert.deepEqual(JSON.parse(await service.createSettingsBackup()).preferences.blur, customBlur);
  await service.restoreSettingsBackup({ ...clean, preferences: { ...clean.preferences, blurEnabled: true } }, false);
  assert.deepEqual(blur.getState().areas, customBlur.areas, 'Legacy master-only backups preserve area choices and strengths');
  assert.throws(() => format.parseSettingsBackup(JSON.stringify({ ...detailedBlurBackup, preferences: { ...detailedBlurBackup.preferences, blurEnabled: true } })), /일치/);
  failKey = 'yeongdumusic-blur-enabled-v1'; failures = 1;
  await assert.rejects(service.restoreSettingsBackup({ ...clean, preferences: { ...clean.preferences, blur: blurRules.DEFAULT_BLUR_PREFERENCES } }, false), /기존 설정으로 되돌렸습니다/);
  assert.deepEqual(blur.getState().areas, customBlur.areas); failKey = ''; failures = 0;
  await blur.getState().restore(blurRules.DEFAULT_BLUR_PREFERENCES);
  const favoritePreferences = { enabled: false, songs: true, player: false, album: true };
  const favoriteBackup = { ...clean, preferences: { ...clean.preferences, favoriteDisplay: favoritePreferences } };
  await service.restoreSettingsBackup(favoriteBackup, false);
  assert.deepEqual(JSON.parse(await service.createSettingsBackup()).preferences.favoriteDisplay, favoritePreferences);
  await service.restoreSettingsBackup(clean, false); assert.deepEqual(favoriteDisplay.getState().preferences, favoritePreferences, 'Older backups retain favorite display choices');
  failKey = 'yeongdumusic-favorite-display-v1'; failures = 1;
  await assert.rejects(service.restoreSettingsBackup({ ...favoriteBackup, preferences: { ...favoriteBackup.preferences, favoriteDisplay: favoriteDisplayRules.DEFAULT_FAVORITE_DISPLAY } }, false), /기존 설정으로 되돌렸습니다/);
  assert.deepEqual(favoriteDisplay.getState().preferences, favoritePreferences); failKey = ''; failures = 0;
  assert.throws(() => format.parseSettingsBackup(JSON.stringify({ ...favoriteBackup, preferences: { ...favoriteBackup.preferences, favoriteDisplay: { ...favoritePreferences, songs: 'true' } } })));
  await favoriteDisplay.getState().restore(restored.preferences.favoriteDisplay);
  const hapticPreferences = hapticRules.parseHapticPreferences(hapticRules.DEFAULT_HAPTIC_PREFERENCES);
  hapticPreferences.events.longPress.strength = 'heavy'; hapticPreferences.events.seek.enabled = false;
  const hapticBackup = { ...clean, preferences: { ...clean.preferences, haptics: hapticPreferences } };
  await service.restoreSettingsBackup(hapticBackup, false); assert.deepEqual(haptics.getState().preferences, hapticPreferences);
  await service.restoreSettingsBackup(clean, false); assert.deepEqual(haptics.getState().preferences, hapticPreferences, 'Older backups preserve current haptics');
  const restartedHaptics = load('src/stores/haptic-preferences.ts', { ...themeMocks, '@/features/haptics/preferences': hapticRules }).useHapticPreferences;
  await restartedHaptics.getState().load(); assert.deepEqual(restartedHaptics.getState().preferences, hapticPreferences);
  failKey = 'yeongdumusic-haptics-v1'; failures = 1;
  await assert.rejects(service.restoreSettingsBackup({ ...hapticBackup, preferences: { ...hapticBackup.preferences, haptics: hapticRules.DEFAULT_HAPTIC_PREFERENCES } }, false), /기존 설정으로 되돌렸습니다/);
  assert.deepEqual(haptics.getState().preferences, hapticPreferences); failKey = ''; failures = 0;
  await haptics.getState().restore(restored.preferences.haptics);
  const detailBackup = { ...clean, preferences: { ...clean.preferences, libraryDetails: { artistPhotos: false, albumColors: false } } };
  await service.restoreSettingsBackup(detailBackup, false);
  assert.deepEqual(details.getState().preferences, detailBackup.preferences.libraryDetails);
  const restartedDetails = load('src/stores/library-detail-preferences.ts', themeMocks).useLibraryDetailPreferences;
  await restartedDetails.getState().load(); assert.deepEqual(restartedDetails.getState().preferences, detailBackup.preferences.libraryDetails);
  await service.restoreSettingsBackup(clean, false); assert.equal(details.getState().preferences.artistPhotos, false, 'Older backups preserve photo and color settings');
  failKey = 'yeongdumusic-library-details-v1'; failures = 1;
  await assert.rejects(service.restoreSettingsBackup({ ...detailBackup, preferences: { ...detailBackup.preferences, libraryDetails: { artistPhotos: true, albumColors: true } } }, false), /기존 설정으로 되돌렸습니다/);
  assert.deepEqual(details.getState().preferences, detailBackup.preferences.libraryDetails); failKey = ''; failures = 0;
  await details.getState().restore(restored.preferences.libraryDetails);
  const themeBackup = { ...clean, preferences: { ...clean.preferences, themeMode: 'dark' } };
  await service.restoreSettingsBackup(themeBackup, false); assert.equal(theme.getState().mode, 'dark');
  assert.equal(JSON.parse(await service.createSettingsBackup()).preferences.themeMode, 'dark');
  const restartedTheme = load('src/stores/theme-preferences.ts', themeMocks).useThemePreferences;
  await restartedTheme.getState().load(); assert.equal(restartedTheme.getState().mode, 'dark', 'Restored theme persists across restarts');
  await service.restoreSettingsBackup(clean, false); assert.equal(theme.getState().mode, 'dark', 'Older backups leave the current theme selection unchanged');
  await theme.getState().setMode('auto'); failKey = 'yeongdumusic-theme-mode-v1'; failures = 1;
  await assert.rejects(service.restoreSettingsBackup(themeBackup, false), /기존 설정으로 되돌렸습니다/);
  assert.equal(theme.getState().mode, 'auto'); failKey = ''; failures = 0;
  const customMenus = menuRules.defaultMenuLayout();
  customMenus.bottom.reverse(); customMenus.bottom[1].visible = false;
  customMenus.library.reverse(); customMenus.library[1].visible = false;
  customMenus.player.reverse(); customMenus.player[1].visible = false;
  const menuBackup = { ...clean, preferences: { ...clean.preferences, menus: customMenus } };
  await service.restoreSettingsBackup(menuBackup, false);
  assert.deepEqual(JSON.parse(await service.createSettingsBackup()).preferences.menus, customMenus);
  await service.restoreSettingsBackup(clean, false);
  assert.deepEqual(menus.getState().layout, customMenus, 'Older backups preserve menu settings');
  const invalidMenus = menuRules.defaultMenuLayout(); invalidMenus.bottom.forEach(item => { item.visible = false; });
  const writesBeforeInvalidMenus = storageWrites;
  await assert.rejects(service.restoreSettingsBackup({ ...menuBackup, preferences: { ...menuBackup.preferences, menus: invalidMenus } }, false), /최소 하나/);
  assert.equal(storageWrites, writesBeforeInvalidMenus, 'All-hidden backups are rejected before any writes');
  await menus.getState().restore(restored.preferences.menus);
  const reloadedDisplay = load('src/stores/display-preferences.ts', common).useDisplayPreferences;
  await reloadedDisplay.getState().load(); assert.equal(reloadedDisplay.getState().hideArtwork, true, 'Restore survives restart');
  failKey = 'yeongdumusic-streaming-quality-v1'; failures = 1;
  await assert.rejects(service.restoreSettingsBackup(before, false), /기존 설정으로 되돌렸습니다/);
  assert.deepEqual(JSON.parse(await service.createSettingsBackup()).preferences, restored.preferences, 'A failed write rolls back previously applied settings');
  failKey = 'yeongdumusic-folder-albums-v1'; failures = 2;
  await assert.rejects(service.restoreSettingsBackup(before, false), /일부 설정을 원래대로 되돌리지 못했습니다/);
  failKey = ''; failures = 0;
  await service.restoreSettingsBackup(clean, false);
  held = 'yeongdumusic-hide-artwork-v1';
  const first = service.restoreSettingsBackup(before, false); await flush();
  await assert.rejects(service.createSettingsBackup(), /진행 중/);
  await assert.rejects(service.restoreSettingsBackup(clean, false), /진행 중/);
  held = ''; release(); await first;

  await access.getState().restoreEnabled(true);
  await privacy.getState().savePreset({ id: 'private', name: 'private', enabled: true, songIds: ['secret'], folders: ['/music/private'] });
  await privacy.getState().setQuickHidePreset('private');
  await privacy.getState().setQuickHidePlaylist('list', true);
  await privacy.getState().setPlaylistHidden('list', true);
  await privacy.getState().setBiometricLock(true);
  await playlists.getState().createPreset('Saved list', ['secret']);
  await access.getState().setQuickHideMode('preset'); privacy.getState().lock();
  const authBefore = authCalls;
  const privateBackup = format.parseSettingsBackup(await service.createSettingsBackup(true));
  assert.equal(authCalls, authBefore + 1, 'Export of a locked profile requires authentication');
  assert.equal(privacy.getState().unlocked, false, 'Export relocks after taking its snapshot');
  assert.equal(privateBackup.account.hidden.quickHidePresetId, 'private');
  assert.deepEqual(privateBackup.account.hidden.quickHidePlaylistIds, ['list']);
  assert.equal(privateBackup.account.access.quickHideMode, 'preset');
  failAuth = true;
  await assert.rejects(service.createSettingsBackup(true), /인증 취소|먼저 열어/);
  await assert.rejects(service.restoreSettingsBackup(privateBackup, true), /인증 취소|먼저 열어/);
  failAuth = false;
  await service.restoreSettingsBackup(privateBackup, true);
  assert.equal(privacy.getState().unlocked, false);
  await privacy.getState().unlock(); await privacy.getState().removePreset('private');
  await playlists.getState().createPreset('Temporary list', ['public']);
  privacy.getState().lock();
  await service.restoreSettingsBackup(privateBackup, false);
  assert.equal(privacy.getState().profile.presets.length, 0, 'General-only restore preserves current hidden selections');
  assert.equal(playlists.getState().profile.presets.length, 2);
  await service.restoreSettingsBackup(privateBackup, true);
  assert.equal(privacy.getState().profile.presets.length, 1); assert.equal(playlists.getState().profile.presets.length, 1);
  assert.equal(access.getState().quickHideMode, 'preset'); assert.equal(access.getState().quickHideEnabled, true);
  assert.deepEqual(privacy.getState().profile.hiddenPlaylistIds, ['list']);
  assert.deepEqual(privacy.getState().profile.quickHidePlaylistIds, ['list'], 'Quick-hide playlist selections survive authenticated backup and restore');
  const restartPrivacy = load('src/stores/hidden-music.ts', hiddenMocks).useHiddenMusicStore;
  await restartPrivacy.getState().load('demo'); assert.deepEqual(restartPrivacy.getState().profile, privateBackup.account.hidden);
  await privacy.getState().load('different'); await playlists.getState().load('different');
  const writesBeforeMismatch = storageWrites;
  await assert.rejects(service.restoreSettingsBackup(privateBackup, true), /현재 로그인한 NAS 계정/);
  assert.equal(storageWrites, writesBeforeMismatch, 'Account mismatch is rejected before general writes');
  assert.equal(privacy.getState().profile.presets.length, 0);
  // A new device must verify that it can authenticate before enabling a restored lock.
  await privacy.getState().load('demo'); await playlists.getState().load('demo'); await privacy.getState().unlock(); await privacy.getState().setBiometricLock(false);
  const previousProfile = JSON.stringify(privacy.getState().profile); failAuth = true;
  await assert.rejects(service.restoreSettingsBackup(privateBackup, true), /인증 취소/);
  assert.equal(JSON.stringify(privacy.getState().profile), previousProfile);
  failAuth = false;
  await service.restoreSettingsBackup(privateBackup, true);
  assert.equal(privacy.getState().profile.biometricLock, true);
  assert.equal(privacy.getState().unlocked, false);

  await checkFiles();
  await checkUI(privateBackup);
  console.log('PASS: settings backup/restore/restart, strict format/version/UTF-8 size, unknown field stripping, default privacy exclusion, authenticated account presets and lock restore, account mismatch, general-only preservation, duplicate actions, rollback/rollback failure, native/web file pick/write/cancel/cache cleanup, preview-before-restore and privacy toggles. Native storage, files, UI and authentication are mocked.');
}
async function checkFiles() {
  const files = new Map(), deleted = [];
  let canceled = false, pickerFailure = false, failFileWrite = false, pickerAsset;
  class File {
    constructor(uri) { this.uri = uri; }
    get size() { return (files.get(this.uri) ?? '').length; }
    async text() { return files.get(this.uri); }
    write(text) { if (failFileWrite) throw new Error('no space'); files.set(this.uri, text); }
    delete() { deleted.push(this.uri); files.delete(this.uri); }
  }
  const api = load('src/features/settings/backup-files.ts', {
    '@/components/text': { Text: 'Text' },
  '@/components/text': { Text: 'Text' },
  '@/components/text': { Text: 'Text' },
  'react-native': { Platform: { OS: 'android' } },
    'expo-file-system': { File, Paths: { cache: { uri: 'file:///cache/' } }, Directory: {
      pickDirectoryAsync: async () => { if (pickerFailure) throw Object.assign(new Error('cancelled'), { code: 'ERR_FILE_PICKING_CANCELLED' }); return { createFile: name => new File('content://chosen/' + name) }; },
    } },
    'expo-document-picker': { getDocumentAsync: async () => canceled ? { canceled: true } : { canceled: false, assets: [pickerAsset] } },
    './backup-format': format,
  });
  const text = format.serializeSettingsBackup(general);
  const name = await api.saveSettingsBackup(text);
  assert.ok(name.endsWith('.json')); assert.equal(files.get('content://chosen/' + name), text);
  pickerFailure = true; assert.equal(await api.saveSettingsBackup(text), null); pickerFailure = false;
  failFileWrite = true; await assert.rejects(api.saveSettingsBackup(text), /백업을 저장하지/); failFileWrite = false;
  assert.ok(deleted.some(uri => uri.startsWith('content://chosen/')));
  canceled = true; assert.equal(await api.pickSettingsBackup(), null); canceled = false;
  pickerAsset = { name: 'backup.json', uri: 'file:///cache/import.json', size: text.length };
  files.set(pickerAsset.uri, text);
  assert.deepEqual((await api.pickSettingsBackup()).backup.preferences, format.parseSettingsBackup(text).preferences);
  assert.ok(deleted.includes(pickerAsset.uri));
  pickerAsset = { name: 'bad.json', uri: 'file:///cache/bad.json' }; files.set(pickerAsset.uri, 'bad');
  await assert.rejects(api.pickSettingsBackup()); assert.ok(deleted.includes(pickerAsset.uri));
  pickerAsset = { name: 'original.json', uri: 'content://original', size: format.MAX_BACKUP_BYTES + 1 };
  await assert.rejects(api.pickSettingsBackup(), /2MB/); assert.ok(!deleted.includes(pickerAsset.uri));
  const downloads = [], revoked = [];
  const web = load('src/features/settings/backup-files.ts', {
    '@/components/text': { Text: 'Text' },
  '@/components/text': { Text: 'Text' },
  '@/components/text': { Text: 'Text' },
  'react-native': { Platform: { OS: 'web' } },
    'expo-file-system': { File: class { constructor() { throw new Error('Native filesystem on web'); } } },
    'expo-document-picker': { getDocumentAsync: async () => ({ canceled: false, assets: [{ name: 'web.json', file: { text: async () => text } }] }) },
    './backup-format': format,
  }, {
    document: { body: { appendChild: () => {} }, createElement: () => ({ click() { downloads.push(this.download); }, remove: () => {} }) },
    URL: { createObjectURL: () => 'blob:backup', revokeObjectURL: url => revoked.push(url) },
    setTimeout: fn => fn(),
  });
  assert.equal((await web.pickSettingsBackup()).name, 'web.json');
  assert.equal(await web.saveSettingsBackup(text), downloads[0]);
  assert.deepEqual(revoked, ['blob:backup']);
}
async function checkUI(privateBackup) {
  const jsx = (type, props) => ({ type, props });
  const states = [], refs = [];
  let stateIndex = 0, refIndex = 0, nextFile = null, readFailure = false, restoreCount = 0;
  const exported = [], imported = [];
  const BackupSettings = load('src/features/settings/backup-settings.tsx', {
    './menu-layout': menuRules,
    react: { useEffect: () => {}, useRef: value => refs[refIndex++] ??= { current: value },
      useState: initial => { const index = stateIndex++; states[index] ??= initial; return [states[index], value => { states[index] = value; }]; } },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/components/text': { Text: 'Text' },
  '@/components/text': { Text: 'Text' },
  '@/components/text': { Text: 'Text' },
  'react-native': { Platform: { OS: 'android' }, Text: 'Text', View: 'View', Pressable: 'Pressable', ActivityIndicator: 'Spinner', StyleSheet: { create: styles => styles } },
    '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Icon' },
    '@/components/animated-switch': { AnimatedSwitch: 'Switch' },
    '@/stores/hidden-feature-access': { useHiddenFeatureAccess: () => access.getState() },
    '@/theme/tokens': { useColors: () => ({ tint: '#f48' }) },
    '@/services/settings-backup': {
      createSettingsBackup: async value => { exported.push(value); return JSON.stringify(general); },
      restoreSettingsBackup: async (backup, value) => { restoreCount++; imported.push([backup, value]); },
    },
    './backup-files': { saveSettingsBackup: async () => 'saved.json', pickSettingsBackup: async () => { if (readFailure) throw new Error('corrupt'); return nextFile; } },
    './settings-menu-layout': { settingsMenuStyles: { row: {}, icon: {} } },
    './settings-ui': { SettingsPage: 'Page', SettingsSection: 'Section' },
  }).BackupSettings;
  function render() { stateIndex = 0; refIndex = 0; return BackupSettings(); }
  function nodes(node) { if (Array.isArray(node)) return node.flatMap(nodes); return node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : []; }
  const button = title => nodes(render()).find(node => node.type === 'Pressable' && nodes(node).some(child => child.type === 'Text' && child.props.children === title));
  await access.getState().restoreEnabled(false);
  assert.equal(nodes(render()).filter(node => node.type === 'Switch').length, 0, 'A concealed Other menu is not exposed by the backup screen');
  const exportButton = button('설정 백업하기'); exportButton.props.onPress(); exportButton.props.onPress(); await flush();
  assert.deepEqual(exported, [false], 'Rapid repeated export presses create one general backup');
  assert.equal(button('이 설정으로 복구하기'), undefined);
  nextFile = { name: 'private.json', backup: privateBackup };
  button('백업 파일 선택').props.onPress(); await flush();
  assert.equal(restoreCount, 0, 'Choosing a valid file displays a preview before any restore');
  assert.equal(nodes(render()).find(node => node.type === 'Switch').props.value, false, 'Account restore is opt-in');
  button('이 설정으로 복구하기').props.onPress(); await flush();
  assert.equal(imported[0][1], false); assert.equal(button('이 설정으로 복구하기'), undefined);
  button('백업 파일 선택').props.onPress(); await flush();
  nodes(render()).find(node => node.type === 'Switch').props.onValueChange(true);
  button('이 설정으로 복구하기').props.onPress(); await flush(); assert.equal(imported[1][1], true);
  readFailure = true; button('백업 파일 선택').props.onPress(); await flush();
  assert.equal(button('이 설정으로 복구하기'), undefined, 'Corrupt input never exposes a restore action');
  assert.ok(nodes(render()).some(node => node.props?.accessibilityRole === 'alert'));
  readFailure = false; nextFile = null; button('백업 파일 선택').props.onPress(); await flush();
  assert.equal(button('이 설정으로 복구하기'), undefined, 'Picker cancellation leaves no pending restore');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
