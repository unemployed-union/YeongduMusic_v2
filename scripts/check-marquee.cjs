/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..'), ts = require(path.join(root, 'node_modules/typescript'));
let states = [], slot = 0, effects = [], reduced = false, visible = true;
const appListener = state => { visible = state === 'active'; };
const shared = { value: 0, set(value) { this.value = value; }, get() { return typeof this.value === 'number' ? this.value : 0; } };
const jsx = (type, props) => ({ type, props });
const modules = {
  '@/features/playback/use-playback-visibility': { usePlaybackVisibility: () => visible },
  react: { memo: fn => fn, useState: initial => { const index = slot++; if (states[index] === undefined) states[index] = initial; return [states[index], value => { states[index] = value; }]; }, useEffect: fn => effects.push(fn) },
  'react/jsx-runtime': { jsx, jsxs: jsx },
  '@/components/text': { Text: 'Text' },
  '@/components/text': { Text: 'Text' },
  '@/components/text': { Text: 'Text' },
  'react-native': { Platform: { OS: 'android' }, View: 'View', Text: 'Text', StyleSheet: { create: value => value }, useWindowDimensions: () => ({ fontScale: 1 }) },
  '@react-native-masked-view/masked-view': { __esModule: true, default: 'MaskedView' },
  'expo-linear-gradient': { LinearGradient: 'Gradient' },
  'react-native-reanimated': { default: { View: 'AnimatedView' }, __esModule: true, cancelAnimation: () => {}, Easing: { linear: 'linear' }, useReducedMotion: () => reduced, useSharedValue: () => shared, useAnimatedStyle: fn => fn(), withTiming: (to, options) => ({ to, options }), withRepeat: (animation, count, reverse) => ({ animation, count, reverse }), withDelay: (delay, animation) => ({ delay, animation }) },
};
const mod = { exports: {} }, code = ts.transpileModule(fs.readFileSync(path.join(root, 'src/components/marquee-text.tsx'), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
new Function('require', 'module', 'exports', code)(name => modules[name], mod, mod.exports);
const render = (props = {}) => { slot = 0; effects = []; const node = mod.exports.MarqueeText({ text: 'Long music title', style: {}, ...props }); effects.forEach(fn => fn()); return node; };
let node = render(); assert.equal(shared.value, 0);
node.props.onLayout({ nativeEvent: { layout: { width: 120 } } });
node.props.children[0].props.onTextLayout({ nativeEvent: { lines: [{ width: 400 }] } });
node = render(); const animation = shared.value;
assert.equal(animation.delay, 1600); assert.equal(animation.animation.count, -1); assert.equal(animation.animation.reverse, false);
assert.equal(animation.animation.animation.to, -450); assert.equal(animation.animation.animation.options.easing, 'linear');
const copies = node.props.children[1].props.children;
assert.equal(copies[1].props.style[2].left, 450);
assert.equal(copies[1].props.children, copies[0].props.children);
assert.equal(450 + animation.animation.animation.to, 0, 'Right duplicate reaches original position for seamless reset');
assert.equal(node.props.accessibilityLabel, 'Long music title');
appListener('background'); render(); assert.equal(shared.value, 0);
appListener('active'); reduced = true; node = render(); assert.equal(shared.value, 0); assert.equal(node.props.children[1].props.children[1], false);
reduced = false; states[1] = 100; render(); assert.equal(shared.value, 0, 'Short title stays still');
node = render({ fadeEdges: true }); assert.equal(node.props.children[1].type, 'AnimatedView', 'Short titles stay fully visible');
states[1] = 402; node = render({ fadeEdges: true });
const mask = node.props.children[1];
assert.equal(mask.type, 'MaskedView'); assert.equal(mask.props.androidRenderingMode, 'hardware');
assert.deepEqual(mask.props.maskElement.props.locations, [0, 0.15, 0.85, 1], 'Only the 18px edges fade; the middle stays opaque');
assert.equal(mask.props.children.props.children[1].props.style[2].left, 450, 'Masking preserves the seamless marquee copies');
assert.equal(node.props.accessibilityLabel, 'Long music title');
modules['react-native'].Platform.OS = 'web'; node = render({ fadeEdges: true });
assert.match(node.props.children[1].props.style.maskImage, /linear-gradient/);
modules['react-native'].Platform.OS = 'android';
node = render({ fadeEdges: true, active: false }); assert.equal(shared.value, 0); assert.equal(node.props.children[1].type, 'AnimatedView');
reduced = true; node = render({ fadeEdges: true }); assert.equal(node.props.children[1].type, 'AnimatedView', 'Reduced motion does not fade the stationary title');
for (const file of ['src/features/playback/player-song-details.tsx', 'src/components/mini-player.tsx']) assert.match(fs.readFileSync(path.join(root, file), 'utf8'), /<MarqueeText\s+key={song.id \+ song.title}\s+text={song.title}/);
console.log('PASS: full/mini marquee, seamless leftward loop, optional hardware alpha/CSS edge masks, accessible title and short/reduced-motion/background guards. Native masking and UI-thread rendering are mocked.');
