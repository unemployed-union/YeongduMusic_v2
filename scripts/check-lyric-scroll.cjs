/* global __dirname */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), ts = require('typescript');
const slots = []; let cursor = 0, effects = [], state, active = 2, synced = true, layoutKey;
const frames = new Map(), timers = new Map(), scrolls = [], probes = [];
let nextId = 0, nativeAnimation = null, visualY = 0, reduceMotion = false;
const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
const react = {
  useRef: initial => slots[cursor++] ??= { current: initial },
  useState: initial => {
    const index = cursor++; slots[index] ??= { value: initial };
    return [slots[index].value, value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value; }];
  },
  useCallback: (fn, deps) => { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { fn, deps }; return slots[index].fn; },
  useEffect: (fn, deps) => { const index = cursor++; if (!same(slots[index]?.deps, deps)) effects.push(() => { slots[index]?.cleanup?.(); slots[index] = { deps, cleanup: fn() }; }); },
};
const nativeList = { scrollToIndex: args => { probes.push(args); state.onScrollToIndexFailed({ index: args.index, averageItemLength: 70 }); } };
const animatedRef = Object.assign(() => {}, { current: nativeList });
const animation = {
  useAnimatedRef: () => animatedRef,
  useReducedMotion: () => reduceMotion,
  useSharedValue: initial => {
    const ref = react.useRef(null);
    if (!ref.current) {
      ref.current = { value: initial, get() { return this.value; }, set(value) { this.value = value; } };
    }
    return ref.current;
  },
  useAnimatedScrollHandler: callbacks => callbacks,
  scrollTo: (_ref, _x, y, animated) => {
    scrolls.push({ y, animated, from: visualY });
    if (animated) nativeAnimation = { from: visualY, to: y };
    else { nativeAnimation = null; visualY = y; state?.onScroll.onScroll({ contentOffset: { y } }); }
  },
};
const jsx = (type, props) => ({ type, props });
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/features/lyrics/use-lyric-scroll.tsx'), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const exportsObject = {}, mocks = { react, 'react-native': { View: 'View' }, 'react-native-reanimated': animation,
  'react-native-worklets': { scheduleOnUI: (fn, ...args) => fn(...args) }, 'react/jsx-runtime': { jsx, jsxs: jsx } };
