/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
const refs = [], values = [], cleanups = [], animations = [];
let refSlot = 0, valueSlot = 0, hidden = false, stateWrites = 0, cancellations = 0, initialized = false;
const modules = {
  react: {
    useCallback: fn => fn,
    useRef: initial => refs[refSlot++] ??= { current: initial },
    useState: () => [hidden, value => { hidden = value; stateWrites++; }],
    useEffect: effect => { if (!initialized) cleanups.push(effect()); },
  },
  'react-native-reanimated': {
    useSharedValue: initial => {
      const slot = valueSlot++;
      return values[slot] ??= { value: initial, get() { return this.value; }, set(value) { this.value = value; } };
    },
    useAnimatedStyle: fn => fn,
    withTiming: (value, config) => { animations.push({ value, config }); return value; },
    cancelAnimation: () => { cancellations++; },
  },
};
const code = ts.transpileModule(fs.readFileSync(path.join(root, 'src/features/library/use-library-controls.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const hooks = {};
new Function('require', 'exports', code)(name => { if (!(name in modules)) throw Error('Unexpected import ' + name); return modules[name]; }, hooks);
const render = () => { refSlot = 0; valueSlot = 0; const result = hooks.useLibraryControls(); initialized = true; return result; };
const scroll = (controls, page, y, content = 2000, viewport = 600) => controls.onScroll(page, { nativeEvent: {
  contentOffset: { x: 0, y }, contentSize: { width: 400, height: content }, layoutMeasurement: { width: 400, height: viewport }, contentInset: { top: 0, bottom: 0 },
} });
let controls = render();
assert.equal(controls.frameStyle().height, 0, 'Absolute content measures independently of the clipped frame');
controls.onLayout({ nativeEvent: { layout: { height: 60 } } });
assert.equal(controls.frameStyle().height, 60);
scroll(controls, 'albums', 10); scroll(controls, 'albums', 20);
assert.equal(stateWrites, 0, 'Small scrolls do not toggle controls');
scroll(controls, 'albums', 25); controls = render();
assert.equal(controls.hidden, true); assert.equal(controls.frameStyle().height, 0);
assert.equal(controls.contentStyle().opacity, 0); assert.equal(controls.contentStyle().transform[0].translateY, -60);
controls.onLayout({ nativeEvent: { layout: { height: 0 } } });
assert.equal(controls.contentStyle().transform[0].translateY, -60, 'Collapsed native layout must preserve the natural expansion height');
for (let y = 26; y < 500; y++) scroll(controls, 'albums', y);
assert.equal(stateWrites, 1, 'Scrolling does not rerender the library every frame');
assert.deepEqual(animations, [{ value: 1, config: { duration: 200 } }]);
scroll(controls, 'songs', 200); assert.equal(stateWrites, 1, 'Inactive pages cannot change visibility');
controls.selectPage('songs'); controls = render();
assert.equal(controls.hidden, false); assert.equal(controls.frameStyle().height, 60);
scroll(controls, 'songs', 200); assert.equal(controls.hidden, false, 'Restored offset stays visible after switching tabs');
scroll(controls, 'songs', 214); assert.equal(stateWrites, 2);
scroll(controls, 'songs', 225); controls = render(); assert.equal(controls.hidden, true);
scroll(controls, 'songs', -15); controls = render(); assert.equal(controls.hidden, false, 'Pull to refresh reveals controls');
scroll(controls, 'artists', 400); controls.selectPage('artists'); controls = render();
scroll(controls, 'artists', 400); assert.equal(controls.hidden, false);
scroll(controls, 'artists', 425); controls = render(); assert.equal(controls.hidden, true);
scroll(controls, 'artists', 425, 600, 600); controls = render(); assert.equal(controls.hidden, false, 'Short/empty lists reveal controls');
scroll(controls, 'artists', 450); controls = render(); assert.equal(controls.hidden, true);
scroll(controls, 'artists', 447); controls = render(); assert.equal(controls.hidden, true, 'Small direction jitter does not toggle visibility');
scroll(controls, 'artists', 436); controls = render(); assert.equal(controls.hidden, false, 'Upward scrolling reveals controls away from the top');
const writesAfterReveal = stateWrites;
scroll(controls, 'artists', 430); scroll(controls, 'artists', 420);
assert.equal(stateWrites, writesAfterReveal, 'Continued upward scrolling does not rerender every frame');
scroll(controls, 'artists', 445); controls = render(); assert.equal(controls.hidden, true, 'Downward scrolling hides controls again');
controls.show(); controls = render(); assert.equal(controls.hidden, false, 'Horizontal swipe reveals controls before a tab is selected');
assert.equal(controls.frameStyle().height, 60);
scroll(controls, 'artists', 470); controls = render(); assert.equal(controls.hidden, false, 'Old downward events cannot immediately hide controls during a revealing gesture');
controls.onTouchStart({ nativeEvent: { pageX: 200, pageY: 500 } });
scroll(controls, 'artists', 1400); controls = render(); assert.equal(controls.hidden, true);
scroll(controls, 'artists', 1340, 2000, 660); controls = render();
assert.equal(controls.hidden, true, 'Header resize and bottom offset clamping cannot imitate an upward gesture');
scroll(controls, 'artists', 1500, 2000, 660); scroll(controls, 'artists', 1340, 2000, 660); controls = render();
assert.equal(controls.hidden, true, 'Bottom overscroll bounce cannot imitate an upward gesture');
scroll(controls, 'artists', 1325, 2000, 660); controls = render(); assert.equal(controls.hidden, false);
controls.onTouchStart({ nativeEvent: { pageX: 200, pageY: 500 } });
scroll(controls, 'artists', 1340, 2000, 660); scroll(controls, 'artists', 1350, 2000, 600); scroll(controls, 'artists', 1380, 2000, 600);
controls = render(); assert.equal(controls.hidden, true);
controls.onTouchMove({ nativeEvent: { pageX: 200, pageY: 525 } });
controls = render(); assert.equal(controls.hidden, false, 'Gesture toward earlier list content reveals controls even before native scroll offsets settle');
assert.equal(controls.frameStyle().height, 60);
scroll(controls, 'artists', 1390, 2000, 600); controls = render(); assert.equal(controls.hidden, false, 'Revealed tabs stay visible for the current gesture');
controls.onTouchStart({ nativeEvent: { pageX: 200, pageY: 500 } });
scroll(controls, 'artists', 1400, 2000, 600);
controls.onTouchStart({ nativeEvent: { pageX: 200, pageY: 500 } });
scroll(controls, 'artists', 1200, 2000, 600); scroll(controls, 'artists', 1230, 2000, 600);
controls = render(); assert.equal(controls.hidden, true);
controls.onTouchMove({ nativeEvent: { pageX: 180, pageY: 500 } });
controls = render(); assert.equal(controls.hidden, false, 'Horizontal touch motion reveals controls without requiring a completed tab change');
controls.onLayout({ nativeEvent: { layout: { height: 80 } } }); assert.equal(controls.frameStyle().height, 80, 'Notices and text resizing update the measured height');
cleanups.forEach(cleanup => cleanup()); assert.equal(cancellations, 1);
console.log('PASS: measured collapse/slide, upward/downward scrolling, direction jitter, immediate swipe reveal, no per-frame state writes, inactive page isolation, restored tab offsets, pull-to-refresh/short lists, resizing and animation cleanup. Native animation frames are not measured.');
