/* global __dirname */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), ts = require('typescript');
const jsx = (type, props) => ({ type, props });
function load(file, mocks = {}, globals = {}) {
  mocks = { ...require('./test-cloud-fixtures.cjs').cloudFixtures(globals, mocks), '@/services/haptics': { playHaptic() {}, prepareHaptics() {} }, ...mocks };
  const exports = {}, code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'exports', ...Object.keys(globals), code)(name => { if (name in mocks) return mocks[name]; throw Error(name); }, exports, ...Object.values(globals)); return exports;
}
function hooks() {
  const slots = []; let index = 0, effects = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  return { react: {
    useContext: () => ({ current: 'screen-capture' }),
    useState: initial => { const i = index++; if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value; }]; },
    useRef: initial => { const i = index++; return slots[i] ??= { current: initial }; },
    useCallback: (fn, deps) => { const i = index++; if (!same(slots[i]?.deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect: (fn, deps) => { const i = index++; if (!same(slots[i]?.deps, deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
  }, render: work => { index = 0; effects = []; const result = work(); effects.forEach(fn => fn()); return result; }, unmount: () => slots.forEach(slot => slot.cleanup?.()) };
}
const nodes = value => Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === 'object' ? [value, ...nodes(value.props?.children)] : [];
const style = value => Object.assign({}, ...[value].flat(Infinity).filter(Boolean));
const palette = load('src/theme/tokens.ts', { 'react-native': {}, '@/stores/theme-preferences': {}, './mode': {} }).palette;
let scheme = 'light', blurEnabled = true, blurArea, blurStrength = 32; const timers = new Map(); let id = 0;
const native = { Platform: { OS: 'android' }, View: 'View', Pressable: 'Button', Modal: 'Modal', ScrollView: 'Scroll', Keyboard: { dismiss() {} }, StyleSheet: { create: value => value, hairlineWidth: 1 }, useWindowDimensions: () => ({ width: 390, height: 800 }) };
const ui = { 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native, '@/components/text': { Text: 'Text' }, './text': { Text: 'Text' },
  '@/stores/blur-preferences': { useBlurIntensity: area => { blurArea = area; return blurEnabled ? blurStrength : 0; } },
  '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Icon' }, '@/theme/tokens': { useColors: () => palette[scheme], useAppColorScheme: () => scheme },
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: 16, left: 0 }) },
  'expo-blur': { BlurView: 'BlurView' }, './screen-blur-target': { ScreenBlurTargetContext: {} },
  './action-menu-position': load('src/components/action-menu-position.ts') };