new Function('require', 'exports', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', code)(
  name => { assert(name in mocks, name); return mocks[name]; }, exportsObject,
  fn => { const id = ++nextId; frames.set(id, fn); return id; }, id => frames.delete(id),
  fn => { const id = ++nextId; timers.set(id, fn); return id; }, id => timers.delete(id),
);
function render() { cursor = 0; effects = []; state = exportsObject.useLyricScroll(active, synced, layoutKey); effects.forEach(fn => fn()); return state; }
function frame() { const work = [...frames.values()]; frames.clear(); work.forEach(fn => fn()); }
function animate(fraction) {
  assert(nativeAnimation);
  visualY = nativeAnimation.from + (nativeAnimation.to - nativeAnimation.from) * fraction;
  state.onScroll.onScroll({ contentOffset: { y: visualY } });
  if (fraction === 1) { nativeAnimation = null; state.onScroll.onMomentumEnd(); }
}
function beginDrag() { nativeAnimation = null; state.onScroll.onBeginDrag(); }
function measure(index, y, height = 70) {
  let forwarded = false;
  const cell = state.CellRenderer({ index, style: { flex: 1 }, children: 'line', onLayout: () => { forwarded = true; } });
  cell.props.onLayout({ nativeEvent: { layout: { y, height } } });
  assert(forwarded, 'Forward native layout events so virtualization remains correct');
}
render(); state.onLayout({ nativeEvent: { layout: { height: 400 } } }); state.onContentSizeChange(300, 3000);
measure(2, 200); measure(3, 270); frame();
assert.equal(scrolls.at(-1).y, 117.5); assert.equal(scrolls.at(-1).animated, true); assert.equal(probes.length, 0);
const scrollCount = scrolls.length;
for (const fraction of [0.1, 0.2, 0.3, 0.4, 0.5]) animate(fraction);
const midway = visualY; assert(midway > 0 && midway < 117.5);
assert.equal(scrolls.length, scrollCount, 'Native animation frames do not issue repeated scroll commands');
state.onContentSizeChange(300, 3200); frame();
assert.equal(scrolls.length, scrollCount, 'Content changes must not restart or snap an unchanged animation');
active = 3; render(); frame();
assert.equal(scrolls.at(-1).y, 187.5);
assert.equal(nativeAnimation.from, midway, 'A new line continues smoothly from the current visual position');
animate(1); assert.equal(visualY, 187.5); assert(scrolls.every(item => item.animated === true), 'Normal line changes use one native smooth scroll each');
const originalCell = state.CellRenderer, originalLayout = state.onLayout, originalContent = state.onContentSizeChange, originalFailure = state.onScrollToIndexFailed;
layoutKey = { translation: 'two lines' }; render();
measure(3, 310, 130); frame();
assert.equal(state.CellRenderer, originalCell, 'Do not remount virtualized cells at each timestamp or translation change');
assert.equal(state.onLayout, originalLayout); assert.equal(state.onContentSizeChange, originalContent); assert.equal(state.onScrollToIndexFailed, originalFailure);
assert.equal(scrolls.at(-1).y, 242.5, 'Translated, variable-height rows remain aligned');
beginDrag(); const dragCommands = scrolls.length;
state.onScrollBeginDrag(); render(); assert.equal(state.following, false);
const beforeDrag = scrolls.length; assert.equal(beforeDrag, dragCommands, 'No freezing command interferes with a native drag');
active = 2; render(); measure(2, 250); state.onContentSizeChange(300, 3300); frame();
assert.equal(scrolls.length, beforeDrag, 'Manual scrolling is never overridden by timestamps or layout events');
visualY = 600; state.onScroll.onScroll({ contentOffset: { y: visualY } }); state.resume(); render(); frame();
assert.equal(state.following, true); assert.equal(nativeAnimation.from, 600, 'Resume starts at the user-scrolled position');
animate(1);
active = 60; render(); frame(); assert.equal(probes.at(-1).index, 60); assert.equal(timers.size, 1);
beginDrag(); state.onScrollBeginDrag(); render(); assert.equal(timers.size, 0); assert.equal(frames.size, 0);
const probeCount = probes.length; frame(); assert.equal(probes.length, probeCount, 'A pending distant-seek retry cannot override a later drag');
state.resume(); render(); frame(); measure(60, 3000); frame(); animate(1);
assert.equal(scrolls.at(-1).y, 2900, 'Clamp the last line to the actual scrollable content');
synced = false; render(); const plainCount = scrolls.length; measure(60, 2900); frame(); assert.equal(scrolls.length, plainCount, 'Plain lyrics do not follow playback');
synced = true; active = 80; render(); frame();
while (timers.size) { const work = [...timers.values()]; timers.clear(); work.forEach(fn => fn()); frame(); }
assert(probes.filter(item => item.index === 80).length <= 3, 'Unmeasured seeks have bounded retries');
reduceMotion = true; active = 1; render(); measure(1, 200); frame(); assert.equal(scrolls.at(-1).animated, false, 'Reduced motion skips smooth scrolling');
reduceMotion = false; active = 3; render(); frame(); assert(nativeAnimation);
animate(0.5); const unmountPosition = visualY;
slots.forEach(slot => slot.cleanup?.()); assert.equal(nativeAnimation, null); assert.equal(scrolls.at(-1).y, unmountPosition); assert.equal(frames.size, 0); assert.equal(timers.size, 0);
console.log('PASS: one native smooth-scroll command per measured line, no per-frame commands/restarts, stable callbacks/cells, variable-height translations, drag/resume, distant seeks, bounded retries, reduced motion, plain lyrics and unmount cleanup. Native rendering/animation frames are mocked.');
