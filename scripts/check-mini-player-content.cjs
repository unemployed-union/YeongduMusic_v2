/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { createStore } = require('zustand/vanilla');

function load(file, modules) {
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'exports', code)((name) => {
    assert(name in modules, 'Unexpected dependency: ' + name);
    return modules[name];
  }, exports);
  return exports;
}

function nodes(tree) {
  if (Array.isArray(tree)) {
    return tree.flatMap(nodes);
  }
  if (tree && typeof tree === 'object') {
    return [tree, ...nodes(tree.props?.children)];
  }
  return [];
}

const jsx = (type, props) => ({ type, props });
const first = { id: 'first', title: '아주 긴 제목 '.repeat(40), artist: '아티스트' };
const second = { id: 'second', title: '다음 곡', artist: '다른 아티스트' };
const store = createStore(() => ({ queue: [first, second], index: 0, playing: false, buffering: false, position: 47 }));
const playback = () => { throw Error('Accessory content must not subscribe to playback'); };
playback.getState = store.getState;
const commands = [];
const gestures = [];
const colors = { text: '#ffffff', muted: '#bbbbbb', chromeMuted: '#aaaaaa', tint: '#ff5577', miniControl: '#222222' };
const modules = {
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'react-native': { useWindowDimensions: () => ({ fontScale: 1 }), View: 'View', Pressable: 'Button', ActivityIndicator: 'Spinner', Platform: { OS: 'ios' }, StyleSheet: { create: value => value } },
  '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Icon' },
  'react-native-gesture-handler': {
    GestureDetector: 'Gesture',
    Gesture: { Pan: () => {
      const gesture = {};
      for (const key of ['enabled', 'activeOffsetY', 'failOffsetY', 'failOffsetX', 'runOnJS']) {
        gesture[key] = () => gesture;
      }
      gesture.onEnd = callback => { gesture.end = callback; return gesture; };
      gestures.push(gesture);
      return gesture;
    } },
  },
  'expo-router': { router: { push: route => commands.push(['navigate', route]) } },
  './text': { Text: 'Text' },
  './artwork': { Artwork: 'Artwork' },
  './playback-glyph': { PlaybackGlyph: 'Glyph' },
  './marquee-text': { MarqueeText: 'Marquee' },
  '@/services/haptics': { playHaptic: () => {} },
  '@/stores/playback': { usePlaybackStore: playback },
  '@/stores/player-background': { usePlayerBackgroundStore: { getState: () => ({ selectArtwork: song => commands.push(['artwork', song.id]) }) } },
  '@/services/playback/controller': {
    togglePlayback: () => {
      commands.push(['toggle']);
      store.setState({ playing: !store.getState().playing });
    },
    next: async () => {
      commands.push(['next']);
      store.setState({ index: 1, position: 0 });
    },
  },
};
const { MiniPlayerContent } = load('src/components/mini-player-content.tsx', modules);
function snapshot() {
  const state = store.getState();
  return { song: state.queue[state.index], playing: state.playing, buffering: state.buffering, active: true, colors, glassSupported: true, glassEnabled: true, embedded: true };
}
const action = (tree, label) => nodes(tree).find(node => node.type === 'Button' && node.props.accessibilityLabel === label);
let regular = MiniPlayerContent(snapshot());
let inline = MiniPlayerContent({ ...snapshot(), compact: true });
assert.equal(commands.length, 0, 'Mounting two placements never sends a playback command');
assert(action(regular, '다음 곡'));
assert(!action(inline, '다음 곡'));
assert.equal(nodes(regular).filter(node => node.type === 'Text').length, 2);
assert.equal(nodes(inline).filter(node => node.type === 'Text').length, 1);
assert(!nodes(regular).some(node => node.type === 'Marquee'), 'Two native accessory instances do not start duplicate marquee timers or AppState subscriptions');
assert.equal(nodes(inline).find(node => node.type === 'Text').props.numberOfLines, 1);
assert.equal(action(inline, `${first.title}, ${first.artist}`).props.accessibilityLabel, `${first.title}, ${first.artist}`, 'VoiceOver retains the full title when the visual label truncates');
for (const tree of [regular, inline]) {
  for (const button of nodes(tree).filter(node => node.type === 'Button')) {
    assert(!nodes(button.props.children).some(node => node.type === 'Button'), 'Playback actions are siblings, never nested inside the player-open button');
  }
}
action(inline, '재생').props.onPress();
assert.deepEqual(commands, [['toggle']], 'One inline tap sends one command and does not open the full-screen player');
assert.equal(store.getState().position, 47);
regular = MiniPlayerContent(snapshot());
inline = MiniPlayerContent({ ...snapshot(), compact: true });
assert(action(regular, '일시정지'));
assert(action(inline, '일시정지'), 'Both placements reflect the same store after an update');
action(regular, '다음 곡').props.onPress();
assert.equal(store.getState().index, 1);
inline = MiniPlayerContent({ ...snapshot(), compact: true });
assert.equal(nodes(inline).find(node => node.type === 'Artwork').props.item.id, 'second');
action(inline, `${second.title}, ${second.artist}`).props.onPress();
assert.deepEqual(commands.slice(-2), [['artwork', 'second'], ['navigate', '/player']]);
gestures.at(-1).end({ translationY: -50, velocityY: -700 }, true);
assert.equal(commands.filter(command => command[0] === 'navigate').length, 2, 'Upward gesture still opens the shared full-screen player');
store.setState({ buffering: true });
assert(nodes(MiniPlayerContent(snapshot())).some(node => node.type === 'Spinner'));
assert.equal(action(MiniPlayerContent(snapshot()), '일시정지').props.accessibilityState.busy, true);
assert.equal(nodes(MiniPlayerContent({ ...snapshot(), largeText: true })).filter(node => node.type === 'Text').length, 1, 'Larger text uses one row inside UIKit fixed accessory height');
const legacy = MiniPlayerContent({ ...snapshot(), embedded: false, glassSupported: false, glassEnabled: false });
assert(nodes(legacy).some(node => node.type === 'Marquee'));
assert(!action(legacy, '다음 곡'), 'Standalone Android/older-iOS controls stay unchanged');

