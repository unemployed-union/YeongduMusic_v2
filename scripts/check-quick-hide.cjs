/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { create } = require('zustand');
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
const rules = load('src/features/hidden-music/rules.ts');
const playlists = load('src/features/playlists/rules.ts');
const values = new Map(), profiles = new Map();
let failAccess = false, failProfile = false, holdProfile = false, releaseProfile, profileWrites = 0, authCalls = 0;
const accessModules = {
  '@/components/text': { Text: 'Text' },
  'react-native': { Platform: { OS: 'android' } },
  'expo-secure-store': {
    getItemAsync: async key => values.get(key) ?? null,
    setItemAsync: async (key, value) => { if (failAccess) throw new Error('access disk failure'); values.set(key, value); },
  },
};
const newAccess = () => load('src/stores/hidden-feature-access.ts', accessModules).useHiddenFeatureAccess;
const newPrivacy = () => load('src/stores/hidden-music.ts', {
  '@/features/hidden-music/rules': rules,
  '@/services/hidden-music/biometrics': { authenticateHiddenSettings: async () => { authCalls++; } },
  '@/services/hidden-music/storage': {
    readHiddenProfile: async scope => profiles.has(scope) ? rules.parseProfile(profiles.get(scope)) : rules.emptyProfile(),
    writeHiddenProfile: async (scope, profile) => {
      profileWrites++;
      if (holdProfile) await new Promise(resolve => { releaseProfile = resolve; });
      if (failProfile) throw new Error('profile disk failure');
      profiles.set(scope, JSON.stringify(profile));
    },
  },
}).useHiddenMusicStore;
const access = newAccess(), privacy = newPrivacy();
const { quickHide } = load('src/features/hidden-music/quick-hide.ts', {
  '@/stores/hidden-feature-access': { useHiddenFeatureAccess: access },
  '@/stores/hidden-music': { useHiddenMusicStore: privacy },
});
const jsx = (type, props) => ({ type, props });
const navigation = [], alerts = [], timers = new Map();
let now = 0, timerId = 0, refs = [], refIndex = 0, focusCleanup;
function advance(ms) {
  now += ms;
  for (const [id, timer] of [...timers]) if (timer.time <= now) { timers.delete(id); timer.callback(); }
}
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const ui = {
  react: { useRef: initial => refs[refIndex++] ??= { current: initial }, useCallback: fn => fn, useEffect: () => {} },
  'react/jsx-runtime': { jsx, jsxs: jsx },
  '@/components/text': { Text: 'Text' },
  'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', Keyboard: { dismiss: () => {} }, Alert: { alert: (...args) => alerts.push(args) }, StyleSheet: { create: styles => styles } },
  'expo-router': { router: { push: route => navigation.push(route) }, useFocusEffect: fn => { focusCleanup = fn(); } },
  '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Icon' },
  '@/theme/tokens': { useColors: () => ({ tint: '#f48', text: '#111', muted: '#888', separator: '#ddd' }) },
  '@/stores/hidden-feature-access': { useHiddenFeatureAccess: () => access.getState() },
  '@/features/hidden-music/quick-hide': { quickHide },
};
const { SettingsButton, SETTINGS_TAP_GAP_MS } = load('src/components/settings-button.tsx', ui, {
  setTimeout: (callback, ms) => { const id = ++timerId; timers.set(id, { callback, time: now + ms }); return id; },
  clearTimeout: id => timers.delete(id),
});
function render() { refIndex = 0; return SettingsButton(); }
function five() { const button = render(); for (let i = 0; i < 5; i++) { button.props.onPress(); advance(100); } }
async function enable() { access.getState().resetTaps(); for (let i = 0; i < 15; i++) await access.getState().tapVersion(); }
async function main() {
  profiles.set('demo', JSON.stringify({ version: 1, biometricLock: true, presets: [
    { id: 'private-music', name: 'Private music', enabled: false, songIds: ['secret'], folders: [] },
  ], hiddenPlaylistIds: ['private-list'], quickHidePlaylistIds: ['quick-list'] }));
  await access.getState().load(); await privacy.getState().load('demo');
  assert.equal(access.getState().quickHideEnabled, true);
  const inactive = render(); inactive.props.onPress();
  assert.deepEqual(navigation.splice(0), ['/settings'], 'Inactive hidden features retain immediate navigation');
  focusCleanup();
  await enable();
  let button = render(); button.props.onPress(); advance(SETTINGS_TAP_GAP_MS - 1);
  assert.equal(navigation.length, 0);
  advance(1); assert.deepEqual(navigation.splice(0), ['/settings'], 'One tap still opens Settings');
  assert.equal(access.getState().enabled, true);
  focusCleanup();
  five(); await flush();
  assert.equal(navigation.length, 0, 'Five taps do not navigate away from the main screen');
  assert.equal(access.getState().enabled, false);
  assert.equal(privacy.getState().profile.presets[0].enabled, true);
  assert.equal(privacy.getState().unlocked, false);
  assert.equal(authCalls, 0, 'Concealing does not require biometric authentication');
  assert.equal(rules.visibleSongs({ items: [{ id: 'secret' }, { id: 'public' }], total: 2 }, privacy.getState().profile.presets).total, 1);
  assert.deepEqual(playlists.visiblePlaylists([{ id: 'private-list' }, { id: 'quick-list' }, { id: 'public-list' }], privacy.getState().profile.hiddenPlaylistIds).map(item => item.id), ['public-list']);
  assert.deepEqual(privacy.getState().profile.hiddenPlaylistIds, ['private-list', 'quick-list'], 'Five taps hide selected playlists together with music');
  const restartedAccess = newAccess(), restartedPrivacy = newPrivacy();
  await restartedAccess.getState().load(); await restartedPrivacy.getState().load('demo');
  assert.equal(restartedAccess.getState().enabled, false);
  assert.equal(restartedPrivacy.getState().profile.presets[0].enabled, true);
  assert.deepEqual(restartedPrivacy.getState().profile.hiddenPlaylistIds, ['private-list', 'quick-list']);
  assert.deepEqual(restartedPrivacy.getState().profile.quickHidePlaylistIds, ['quick-list']);
  await assert.rejects(privacy.getState().togglePreset('private-music'), /생체 인증/, 'Quick conceal must not weaken editing protection');
  await enable(); await access.getState().setQuickHideEnabled(false);
  button = render(); button.props.onPress();
  assert.deepEqual(navigation.splice(0), ['/settings'], 'Disabled quick hide restores immediate navigation');
  const optionRestart = newAccess(); await optionRestart.getState().load();
  assert.equal(optionRestart.getState().quickHideEnabled, false);
  assert.equal(optionRestart.getState().quickHideMode, 'off', 'Legacy false preferences preserve disabled quick hide');
  assert.equal(optionRestart.getState().enabled, true, 'The option is independent of hidden-menu activation');
  focusCleanup(); await access.getState().setQuickHideEnabled(true);
  button = render(); for (let i = 0; i < 4; i++) { button.props.onPress(); advance(100); }
  advance(SETTINGS_TAP_GAP_MS);
  assert.deepEqual(navigation.splice(0), ['/settings']);
  assert.equal(access.getState().enabled, true, 'Four taps do not conceal');
  button.props.onPress(); focusCleanup(); advance(SETTINGS_TAP_GAP_MS);
  assert.equal(navigation.length, 0, 'Leaving a screen cancels pending navigation and tap counts');
  failProfile = true; five(); await flush();
  assert.equal(access.getState().enabled, true, 'Do not conceal the entry when saving hidden selections fails');
  assert.equal(alerts.length, 1); failProfile = false;
  failAccess = true; five(); await flush();
  assert.equal(access.getState().enabled, true);
  assert.equal(privacy.getState().profile.presets[0].enabled, true, 'A menu-storage error must not reveal the music');
  assert.equal(alerts.length, 2); failAccess = false;
  holdProfile = true;
  five(); await flush();
  const before = profileWrites;
  button = render(); for (let i = 0; i < 15; i++) button.props.onPress();
  await flush(); assert.equal(profileWrites, before, 'Extra taps during conceal cannot duplicate writes');
  releaseProfile(); holdProfile = false; await flush();
  assert.equal(access.getState().enabled, false);
  advance(SETTINGS_TAP_GAP_MS); assert.equal(navigation.length, 0);
  failAccess = true; await access.getState().setQuickHideEnabled(false);
  assert.equal(access.getState().quickHideEnabled, true, 'A failed option save keeps the last saved value');
  failAccess = false;
  // Existing boolean preferences migrate to a single, mutually exclusive mode.
  assert.equal(access.getState().quickHideMode, 'all');
  failAccess = true; await access.getState().setQuickHideMode('preset');
  assert.equal(access.getState().quickHideMode, 'all', 'A failed mode save preserves the previous exclusive mode');
  failAccess = false;
  await access.getState().setQuickHideMode('preset');
  assert.equal(access.getState().quickHideEnabled, true);
  const presetModeRestart = newAccess(); await presetModeRestart.getState().load();
  assert.equal(presetModeRestart.getState().quickHideMode, 'preset');
  await privacy.getState().unlock();
  await privacy.getState().savePreset({ id: 'public-music', name: 'Public music', enabled: false, songIds: ['public'], folders: [] });
  await privacy.getState().savePreset({ id: 'already-hidden', name: 'Already hidden', enabled: true, songIds: ['hidden'], folders: [] });
  await privacy.getState().togglePreset('private-music');
  await privacy.getState().setQuickHidePreset('private-music');
  await privacy.getState().setQuickHidePlaylist('preset-list', true);
  await privacy.getState().setQuickHidePlaylist('preset-list', true);
  assert.deepEqual(privacy.getState().profile.quickHidePlaylistIds, ['quick-list', 'preset-list']);
  assert(!privacy.getState().profile.hiddenPlaylistIds.includes('preset-list'), 'Selecting a playlist never hides it immediately');
  assert.equal(privacy.getState().profile.presets[0].enabled, false, 'Selecting a target does not hide music');
  privacy.getState().lock();
  await assert.rejects(privacy.getState().setQuickHidePreset('public-music'), /생체 인증/, 'Changing the target respects biometric protection');
  await assert.rejects(privacy.getState().setQuickHidePlaylist('other-list', true), /생체 인증/);
  const selectedRestart = newPrivacy(); await selectedRestart.getState().load('demo');
  assert.equal(selectedRestart.getState().profile.quickHidePresetId, 'private-music');
  await enable();
  const beforeAuthentication = authCalls;
  five(); await flush();
  assert.equal(access.getState().enabled, false);
  assert.equal(authCalls, beforeAuthentication, 'Selected-preset conceal does not prompt for authentication');
  assert.deepEqual(privacy.getState().profile.presets.map(p => [p.id, p.enabled]), [
    ['private-music', true], ['public-music', false], ['already-hidden', true],
  ], 'Only the selected preset becomes active; other states are preserved');
  assert.deepEqual(privacy.getState().profile.hiddenPlaylistIds, ['private-list', 'quick-list', 'preset-list'], 'Selected-preset mode conceals the selected playlists in the same profile write');
  assert.equal(privacy.getState().unlocked, false);
  await enable(); await privacy.getState().unlock();
  await privacy.getState().removePreset('private-music');
  assert.equal(privacy.getState().profile.quickHidePresetId, undefined);
  privacy.getState().lock();
  await assert.rejects(quickHide(), /프리셋을 먼저 선택/, 'A deleted target never falls back to hiding all presets');
  assert.equal(access.getState().enabled, true, 'The settings entry remains available to choose a replacement');
  assert.equal(privacy.getState().profile.presets[0].enabled, false);
  assert.throws(() => rules.parseProfile(JSON.stringify({ version: 1, biometricLock: false, presets: [], quickHidePresetId: 42 })), /프리셋 설정/);
  await privacy.getState().load('another-account');
  assert.equal(privacy.getState().profile.quickHidePresetId, undefined, 'The target is account-specific');
  assert.deepEqual(privacy.getState().profile.quickHidePlaylistIds, [], 'Playlist targets are account-specific');
  await assert.rejects(quickHide(), /프리셋을 먼저 선택/);
  await privacy.getState().load('demo');
  await privacy.getState().unlock(); await privacy.getState().setQuickHidePreset('public-music'); privacy.getState().lock();
  holdProfile = true;
  const changingAccount = quickHide(); await flush();
  await privacy.getState().load('another-account');
  releaseProfile(); holdProfile = false;
  await assert.rejects(changingAccount, /계정이 변경/, 'An account change during conceal must not hide the new account settings');
  assert.equal(access.getState().enabled, true);
  assert.equal(privacy.getState().profile.presets.length, 0, 'The old target does not leak into the new account');
  await access.getState().setQuickHideEnabled(true);
  assert.equal(access.getState().quickHideMode, 'all', 'Enabling all automatically disables preset mode');
  await privacy.getState().load(null); await privacy.getState().hideAll();
  assert.equal(privacy.getState().unlocked, false, 'Local-only mode can safely conceal without an account profile');
  const QuickHideSettings = load('src/features/settings/quick-hide-settings.tsx', {
    ...ui, '@/components/animated-switch': { AnimatedSwitch: 'Switch' },
    '@/stores/hidden-music': { useHiddenMusicStore: () => privacy.getState() },
    './settings-ui': { SettingsLink: 'SettingsLink' },
    './settings-menu-layout': { settingsMenuStyles: { row: {}, icon: {} } },
  }).QuickHideSettings;
  const toggle = QuickHideSettings().props.children[0].props.children[2];
  assert.equal(toggle.props.value, true); toggle.props.onValueChange(false); await flush();
  assert.equal(access.getState().quickHideEnabled, false, 'The Other toggle controls the persisted setting');
  await privacy.getState().load('demo'); await privacy.getState().unlock();
  await privacy.getState().setQuickHidePreset('public-music'); privacy.getState().lock();
  let tree = QuickHideSettings();
  const selectedToggle = tree.props.children[1].props.children[2];
  assert.equal(selectedToggle.props.disabled, false);
  selectedToggle.props.onValueChange(true); await flush();
  tree = QuickHideSettings();
  assert.equal(tree.props.children[0].props.children[2].props.value, false);
  assert.equal(tree.props.children[1].props.children[2].props.value, true, 'Other UI switches are mutually exclusive');
  const selectionLink = tree.props.children[2].props.children;
  assert.equal(selectionLink.props.href, '/settings/quick-hide-preset');
  assert.ok(!selectionLink.props.description.includes('Public music'), 'Locked settings do not reveal preset names');
  const blockedAllRow = tree.props.children[0];
  assert.equal(blockedAllRow.props.children[2].props.disabled, true);
  assert.equal(blockedAllRow.props.children[0].props.children.props.color, '#888');
  assert.equal(blockedAllRow.props.children[1].props.children[0].props.style[1].color, '#888');
  blockedAllRow.props.children[2].props.onValueChange(true); await flush();
  assert.equal(access.getState().quickHideMode, 'preset', 'Disabled mutually exclusive settings cannot replace the active mode');
  tree.props.children[1].props.children[2].props.onValueChange(false); await flush();
  tree = QuickHideSettings();
  assert.equal(tree.props.children[0].props.children[2].props.disabled, false);
  tree.props.children[0].props.children[2].props.onValueChange(true); await flush();
  tree = QuickHideSettings();
  assert.equal(tree.props.children[0].props.children[2].props.value, true);
  assert.equal(tree.props.children[1].props.children[2].props.value, false);
  assert.equal(tree.props.children[1].props.children[2].props.disabled, true);
  assert.equal(tree.props.children[1].props.children[1].props.children[0].props.style[1].color, '#888');
  tree.props.children[1].props.children[2].props.onValueChange(true); await flush();
  assert.equal(access.getState().quickHideMode, 'all');
  await privacy.getState().unlock();
  const playlistState = { ready: true, busy: false, scope: 'demo', profile: { presets: [{ id: 'ui-list', name: 'UI playlist', songIds: ['public'] }] } };
  const selectPrivacy = Object.assign(() => privacy.getState(), { getState: privacy.getState });
  const selectPlaylists = Object.assign(() => playlistState, { getState: () => playlistState });
  const QuickHidePresetSettings = load('src/features/settings/quick-hide-preset-settings.tsx', {
    ...ui, react: { ...ui.react, useMemo: fn => fn() }, '@/components/text': { Text: 'Text' },
  'react-native': { ...ui['react-native'], FlatList: 'FlatList' },
    '@/stores/hidden-music': { useHiddenMusicStore: selectPrivacy }, '@/stores/playlists': { usePlaylistStore: selectPlaylists },
    '@/components/scroll-edge-fade': { ScrollEdgeFade: 'ScrollEdgeFade' },
    './settings-menu-layout': { settingsMenuStyles: { row: {}, icon: {} } },
  }).QuickHidePresetSettings;
  const list = QuickHidePresetSettings().props.children;
  const other = privacy.getState().profile.presets.find(p => p.id === 'already-hidden');
  const row = list.props.renderItem({ item: list.props.data.find(item => item.kind === 'preset' && item.preset.id === other.id) });
  assert.equal(row.props.accessibilityRole, 'radio');
  assert.equal(row.props.accessibilityState.checked, false);
  row.props.onPress(); await flush();
  assert.equal(privacy.getState().profile.quickHidePresetId, other.id, 'The picker saves its target without changing mode');
  assert.equal(access.getState().quickHideMode, 'all');
  const playlistChoice = list.props.data.find(item => item.kind === 'playlist');
  const playlistRow = list.props.renderItem({ item: playlistChoice });
  assert.equal(playlistRow.props.accessibilityRole, 'checkbox');
  assert.equal(playlistRow.props.accessibilityState.checked, false);
  playlistRow.props.onPress(); await flush();
  assert(privacy.getState().profile.quickHidePlaylistIds.includes('ui-list'));
  assert(!privacy.getState().profile.hiddenPlaylistIds.includes('ui-list'), 'The picker only stores the quick-hide selection');
  const updatedList = QuickHidePresetSettings().props.children;
  const selectedRow = updatedList.props.renderItem({ item: playlistChoice });
  assert.equal(selectedRow.props.accessibilityState.checked, true);
  selectedRow.props.onPress(); await flush(); assert(!privacy.getState().profile.quickHidePlaylistIds.includes('ui-list'));
  playlistState.scope = 'another-account';
  assert(!QuickHidePresetSettings().props.children.props.data.some(item => item.kind === 'playlist'), 'A different account cannot expose playlist names');
  await access.getState().setQuickHideMode('off');
  await privacy.getState().load('another-account');
  tree = QuickHideSettings();
  assert.equal(tree.props.children[1].props.children[2].props.disabled, true, 'A missing preset disables preset conceal');
  assert.equal(tree.props.children[1].props.children[1].props.children[0].props.style[1].color, '#888');
  tree.props.children[1].props.children[2].props.onValueChange(true); await flush();
  assert.equal(access.getState().quickHideMode, 'off');
  await privacy.getState().load(null);
  assert.equal(QuickHideSettings().props.children[2].props.children.props.disabled, true, 'The target picker requires a NAS account');
  for (const value of [null, 3, [''], [42]]) assert.throws(() => rules.parseProfile(JSON.stringify({ ...rules.emptyProfile(), quickHidePlaylistIds: value })), /플레이리스트 설정/);
  assert.deepEqual(rules.parseProfile(JSON.stringify({ ...rules.emptyProfile(), quickHidePlaylistIds: ['one', 'one'] })).quickHidePlaylistIds, ['one']);
  const atomic = newPrivacy();
  await atomic.getState().load('atomic-account');
  await atomic.getState().savePreset({ id: 'music', name: 'Music', enabled: false, songIds: ['secret'], folders: [] });
  await atomic.getState().setQuickHidePlaylist('list', true);
  failProfile = true; await assert.rejects(atomic.getState().hideAll(), /disk failure/); failProfile = false;
  assert.equal(atomic.getState().profile.presets[0].enabled, false);
  assert.deepEqual(atomic.getState().profile.hiddenPlaylistIds, [], 'A failed conceal cannot publish only the playlist or only the music');
  let palette;
  const { AnimatedSwitch } = load('src/components/animated-switch.tsx', {
    react: { useEffect: effect => effect() },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': ui['react-native'],
    '@/theme/tokens': { useColors: () => palette },
    'react-native-reanimated': {
      __esModule: true, default: { View: 'AnimatedView' }, ReduceMotion: { System: 'system' },
      useSharedValue: value => ({ value }), withTiming: value => value,
      useAnimatedStyle: callback => callback(), interpolateColor: (value, _, colors) => colors[value],
    },
  });
  let scheme = 'light';
  const themes = load('src/theme/tokens.ts', { 'react-native': { useColorScheme: () => scheme } });
  for (scheme of ['light', 'dark']) {
    palette = themes.useColors();
    for (const value of [false, true]) {
      let changes = 0;
      const control = AnimatedSwitch({ value, disabled: true, onValueChange: () => changes++, trackColor: { true: '#f48' } });
      assert.deepEqual(control.props.accessibilityState, { checked: value, disabled: true });
      control.props.onPress(); assert.equal(changes, 0, 'Disabled switches cannot change their saved state');
      const track = control.props.children, thumb = track.props.children;
      assert.equal(track.props.style[1].backgroundColor, value ? palette.muted : palette.separator);
      assert.equal(thumb.props.style[1].backgroundColor, palette.switchThumbDisabled);
      assert.equal(thumb.props.style[1].transform[0].translateX, value ? 22 : 0, 'Disabled switches preserve their checked position');
    }
    for (const value of [false, true]) {
      const control = AnimatedSwitch({ value });
      assert.equal(control.props.children.props.style[1].backgroundColor, value ? palette.tint : palette.separator);
      assert.equal(control.props.children.props.children.props.style[1].backgroundColor, value ? palette.switchThumbOn : palette.switchThumbOff);
      const pending = AnimatedSwitch({ value, busy: true, onValueChange: () => { throw Error('A save is already pending'); } });
      assert.equal(pending.props.disabled, true); assert.equal(pending.props.accessibilityState.busy, true); pending.props.onPress();
      assert.deepEqual(pending.props.children.props.style, control.props.children.props.style, 'A pending save must not flash the track into disabled colors');
      assert.deepEqual(pending.props.children.props.children.props.style, control.props.children.props.children.props.style, 'A pending save preserves thumb color and position in both themes');
    }
    let next;
    const control = AnimatedSwitch({ value: false, onValueChange: value => { next = value; }, trackColor: { false: '#123', true: '#f48' }, thumbColor: '#fff' });
    control.props.onPress(); assert.equal(next, true);
    assert.equal(control.props.children.props.style[1].backgroundColor, '#123', 'Enabled controls retain their configured colors');
    assert.equal(control.props.children.props.children.props.style[1].backgroundColor, '#fff');
  }
  refs = [];
  console.log('PASS: five-tap all/selected conceal, mutually exclusive settings, target picker, legacy migration and restart persistence, account isolation/switch during conceal, deleted targets, protected selection and locked conceal, preserved other presets/playlists, single/four taps, focus cleanup, duplicate taps and storage failure/retry. Native UI/biometrics are mocked.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
