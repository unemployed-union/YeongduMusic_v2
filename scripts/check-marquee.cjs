/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..'), ts = require(path.join(root, 'node_modules/typescript'));
let states = [], slot = 0, effects = [], reduced = false, appListener;
const shared = { value: 0, set(value) { this.value = value; }, get() { return typeof this.value === 'number' ? this.value : 0; } };
const jsx = (type, props) => ({ type, props });
const modules = {
  react: { memo: fn => fn, useState: initial => { const index = slot++; if (states[index] === undefined) states[index] = initial; return [states[index], value => { states[index] = value; }]; }, useEffect: fn => effects.push(fn) },
  'react/jsx-runtime': { jsx, jsxs: jsx },
  '@/components/text': { Text: 'Text' },
  '@/components/text': { Text: 'Text' },
  '@/components/text': { Text: 'Text' },
  'react-native': { AppState: { currentState: 'active', addEventListener: (_, listener) => { appListener = listener; return { remove() {} }; } }, View: 'View', Text: 'Text', StyleSheet: { create: value => value }, useWindowDimensions: () => ({ fontScale: 1 }) },
  'react-native-reanimated': { default: { View: 'AnimatedView' }, __esModule: true, cancelAnimation: () => {}, Easing: { linear: 'linear' }, useReducedMotion: () => reduced, useSharedValue: () => shared, useAnimatedStyle: fn => fn(), withTiming: (to, options) => ({ to, options }), withRepeat: (animation, count, reverse) => ({ animation, count, reverse }), withDelay: (delay, animation) => ({ delay, animation }) },
};
const mod = { exports: {} }, code = ts.transpileModule(fs.readFileSync(path.join(root, 'src/components/marquee-text.tsx'), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
new Function('require', 'module', 'exports', code)(name => modules[name], mod, mod.exports);
const render = () => { slot = 0; effects = []; const node = mod.exports.MarqueeText({ text: 'Long music title', style: {} }); effects.forEach(fn => fn()); return node; };
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
for (const file of ['src/app/player.tsx', 'src/components/mini-player.tsx']) assert.match(fs.readFileSync(path.join(root, file), 'utf8'), /<MarqueeText key={song.id \+ song.title} text={song.title}/);
console.log('PASS: shared full/mini marquee, negative/leftward continuous loop with right duplicate, accessible title, short/reduced-motion/background guards. UI-thread rendering is mocked.');
