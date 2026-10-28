/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
function read(file, modules = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), exports = {};
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'exports', code)(name => { assert(name in modules, name); return modules[name]; }, exports);
  return exports;
}
const layout = read('src/theme/layout.ts'), safe = { top: 24, bottom: 20, left: 0, right: 0 };
for (const [width, height, split] of [[390, 844, false], [768, 1024, false], [1024, 768, true], [1280, 894, true], [1366, 1024, true], [540, 900, false], [900, 600, true], [1920, 1080, true]]) {
  const value = layout.playerLayout(width, height, safe);
  assert.equal(value.split, split, `${width}x${height}`);
  assert(value.primaryWidth <= value.contentWidth);
  assert(value.artworkSize <= value.primaryWidth);
  assert(value.primaryWidth + value.gap <= value.contentWidth);
  if (split) assert(value.contentWidth - value.primaryWidth - value.gap >= 300, 'Secondary content retains a usable width');
}
const notched = layout.playerLayout(844, 390, { ...safe, left: 44, right: 44 });
assert.equal(notched.split, true); assert(notched.contentWidth <= 844 - 88 - 58);
assert(layout.playerLayout(1280, 800, safe, 2).artworkSize < layout.playerLayout(1280, 800, safe).artworkSize);
for (const width of [320, 390, 540, 768, 1024, 1280, 1920]) {
  for (const albums of [true, false]) {
    for (const spacious of [false, true]) {
    const grid = layout.libraryGrid(width, albums, spacious);
    assert(Math.abs(grid.itemWidth * grid.columns + grid.gap * (grid.columns - 1) - (width - 44)) < 0.001, 'Cards fit without clipping');
    assert(grid.itemWidth > 0);
    }
  }
}
assert.equal(layout.libraryGrid(390, true).columns, 2);
assert(layout.libraryGrid(1280, true).columns >= 5);
assert.equal(layout.libraryGrid(390, false).columns, 1);
assert.equal(layout.libraryGrid(1024, false).columns, 2);