function menuModule(h) { return load('src/components/action-menu.tsx', { ...ui, react: h.react }, { setTimeout: fn => { timers.set(++id, fn); return id; }, clearTimeout: key => timers.delete(key) }); }
for (const os of ['android', 'ios']) {
  native.Platform.OS = os; const h = hooks(), menu = menuModule(h); let state = h.render(() => menu.useMenuAction());
  state.select('artwork'); state = h.render(() => menu.useMenuAction());
  assert.equal(state.visible, false); assert.equal(state.action, null, 'Dismiss the native menu before presenting an editor');
  if (os === 'ios') { assert.equal(timers.size, 0); state.onDismiss(); }
  else { const work = [...timers.values()]; timers.clear(); work.forEach(fn => fn()); }
  state = h.render(() => menu.useMenuAction()); assert.equal(state.action, 'artwork'); h.unmount();
}
native.Platform.OS = 'android';
{
  const h = hooks(), menu = menuModule(h); let state = h.render(() => menu.useMenuAction()); state.select('metadata'); h.render(() => menu.useMenuAction()); h.unmount(); assert.equal(timers.size, 0, 'Closing the owner cancels a queued handoff');
  for (const mode of ['light', 'dark']) {
    scheme = mode; let picked, closed = false;
    const appearanceHooks = hooks(), appearance = menuModule(appearanceHooks);
    const render = () => appearanceHooks.render(() => appearance.ActionMenu({ title: 'Song', anchor: { x: 150, y: 300 }, visible: true, onDismiss() {}, onClose: () => { closed = true; }, onSelect: value => { picked = value; }, items: [{ id: 'metadata', label: '메타데이터 수정', icon: 'create-outline' }] }));
    let tree = render(), card = nodes(tree).find(node => style(node.props?.style).width === 300);
    card.props.onLayout({ nativeEvent: { layout: { height: 260 } } }); tree = render(); card = nodes(tree).find(node => style(node.props?.style).width === 300);
    assert.equal(style(card.props.style).opacity, 1);
    assert.equal(style(card.props.style).backgroundColor, mode === 'light' ? '#FFFFFF40' : '#00000040', 'The card surface must allow the blur to show through');
    const blur = nodes(tree).find(node => node.type === 'BlurView');
    assert.equal(blurArea, 'libraryMenu');
    assert.equal(blur.props.intensity, 32, 'Library blur matches the player menu intensity'); assert.equal(blur.props.tint, mode);
    assert.equal(blur.props.blurTarget.current, 'screen-capture'); assert.equal(blur.props.blurMethod, 'dimezisBlurView', 'Android must receive the screen capture target');
    const option = nodes(tree).find(node => node.type === 'Button' && !node.props.accessibilityLabel);
    option.props.onPress(); assert.equal(picked, 'metadata');
    assert.equal(nodes(option).find(node => node.type === 'Text').props.style[1].color, palette[mode].text);
    nodes(tree).find(node => node.props?.accessibilityLabel === '작업 메뉴 닫기').props.onPress(); assert(closed);
    blurEnabled = false; tree = render();
    assert(!nodes(tree).some(node => node.type === 'BlurView'), 'Disabled blur unmounts the library blur view');
    card = nodes(tree).find(node => style(node.props?.style).width === 300);
    assert.equal(style(card.props.style).backgroundColor, palette[mode].surface, 'Disabled blur has a readable opaque themed surface');
    blurEnabled = true;
    blurStrength = 57; assert.equal(nodes(render()).find(node => node.type === 'BlurView').props.intensity, 57); blurStrength = 32;
  }
}
{
  const h = hooks(); let closed = 0;
  const Editor = load('src/features/metadata/metadata-editor.tsx', { ...ui, react: h.react, '@/features/playlists/dialogs': { PlaylistSheet: 'Sheet' },
    '@/features/artwork/song-artwork-editor': { SongArtworkEditor: 'ArtworkForm' }, './metadata-editor-form': { MetadataEditorForm: 'MetadataForm' } }).MetadataEditor;
  const render = () => h.render(() => Editor({ song: { id: 'song' }, onClose: () => { closed++; } }));
  let tree = render(); assert(nodes(tree).some(node => node.type === 'MetadataForm')); assert(!nodes(tree).some(node => node.type === 'ArtworkForm'), 'Artwork is loaded only on first visit');
  const tab = (tree, label) => nodes(tree).find(node => node.props?.accessibilityRole === 'tab' && nodes(node).some(child => child.type === 'Text' && child.props.children === label));
  tab(tree, '앨범아트').props.onPress(); tree = render();
  assert.equal(tree.props.title, '앨범아트 수정'); assert(nodes(tree).some(node => node.type === 'MetadataForm'), 'Keep the metadata draft mounted');
  assert(nodes(tree).find(node => node.type === 'View' && node.props.accessibilityElementsHidden).props.importantForAccessibility === 'no-hide-descendants');
  const artwork = nodes(tree).find(node => node.type === 'ArtworkForm'); artwork.props.onBusyChange(true); tree = render();
  assert(tab(tree, '곡 정보').props.disabled); tree.props.onClose(); assert.equal(closed, 0, 'Do not close an artwork file write in progress');
  artwork.props.onBusyChange(false); tree = render(); tab(tree, '곡 정보').props.onPress(); tree = render();
  assert.equal(tree.props.title, '메타데이터 수정'); assert(nodes(tree).some(node => node.type === 'ArtworkForm'), 'Keep artwork selection/search results mounted');
  nodes(tree).find(node => node.type === 'MetadataForm').props.onBusyChange(true); assert(tab(render(), '앨범아트').props.disabled);
  nodes(tree).find(node => node.type === 'MetadataForm').props.onSaved(); assert.equal(closed, 1);
}
{
  const h = hooks(); let selected = null;
  const Props = load('src/features/library/song-properties.tsx', { ...ui, react: h.react,
    '@/components/action-menu': { ActionMenu: 'Menu', useMenuAction: () => ({ action: selected, visible: !selected, select: value => { selected = value; } }) },
    '@/features/metadata/metadata-editor': { MetadataEditor: 'Editor' }, '@/features/playlists/dialogs': { AddToPlaylistDialog: 'Playlists' },
    '@/services/playback/controller': {}, '@/stores/hidden-music': { useHiddenMusicStore: () => ({ ready: true, profile: { presets: [] } }) }, '@/features/hidden-music/rules': { hiddenMatcher: () => () => false } }).SongProperties;
  const render = () => h.render(() => Props({ song: { id: 'song', title: 'Song' }, onClose() {} }));
  let tree = render(); assert.equal(tree.type, 'Menu'); assert.deepEqual(tree.props.items.map(item => item.id), ['playlist', 'queue', 'metadata', 'artwork']);
  tree.props.onSelect('artwork'); tree = render(); assert.equal(tree.type, 'Editor'); assert.equal(tree.props.initialTab, 'artwork');
  selected = 'playlist'; assert.equal(render().type, 'Playlists', 'Playlist creation/list selection is shown only after selecting that action');
}
const themed = load('src/features/playback/menu-styles.ts').themedMenuStyles;
for (const mode of ['light', 'dark']) {
  const colors = palette[mode], result = themed({ input: {}, label: {}, heading: {}, description: {}, selected: {} }, colors);
  assert.equal(result.label.color, colors.text); assert.equal(result.input.borderColor, colors.separator); assert.equal(result.description.color, colors.muted);
}
{
  const animation = { duration: () => animation, easing: () => animation, withInitialValues: () => animation, withTargetValues: () => animation };
  const PlayerMenu = load('src/features/playback/player-menu.tsx', { ...ui,
    react: { useState: value => [typeof value === 'function' ? value() : value, () => {}], useEffect() {} },
    'react-native-reanimated': { __esModule: true, default: { View: 'AnimatedView' }, Easing: { out: value => value, in: value => value }, FadeIn: animation, FadeOut: animation, FadeInDown: animation, FadeOutDown: animation },
    'expo-blur': { BlurView: 'Blur' }, 'expo-router': {},
    '@/stores/playback': { usePlaybackStore: select => select({ sleepTimer: null, sectionRepeat: null, playbackRate: 1 }) },
    '@/stores/offline-music': { useOfflineMusicStore: select => select({ busy: false }) },
    '@/stores/menu-preferences': { useMenuPreferences: select => select({ layout: { player: [{ id: 'edit-metadata', visible: true }] } }) },
    '@/features/settings/menu-layout': load('src/features/settings/menu-layout.ts'), '@/services/playback/section-repeat': {},
    './sleep-timer-options': {}, './section-repeat-options': {}, './playback-speed-options': {},
  }).PlayerMenu;
  for (const mode of ['light', 'dark']) {
    scheme = mode;
    const props = { panel: 'artwork', bottom: 100, maxHeight: 400, onClose() {}, onSelect() {} };
    const tree = PlayerMenu(props);
    assert.equal(blurArea, 'playerMenu');
    assert.equal(nodes(tree).some(node => node.type === 'Blur'), mode === 'dark', 'Light player menus use an opaque white surface');
    if (mode === 'light') assert(nodes(tree).some(node => node.type === 'View' && style(node.props.style).backgroundColor === '#FFFFFF'));
    assert.equal(style(nodes(tree).find(node => node.type === 'Text' && node.props.children === '메타데이터 수정').props.style).color, palette[mode].text);
    blurEnabled = false; const opaqueMenu = PlayerMenu(props);
    assert(!nodes(opaqueMenu).some(node => node.type === 'Blur'));
    assert(nodes(opaqueMenu).some(node => node.type === 'View' && style(node.props.style).backgroundColor === palette[mode].surface));
    blurEnabled = true;
    if (mode === 'dark') { blurStrength = 68; assert.equal(nodes(PlayerMenu(props)).find(node => node.type === 'Blur').props.intensity, 68); blurStrength = 32; }
  }
}
console.log('PASS: Android/iOS modal handoff and cleanup, song action selection, lazy separate editors, retained drafts/artwork results, busy-write guards, accessible hidden tabs and light/dark menu/input contrast. Native presentation is mocked.');
