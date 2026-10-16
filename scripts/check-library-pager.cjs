/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', 'src/features/library/library-pager.tsx'), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function shared(initial) {
  return { value: initial, animation: null, get() { return this.value; }, set(next) { if (next?.animation) this.animation = next; else this.value = next; },
    finish() { const animation = this.animation; this.animation = null; if (animation) { this.value = animation.value; animation.callback?.(true); } } };
}
function harness() {
  const slots = [], effects = [], cleanups = [], pending = [], pages = [];
  let slot = 0, starts = 0, visible = true;
  const pan = () => {
    const gesture = { options: {}, handlers: {} };
    for (const name of ['enabled', 'maxPointers', 'activeOffsetX', 'failOffsetY']) gesture[name] = value => { gesture.options[name] = value; return gesture; };
    for (const name of ['onStart', 'onUpdate', 'onEnd', 'onFinalize']) gesture[name] = fn => { gesture.handlers[name] = fn; return gesture; };
    return gesture;
  };
  const jsx = (type, props) => ({ type, props });
  const modules = {
    '@/features/playback/use-playback-visibility': { usePlaybackVisibility: () => visible },
    react: { useCallback: fn => fn, useMemo: fn => fn(), useRef: initial => slots[slot++] ??= { current: initial },
      useEffect: (fn, deps) => { const i = slot++; if (!slots[i] || deps.some((dep, j) => dep !== slots[i][j])) effects.push(fn); slots[i] = deps; } },
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': { View: 'View', StyleSheet: { create: value => value } },
    'react-native-gesture-handler': { Gesture: { Pan: pan }, GestureDetector: 'Detector' },
    'react-native-reanimated': { __esModule: true, default: { View: 'Row' }, useSharedValue: initial => slots[slot++] ??= shared(initial), useAnimatedStyle: fn => fn,
      withTiming: (value, config, callback) => ({ animation: true, value, callback }), cancelAnimation: value => { const old = value.animation; value.animation = null; old?.callback?.(false); } },
    'react-native-worklets': { scheduleOnRN: (fn, ...args) => pending.push(() => fn(...args)) },
  };
  const exports = {};
  new Function('require', 'exports', code)(name => { if (!(name in modules)) throw Error('Unexpected dependency ' + name); return modules[name]; }, exports);
  let props = { width: 400, pageCount: 3, pageIndex: 0, layoutKey: 'albums:songs:artists', onPageChange: index => pages.push(index), onSwipeStart: () => { starts++; } };
  const render = next => { props = { ...props, ...next }; slot = 0; const tree = exports.LibraryPager(props);
    for (const effect of effects.splice(0)) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); } return tree; };
  const flush = () => pending.splice(0).forEach(fn => fn());
  return { render, flush, pages, setVisible: value => { visible = value; }, offset: () => slots[0], get starts() { return starts; }, unmount: () => cleanups.forEach(fn => fn()) };
}
// Model the documented pre-activation thresholds; once activated, the axis stays fixed.
function drag(tree, moves, velocityX = 0, success = true) {
  const gesture = tree.props.gesture;
  if (!gesture.options.enabled) return false;
  let active = false, failed = false;
  for (const [translationX, translationY] of moves) {
    if (failed) continue;
    if (!active && (translationY < gesture.options.failOffsetY[0] || translationY > gesture.options.failOffsetY[1])) { failed = true; continue; }
    if (!active && (translationX < gesture.options.activeOffsetX[0] || translationX > gesture.options.activeOffsetX[1])) { active = true; gesture.handlers.onStart(); }
    if (active) gesture.handlers.onUpdate({ translationX, translationY });
  }
  const [translationX, translationY] = moves.at(-1);
  if (active) gesture.handlers.onEnd({ translationX, translationY, velocityX }, success);
  gesture.handlers.onFinalize();
  return active;
}
function main() {
  const h = harness(); let tree = h.render(); h.offset().finish();
  for (const moves of [ [[3, -4], [6, -12], [70, -200]], [[8, 0], [12, 10], [120, 200]], [[-8, 0], [-12, -10], [-120, -200]], [[4, 5], [9, 30], [-100, 180]] ]) {
    assert.equal(drag(tree, moves), false, 'Vertical and diagonal motion cannot start a page drag');
    assert.equal(h.offset().get(), 0);
  }
  h.flush(); assert.equal(h.starts, 0); assert.deepEqual(h.pages, []);
  assert(drag(tree, [[8, 1], [-24, 2], [-160, 4]]));
  assert.equal(h.offset().get(), 160, 'Accepted horizontal drag follows the finger');
  h.flush(); assert.equal(h.starts, 1); assert.deepEqual(h.pages, [], 'Selection changes after snap finishes');
  h.offset().finish(); h.flush(); assert.deepEqual(h.pages, [1]);
  tree = h.render({ pageIndex: 1 }); h.offset().finish();
  assert(drag(tree, [[-24, 2], [-140, 160]]), 'Later vertical motion cannot change the accepted horizontal axis');
  h.offset().finish(); h.flush(); assert.equal(h.pages.at(-1), 2);
  tree = h.render({ pageIndex: 2 }); h.offset().finish();
  drag(tree, [[-30, 0], [-150, 0]]); h.offset().finish(); h.flush(); assert.equal(h.pages.at(-1), 2, 'Last page cannot overscroll');
  tree = h.render({ pageIndex: 0 }); h.offset().finish(); drag(tree, [[24, 0], [200, 0]]); h.offset().finish(); h.flush();
  assert.equal(h.pages.at(-1), 0, 'First page cannot overscroll');
  drag(tree, [[-24, 0], [-30, 0]]); h.offset().finish(); h.flush(); assert.equal(h.pages.at(-1), 0, 'Short horizontal movement snaps back');
  drag(tree, [[-24, 0], [-35, 0]], -900); h.offset().finish(); h.flush(); assert.equal(h.pages.at(-1), 1, 'A deliberate horizontal flick still changes page');
  tree = h.render({ pageIndex: 0 }); h.offset().finish(); const beforeCancel = h.pages.length;
  drag(tree, [[-24, 0], [-180, 0]], 0, false); h.offset().finish(); h.flush(); assert.equal(h.pages.at(-1), 0, 'Cancelled drag returns to its page');
  drag(tree, [[-24, 0], [-180, 0]]); tree = h.render({ width: 500 }); h.offset().finish(); h.flush();
  assert.equal(h.pages.length, beforeCancel + 1, 'Resizing cancels the old snap selection'); assert.equal(h.offset().get(), 0);
  tree = h.render({ pageIndex: 1, layoutKey: 'songs:albums:artists' }); assert.equal(h.offset().get(), 500, 'Reordered pages realign without dragging through other pages');
  tree = h.render({ pageIndex: 0, pageCount: 1, layoutKey: 'songs' }); assert.equal(drag(tree, [[-100, 0]]), false);
  tree = h.render({ pageCount: 3, layoutKey: 'songs:albums:artists' }); drag(tree, [[-24, 0], [-180, 0]]); h.offset().finish();
  const beforeUnmount = h.pages.length; h.unmount(); h.flush(); assert.equal(h.pages.length, beforeUnmount, 'Queued callbacks cannot update an unmounted library');
  const lifecycle = harness(); tree = lifecycle.render(); lifecycle.offset().finish();
  drag(tree, [[-24, 0], [-180, 0]]);
  lifecycle.setVisible(false); tree = lifecycle.render(); lifecycle.flush();
  assert.equal(tree.props.gesture.options.enabled, false, 'A covered or screen-off library cannot retain a pan recognizer');
  assert.equal(lifecycle.offset().get(), 0, 'Backgrounding discards a partial library swipe');
  lifecycle.offset().finish(); lifecycle.flush(); assert.deepEqual(lifecycle.pages, [], 'Canceled background snaps cannot switch tabs');
  lifecycle.setVisible(true); tree = lifecycle.render(); assert.equal(tree.props.gesture.options.enabled, true); lifecycle.unmount();
  console.log('PASS: diagonal/vertical drift ignored, horizontal direction lock, swipe/flick/snap-back, page bounds, cancelled gestures, reorder/resize and unmount cleanup. Gesture arbitration and animation frames are modeled; device scrolling is not verified.');
}
main();