// Render the real player shell with native/audio leaves stubbed. Changing its
// geometry must not construct another playback engine or replace the queue.
const source = fs.readFileSync(path.join(__dirname, '../src/features/playback/player-screen.tsx'), 'utf8');
const ast = ts.createSourceFile('player.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const modules = {};
for (const statement of ast.statements) if (ts.isImportDeclaration(statement) && statement.importClause) {
  const clause = statement.importClause, leaf = { __esModule: true };
  if (clause.name) leaf.default = clause.name.text;
  if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) for (const binding of clause.namedBindings.elements) leaf[(binding.propertyName ?? binding.name).text] = binding.name.text;
  modules[statement.moduleSpecifier.text] = leaf;
}
let dimensions = { width: 1280, height: 894, fontScale: 1 }, cursor = 0, platform = 'android';
const slots = [], commands = [], queue = [{ id: 'one', title: 'Song', artist: 'Artist', duration: 180 }];
let activeSlots = slots;
const state = { queue, index: 0, playing: true, buffering: false, error: null, sectionRepeat: null, position: 30, duration: 180 };
const seekRequests = [];
Object.assign(modules, {
  react: { useRef: initial => activeSlots[cursor++] ??= { current: initial }, useCallback: fn => fn, useState: initial => {
    const index = cursor++; if (!(index in activeSlots)) activeSlots[index] = initial;
    const owner = activeSlots;
    return [owner[index], value => { owner[index] = typeof value === 'function' ? value(owner[index]) : value; }];
  } },
  'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
  'react-native': { Platform: { get OS() { return platform; } }, View: 'View', Pressable: 'Button', ScrollView: 'ScrollView', FlatList: 'List', ActivityIndicator: 'Spinner', StyleSheet: { create: value => value }, useWindowDimensions: () => dimensions },
  'react-native-reanimated': { __esModule: true, default: { View: 'AnimatedView' } },
  'react-native-gesture-handler': { Gesture: { Race: () => ({}) }, GestureDetector: 'Gesture' },
  'react-native-safe-area-context': { useSafeAreaInsets: () => safe },
  'expo-router': { useFocusEffect() {}, router: {} }, '@/theme/layout': layout,
  '@/features/playback/use-player-dismiss': { usePlayerDismiss: () => ({ ready: {}, closing: { get: () => false }, gesture: {}, animatedStyle: {} }) },
  '@/features/playback/use-artwork-swipe': { useArtworkSwipe: () => ({ gesture: {}, animatedStyle: {} }) },
  '@/features/playback/use-artwork-colors': { useArtworkColors: () => ['#111111', '#222222', '#333333'] },
  '@/features/playback/use-playback-visibility': { usePlaybackVisibility: () => true },
  '@/features/library/load-song-library': { artistName: name => name },
  '@/theme/use-player-colors': { usePlayerAccent: () => ({ accent: '#FFFFFF', highlight: '#FF9BAE' }) },
  '@/theme/liquid-glass': { useLiquidGlass: () => ({ supported: false, enabled: false }) },
  '@/stores/playback': { usePlaybackStore: select => select(state) },
  '@/stores/auth': { useAuthStore: select => select({ mode: 'mock' }) },
  '@/services/haptics': { playHaptic() {} },
  '@/services/playback/controller': { playQueue: (...args) => commands.push(args), seek: value => new Promise(resolve => { seekRequests.push({ value, resolve }); }) },
});
modules['./player-screen-styles'] = read('src/features/playback/player-screen-styles.ts', modules);
modules['./player-progress'] = read('src/features/playback/player-progress.tsx', { ...modules,
  '@react-native-community/slider': { __esModule: true, default: 'Slider' },
  '@react-native-masked-view/masked-view': { __esModule: true, default: 'MaskedView' },
});
Object.assign(modules, {
  '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Ionicons' },
  '@/components/glass-backdrop': { GlassBackdrop: 'GlassBackdrop' },
  '@/components/scroll-edge-fade': { ScrollEdgeFade: 'ScrollEdgeFade' },
  '@/components/marquee-text': { MarqueeText: 'MarqueeText' },
  '@/components/favorite-button': { FavoriteButton: 'FavoriteButton' },
  './lossless-badge': { LosslessBadge: 'LosslessBadge' },
});
modules['./player-queue'] = read('src/features/playback/player-queue.tsx', modules);
modules['./player-song-details'] = read('src/features/playback/player-song-details.tsx', modules);
modules['./player-header'] = read('src/features/playback/player-header.tsx', modules);
const presentational = new Set([modules['./player-header'].PlayerHeader, modules['./player-queue'].PlayerQueue, modules['./player-song-details'].PlayerSongDetails]);
const Screen = read('src/features/playback/player-screen.tsx', modules).PlayerScreen;
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(presentational.has(tree.type) ? tree.type(tree.props) : tree.props?.children)] : [];
const render = () => { cursor = 0; return Screen(); };
let tree = render();
assert.equal(nodes(tree).filter(node => node.type === 'Artwork').length, 1);
assert.equal(nodes(tree).filter(node => node.type === 'LyricsPanel').length, 1);
assert.equal(nodes(tree).filter(node => node.type === 'FavoriteButton').length, 1, 'Only one set of playback controls is mounted');
nodes(tree).find(node => node.props?.accessibilityLabel === '대기열').props.onPress(); tree = render();
assert.equal(nodes(tree).filter(node => node.type === 'Artwork').length, 1, 'Album art remains visible beside the queue');
assert.equal(nodes(tree).filter(node => node.type === 'LyricsPanel').length, 0);
assert.equal(nodes(tree).filter(node => node.type === 'List').length, 1);
dimensions = { ...dimensions, width: 540, height: 900 }; tree = render();
assert.equal(nodes(tree).filter(node => node.type === 'List').length, 1, 'Split-screen resizing retains the chosen panel');
assert.equal(nodes(tree).filter(node => node.type === 'Artwork').length, 0);
nodes(tree).find(node => node.props?.accessibilityLabel === '대기열').props.onPress(); tree = render();
assert.equal(nodes(tree).filter(node => node.type === 'Artwork').length, 1);
assert.equal(nodes(tree).filter(node => node.type === 'LyricsPanel').length, 0);
assert.equal(commands.length, 0, 'Rotation and panel switches never reload audio');
assert.equal(state.queue, queue);
const flatten = value => Object.assign({}, ...[value].flat(Infinity).filter(Boolean));
const bottom = tree => nodes(tree).find(node => node.props?.ref && node.props.onLayout);
assert.equal(flatten(bottom(tree).props.style).paddingBottom, 90, 'Android retains its original vertical layout');
platform = 'ios'; tree = render();
assert.equal(flatten(bottom(tree).props.style).paddingBottom, 56, 'iOS lifts the controls below the artwork another 12pt while retaining the compact layout override');
const progress = nodes(tree).find(node => typeof node.type === 'function' && node.type.name === 'PlayerProgress');
const progressSlots = [];
const progressView = (active = true) => {
  activeSlots = progressSlots; cursor = 0;
  const result = progress.type({ ...progress.props, active }); activeSlots = slots; return result;
};
const slider = tree => nodes(tree).find(node => node.type === 'Slider');
const mask = tree => nodes(tree).find(node => node.type === 'MaskedView');
let bar = slider(progressView());
assert.equal(flatten(bar.props.style).width, 482); assert.equal(flatten(bar.props.style).marginLeft, 0);
assert.equal(flatten(bar.props.style).height, 44); assert.equal(bar.props.tapToSeek, true);
assert.equal(bar.props.thumbTintColor, 'transparent', 'The idle iOS thumb is invisible');
assert.equal(flatten(mask(progressView()).props.maskElement.props.style).backgroundColor, 'transparent', 'Mask the entire native rendering so UIKit cannot leave a thumb outline or shadow');
bar.props.onSlidingStart(30); bar = slider(progressView());
assert.equal(bar.props.thumbTintColor, 'transparent', 'Picking up the slider never reveals its thumb');
assert.equal(flatten(mask(progressView()).props.maskElement.props.style).backgroundColor, 'transparent', 'UIKit remains fully masked while scrubbing');
bar.props.onValueChange(65);
assert.equal(slider(progressView()).props.value, 65, 'Dragging previews the selected position');
assert(nodes(progressView()).some(node => flatten(node.props?.style).width === `${65 / 180 * 100}%`), 'The visible track follows the drag preview while the native thumb stays masked');
bar.props.onSlidingComplete(65); bar = slider(progressView());
assert.equal(bar.props.thumbTintColor, 'transparent'); assert.equal(bar.props.value, 65, 'Keep the preview until the engine completes seeking');
assert.equal(flatten(mask(progressView()).props.maskElement.props.style).backgroundColor, 'transparent', 'Releasing hides the native thumb before the seek completes');
assert.equal(seekRequests.at(-1).value, 65);
bar.props.onSlidingStart(70); bar.props.onValueChange(80); bar.props.onTouchCancel();
assert.equal(slider(progressView()).props.value, 30); assert.equal(slider(progressView()).props.thumbTintColor, 'transparent');
assert.equal(flatten(mask(progressView()).props.maskElement.props.style).backgroundColor, 'transparent', 'Canceled touches restore the fully masked idle state');
bar.props.onSlidingStart(30); progressView(false); assert.equal(slider(progressView(false)).props.thumbTintColor, 'transparent', 'Losing focus hides the thumb');
assert.equal(flatten(mask(progressView(false)).props.maskElement.props.style).backgroundColor, 'transparent');
platform = 'android'; bar = slider(progressView());
assert.equal(flatten(bar.props.style).width, 510); assert.equal(flatten(bar.props.style).marginLeft, -14);
assert.equal(bar.props.thumbTintColor, '#FFFFFF'); assert.equal(bar.props.onTouchStart, undefined);
assert.equal(mask(progressView()), undefined, 'Android retains its unmasked native slider');
platform = 'ios'; dimensions = { width: 320, height: 568, fontScale: 2 }; tree = render();
assert(nodes(tree).some(node => node.type === 'ScrollView'), 'Small windows and large text keep the scrollable layout');
assert.equal(flatten(bottom(tree).props.style).paddingBottom, 8);
const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../app.json'), 'utf8')).expo;
assert.equal(config.orientation, 'default'); assert.equal(config.ios.supportsTablet, true);
console.log('PASS: tablet/phone/notch/split-screen geometry, responsive grids, queue switching, iOS seek-bar alignment, always-hidden iOS thumb, drag preview/cancel/focus reset, balanced footer and unchanged Android layout. Native rendering is not exercised.');
(async () => {
  let bar = slider(progressView());
  bar.props.onSlidingStart(10); bar.props.onSlidingComplete(40);
  const older = seekRequests.at(-1);
  bar = slider(progressView()); bar.props.onSlidingStart(50); bar.props.onValueChange(70);
  older.resolve(); await Promise.resolve();
  assert.equal(slider(progressView()).props.value, 70, 'A completed older seek cannot erase the current drag');
  bar = slider(progressView()); bar.props.onSlidingComplete(80);
  state.position = 80; seekRequests.at(-1).resolve(); await Promise.resolve();
  state.position = 81;
  assert.equal(slider(progressView()).props.value, 81, 'The progress bar follows the engine again after seeking');
  console.log('PASS: seek completion retention and stale seek protection while scrubbing.');
})().catch(error => { console.error(error); process.exitCode = 1; });