const screenStyles = load('src/features/playback/player-screen-styles.ts', modules);
const playerModules = {
  ...modules,
  '@/components/glass-backdrop': { GlassBackdrop: 'Glass' },
  './player-screen-styles': screenStyles,
};
const { PlayerHeader } = load('src/features/playback/player-header.tsx', playerModules);
const headerActions = [];
const header = split => PlayerHeader({
  width: 300, split, showQueue: true,
  onClose: () => headerActions.push('close'),
  onShowLyrics: () => headerActions.push('lyrics'),
  onToggleQueue: () => headerActions.push('queue'),
});
for (const split of [false, true]) {
  const tree = header(split);
  assert.equal(nodes(tree).filter(node => node.type === 'Glass').length, 0, 'Player header icons never have Liquid Glass backgrounds');
  for (const button of nodes(tree).filter(node => node.type === 'Button')) {
    const style = Object.assign({}, ...button.props.style.flat(Infinity).filter(Boolean));
    assert.equal(style.backgroundColor, 'transparent');
    assert.equal(style.width, 44);
    assert.equal(style.height, 44);
  }
}
action(header(false), '플레이어 닫기').props.onPress();
action(header(true), '가사 보기').props.onPress();
action(header(false), '대기열').props.onPress();
assert.deepEqual(headerActions, ['close', 'lyrics', 'queue']);
assert.equal(action(header(false), '대기열').props.accessibilityState.selected, true);
const { PlayerSongDetails } = load('src/features/playback/player-song-details.tsx', {
  ...playerModules,
  '@/components/marquee-text': { MarqueeText: 'Marquee' },
  '@/components/text': { Text: 'Text' },
  '@/components/favorite-button': { FavoriteButton: 'Favorite' },
  './lossless-badge': { LosslessBadge: 'LosslessBadge' },
});
const openedMenus = [];
const detailsProps = {
  song: snapshot().song, artist: 'Artist', highlight: '#FFFFFF', menu: null,
  onOpenMenu: kind => openedMenus.push(kind),
};
const details = PlayerSongDetails(detailsProps);
assert(!nodes(details).some(node => node.type === 'Glass'), 'Player options use an icon without glass');
const menuButton = action(details, '재생 메뉴 열기');
assert.equal(nodes(menuButton).find(node => node.type === 'Icon').props.name, 'ellipsis-horizontal');
menuButton.props.onPress();
assert.deepEqual(openedMenus, ['playback']);
modules['react-native'].Platform.OS = 'android';
assert.equal(nodes(action(PlayerSongDetails(detailsProps), '재생 메뉴 열기')).find(node => node.type === 'Icon').props.name, 'ellipsis-horizontal-circle', 'Android keeps its existing icon');
console.log('PASS: simultaneous accessory placements, shared snapshots, single playback commands, sibling touch targets, long titles, large text, buffering, next/open/swipe controls, standalone fallback and plain iOS header/options buttons. Native layout/rendering is not simulated.');
