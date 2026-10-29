/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
function read(file, mocks = {}) {
  const exports = {}, source = fs.readFileSync(path.join(root, file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', code)(name => { if (['@/services/preferences/persistence', '@/services/preferences/storage', '@/services/async/serial-queue'].includes(name)) return require('./test-source-loader.cjs').loadSource('src/' + name.slice(2) + '.ts', mocks); assert(name in mocks, name); return mocks[name]; }, exports);
  return exports;
}
const schema = require('../src/features/settings/ios-settings-schema.json');
const rules = read('src/features/settings/system-settings-sync.ts', { './ios-settings-schema.json': schema });
const haptics = read('src/features/haptics/preferences.ts'), blur = read('src/features/settings/blur-preferences.ts');
const clone = value => JSON.parse(JSON.stringify(value));
const defaults = () => ({ theme: 'auto', quality: 'original', hideArtwork: false, haptics: clone(haptics.DEFAULT_HAPTIC_PREFERENCES), blur: clone(blur.DEFAULT_BLUR_PREFERENCES) });
assert.deepEqual(Object.fromEntries(schema.groups.flatMap(group => group.items).map(item => [item.key, item.default])), rules.flattenSystemPreferences(defaults()), 'Native defaults match actual app defaults');
assert.equal(new Set(rules.SYSTEM_SETTINGS_KEYS).size, rules.SYSTEM_SETTINGS_KEYS.length);
const pages = require('../plugins/with-ios-system-settings').settingsPages();
assert.equal(pages.Root.PreferenceSpecifiers.filter(item => item.Type === 'PSChildPaneSpecifier').length, 2);
assert.deepEqual(new Set(Object.values(pages).flatMap(page => page.PreferenceSpecifiers).map(item => item.Key).filter(Boolean)), new Set(rules.SYSTEM_SETTINGS_KEYS));
assert(!rules.SYSTEM_SETTINGS_KEYS.some(key => /password|token|account|hidden/i.test(key)), 'The Settings bundle never exports credentials or hidden-library controls');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const flush = async sync => { for (let i = 0; i < 20; i++) { await sync.settled(); await Promise.resolve(); } };
function harness({ app = defaults(), native = {} } = {}) {
  let listener, watch, loadError = false, applyError = false, gate;
  const writes = [], statuses = [], applied = [];
  const sync = rules.startSystemSettingsSync({
    load: async () => { if (loadError) throw Error('read'); }, snapshot: () => clone(app),
    apply: async next => { if (gate) { const hold = gate; gate = null; await hold; } if (applyError) throw Error('save'); app = clone(next); applied.push(app); listener?.(); },
    read: () => ({ ...native }), write: values => { writes.push({ ...values }); Object.assign(native, values); },
    subscribe: notify => { listener = notify; return () => { listener = null; }; },
    watch: notify => { watch = notify; return () => { watch = null; }; }, status: (ready, error) => statuses.push({ ready, error }),
  });
  return { sync, writes, statuses, applied, native, app: () => app,
    external: values => { Object.assign(native, values); watch?.(); },
    restore: next => { app = clone(next); listener?.(); },
    failLoad: value => { loadError = value; }, failApply: value => { applyError = value; }, hold: promise => { gate = promise; },
  };
}
async function main() {
  const legacy = defaults(); legacy.theme = 'dark'; legacy.quality = 'mp3'; legacy.haptics.enabled = false; legacy.blur.areas.miniPlayer.intensity = 63;
  const migrated = harness({ app: legacy }); await flush(migrated.sync);
  assert.deepEqual(migrated.native, rules.flattenSystemPreferences(legacy)); assert.deepEqual(migrated.app(), legacy);
  migrated.external({ ym_theme: 'light', ym_hideArtwork: true, ym_haptics_playback_strength: 'heavy', ym_blur_miniPlayer_intensity: 42.8 });
  await flush(migrated.sync);
  assert.equal(migrated.app().theme, 'light'); assert.equal(migrated.app().hideArtwork, true);
  assert.equal(migrated.app().haptics.events.playback.strength, 'heavy'); assert.equal(migrated.app().blur.areas.miniPlayer.intensity, 43);
  assert.equal(migrated.writes.length, 1, 'External imports never echo a stale full preference set');
  const backup = clone(migrated.app()); backup.theme = 'dark'; backup.haptics.enabled = true;
  migrated.native.privateAccountToken = 'untouched'; migrated.restore(backup); await flush(migrated.sync);
  assert.equal(migrated.native.ym_theme, 'dark'); assert.equal(migrated.native.ym_haptics_enabled, true);
  assert.equal(migrated.native.privateAccountToken, 'untouched'); assert.deepEqual(Object.keys(migrated.writes.at(-1)).sort(), ['ym_haptics_enabled', 'ym_theme']);
  migrated.sync.stop();
  const restart = harness({ native: migrated.native }); await flush(restart.sync); assert.deepEqual(restart.app(), backup); restart.sync.stop();

  const beforeLaunch = harness({ app: legacy, native: { ym_theme: 'light', ym_haptics_enabled: true } });
  await flush(beforeLaunch.sync); assert.equal(beforeLaunch.app().theme, 'light'); assert.equal(beforeLaunch.app().haptics.enabled, true);
  assert.equal(beforeLaunch.native.ym_quality, 'mp3', 'Only missing fields migrate from legacy storage'); beforeLaunch.sync.stop();
  const invalid = harness({ app: legacy, native: { ym_theme: 'invalid', ym_quality: 4, ym_hideArtwork: 'false', ym_blur_tabBar_intensity: 1000 } });
  await flush(invalid.sync); assert.deepEqual(invalid.app(), legacy); assert.deepEqual(invalid.native, rules.flattenSystemPreferences(legacy)); invalid.sync.stop();

  const race = harness(); await flush(race.sync);
  const hold = deferred(); race.hold(hold.promise); race.external({ ym_theme: 'light' });
  for (let i = 0; i < 10; i++) await Promise.resolve();
  race.external({ ym_theme: 'dark', ym_quality: 'mp3' }); hold.resolve(); await flush(race.sync);
  assert.equal(race.app().theme, 'dark'); assert.equal(race.app().quality, 'mp3'); assert.equal(race.native.ym_theme, 'dark');
  assert.equal(race.writes.length, 1, 'A delayed import cannot overwrite a newer Settings edit'); race.sync.stop();
  const failed = harness({ native: { ym_theme: 'dark' } }); failed.failLoad(true); await flush(failed.sync);
  assert(failed.statuses.at(-1).ready && failed.statuses.at(-1).error); assert.equal(failed.writes.length, 0);
  failed.failLoad(false); await failed.sync.refresh(); assert.equal(failed.app().theme, 'dark'); assert.equal(failed.statuses.at(-1).error, null);
  failed.failApply(true); failed.external({ ym_theme: 'light' }); await flush(failed.sync);
  assert(failed.statuses.at(-1).error); assert.equal(failed.native.ym_theme, 'light'); failed.failApply(false); await failed.sync.refresh(); assert.equal(failed.app().theme, 'light');
  failed.sync.stop(); const count = failed.applied.length; failed.external({ ym_theme: 'dark' }); await flush(failed.sync); assert.equal(failed.applied.length, count);

  await actualStores(); checkMenus();
  console.log('PASS: iOS Settings schema, existing-value migration, prelaunch edits, cold-start restoration, external/backup sync, invalid values, fractional sliders, delayed-edit races, errors/retry/disposal, actual preference persistence and platform/build fallback.');
}
async function actualStores() {
  const disk = new Map(), native = { ym_settings_bundle_version: 1, ym_theme: 'dark', ym_quality: 'mp3' }, effects = [], watches = [];
  const { createStore } = require('zustand/vanilla');
  const create = initializer => { const store = createStore(initializer); return Object.assign(select => select ? select(store.getState()) : store.getState(), store); };
  const kv = { getItem: key => disk.get(key) ?? null, setItem: (key, value) => disk.set(key, value) };
  const shared = { zustand: { create }, 'react-native': { Platform: { OS: 'ios' }, Appearance: { setColorScheme() {} } },
    'expo-secure-store': { getItemAsync: async key => disk.get(key) ?? null, setItemAsync: async (key, value) => disk.set(key, value) },
    'expo-sqlite/kv-store': { __esModule: true, default: kv }, '@/theme/mode': read('src/theme/mode.ts'),
    '@/features/haptics/preferences': haptics, '@/features/settings/blur-preferences': blur };
  const stores = Object.fromEntries(['theme', 'streaming', 'display', 'haptic', 'blur'].map(name => ['@/stores/' + name + '-preferences', read('src/stores/' + name + '-preferences.ts', shared)]));
  let activate;
  const bridge = read('src/features/settings/ios-system-settings.ios.ts', { ...shared, ...stores,
    react: { useEffect: effect => effects.push(effect) }, './system-settings-sync': rules,
    'react-native': { Settings: { get: key => native[key], set: values => Object.assign(native, values), watchKeys: (_keys, notify) => { watches.push(notify); return 0; }, clearWatch() {} },
      AppState: { addEventListener: (_event, notify) => { activate = notify; return { remove() {} }; } } },
  });
  assert(bridge.isIosSystemSettingsAvailable); assert.equal(bridge.useIosSystemSettingsReady(), false);
  const stop = effects[0](); await bridge.refreshIosSystemSettings();
  assert.equal(bridge.useIosSystemSettingsStatus().ready, true);
  assert.equal(stores['@/stores/theme-preferences'].useThemePreferences.getState().mode, 'dark');
  assert.equal(stores['@/stores/streaming-preferences'].useStreamingPreferences.getState().quality, 'mp3');
  Object.assign(native, { ym_theme: 'light', ym_haptics_enabled: false, ym_hideArtwork: true }); activate('active'); await bridge.refreshIosSystemSettings();
  assert.equal(stores['@/stores/theme-preferences'].useThemePreferences.getState().mode, 'light');
  assert.equal(stores['@/stores/haptic-preferences'].useHapticPreferences.getState().preferences.enabled, false);
  assert.equal(stores['@/stores/display-preferences'].useDisplayPreferences.getState().hideArtwork, true);
  await stores['@/stores/streaming-preferences'].useStreamingPreferences.getState().setQuality('original'); await bridge.refreshIosSystemSettings();
  assert.equal(native.ym_quality, 'original'); assert.equal(disk.get('yeongdumusic-streaming-quality-v1'), 'original'); stop();
  assert.equal(read('src/features/settings/ios-system-settings.ts').isIosSystemSettingsAvailable, false, 'Android/web have no native Settings dependency');
}
function checkMenus() {
  const jsx = (type, props) => ({ type, props });
  const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
  for (const available of [false, true]) {
    const mocks = { 'react/jsx-runtime': { jsx, jsxs: jsx }, react: { useEffect() {}, useState: initial => [initial, () => {}] },
      '@/features/settings/ios-system-settings': { isIosSystemSettingsAvailable: available }, '@/features/settings/ios-system-settings-link': { IosSystemSettingsLink: 'SystemLink' },
      '@/features/settings/settings-ui': { SettingsPage: 'Page', SettingsSection: 'Section', SettingsLink: 'Link' },
      '@/features/settings/version-settings': { VersionSettings: 'Version' }, '@/stores/hidden-feature-access': { useHiddenFeatureAccess: select => select({ ready: true, enabled: false }) },
      '@/components/toast-notice': { ToastNotice: 'Toast' }, '@/features/settings/theme-settings': { ThemeSettings: 'Theme' },
      '@/features/settings/blur-settings': { BlurSettings: 'Blur' }, '@/features/playback/streaming-quality-settings': { StreamingQualitySettings: 'Quality' },
      '@/features/playback/playback-options-settings': { PlaybackOptionsSettings: 'Options' }, '@/features/lyrics/translation-settings': { LyricsTranslationSettings: 'Lyrics' } };
    mocks['@/features/playback/seek-playback-settings'] = { SeekPlaybackSettings: 'SeekPlaybackSettings' };
    const rootMenu = nodes(read('src/app/settings.tsx', mocks).default());
    assert.equal(rootMenu.some(node => node.type === 'SystemLink'), available);
    assert.equal(rootMenu.some(node => node.props?.href === '/settings/haptics'), !available);
    for (const href of ['/settings/cloud', '/settings/library', '/settings/backup']) assert(rootMenu.some(node => node.props?.href === href));
    const playback = nodes(read('src/app/settings/playback.tsx', mocks).default());
    assert(playback.some(node => node.type === 'SeekPlaybackSettings'), 'Seek playback remains configurable in-app with old and new iOS binaries');
    assert.equal(playback.some(node => node.type === 'Theme'), !available); assert.equal(playback.some(node => node.type === 'Quality'), !available);
    assert.equal(playback.some(node => node.type === 'Blur'), !available); assert.equal(playback.some(node => node.type === 'Options'), !available);
    assert(playback.some(node => node.type === 'Lyrics')); assert(playback.some(node => node.props?.href === '/settings/colors'));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
