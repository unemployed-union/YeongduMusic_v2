/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const jsx = (type, props) => ({ type, props });
const platform = { OS: 'android' };
let bottomInset = 82;
let animatedStyle, cleanup;
const cancellations = [];
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/components/tab-scroll-edge-fade.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const mocks = {
  react: {
    useContext: () => bottomInset, useRef: current => ({ current }), useCallback: fn => fn,
    useEffect: fn => { cleanup = fn(); },
    isValidElement: child => !!child?.props,
    cloneElement: (child, props) => ({ ...child, props: { ...child.props, ...props } }),
  },
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'react-native': { Platform: platform, View: 'View', StyleSheet: { create: styles => styles } },
  'react-native-reanimated': {
    __esModule: true, default: { View: 'AnimatedView' },
    useSharedValue: initial => ({ current: initial, get() { return this.current; }, set(next) { if (!next?.animation) this.current = next; } }),
    useAnimatedStyle: fn => { animatedStyle = fn; return 'animatedStyle'; },
    cancelAnimation: value => cancellations.push(value),
    withDelay: (delay, value) => ({ animation: true, delay, value }),
    withTiming: (value, config) => ({ animation: true, value, config }),
  },
  '@/theme/tokens': { useColors: () => ({ text: '#ffffff' }) },
  './scroll-edge-fade': { ScrollEdgeFade: 'Fade' },
  './tab-bar-inset': { TabBarInsetContext: {} },
};
const mod = { exports: {} };
new Function('require', 'module', 'exports', source)(name => {
  assert.ok(name in mocks, `Unexpected module ${name}`); return mocks[name];
}, mod, mod.exports);
const { TabScrollEdgeFade } = mod.exports;
const calls = [];
const ref = { current: 'native list' };
const child = { type: 'FlatList', key: 'songs', props: {
  ref, refreshControl: 'refresh', scrollEventThrottle: 32,
  onLayout: event => calls.push(['layout', event]),
  onContentSizeChange: (...args) => calls.push(['content', ...args]),
  onScroll: event => calls.push(['scroll', event]),
} };
function renderAndroid() {
  const wrapper = TabScrollEdgeFade({ children: child });
  const frame = wrapper.type(wrapper.props);
  const observer = frame.props.children[0];
  const list = observer.type(observer.props).props.children;
  assert.equal(list.key, child.key);
  assert.equal(list.props.ref, ref);
  assert.equal(list.props.refreshControl, 'refresh');
  assert.equal(list.props.scrollEventThrottle, 32);
  assert.equal(list.props.showsVerticalScrollIndicator, false);
  assert.equal(frame.props.children[1].props.pointerEvents, 'none');
  return list;
}
const list = renderAndroid();
const layout = { nativeEvent: { layout: { height: 500 } } };
list.props.onLayout(layout);
list.props.onContentSizeChange(300, 2000);
function scroll(offset, viewport = 500, content = 2000) {
  const event = { nativeEvent: { contentOffset: { y: offset }, layoutMeasurement: { height: viewport }, contentSize: { height: content }, contentInset: { top: 0, bottom: 0 } } };
  list.props.onScroll(event);
  return animatedStyle();
}
assert.equal(scroll(0).transform[0].translateY, 0);
const middle = scroll(750);
const end = scroll(1500);
assert.ok(middle.transform[0].translateY > 0 && middle.transform[0].translateY < end.transform[0].translateY);
assert.equal(3 + end.transform[0].translateY + end.height, 500 - 82 - 3, 'At the list end the entire thumb stops above the tabs');
assert.deepEqual(scroll(-50).transform, [{ translateY: 0 }], 'Pull to refresh clamps to the track top');
assert.deepEqual(scroll(1600), end, 'Bottom overscroll clamps to the track end');
assert.deepEqual(calls[0], ['layout', layout]);
assert.deepEqual(calls[1], ['content', 300, 2000]);
assert.equal(calls[2][0], 'scroll');
list.props.onContentSizeChange(300, 100);
assert.equal(animatedStyle().opacity, 0, 'Filtering to a short list hides the thumb without waiting for another scroll');
for (const viewport of [180, 500, 900]) {
  for (const inset of [0, 66, 82, 100]) {
    bottomInset = inset;
    const resized = renderAndroid();
    resized.props.onScroll({ nativeEvent: { contentOffset: { y: 3000 - viewport }, layoutMeasurement: { height: viewport }, contentSize: { height: 3000 } } });
    const style = animatedStyle();
    assert.equal(3 + style.transform[0].translateY + style.height, viewport - inset - 3, 'Safe area, keyboard and resized viewport all retain the bottom boundary');
  }
}
bottomInset = 82;
const floatingChild = { ...child, props: { ...child.props, scrollIndicatorInsets: { top: 96 } } };
const floatingWrapper = TabScrollEdgeFade({ children: floatingChild });
const floatingFrame = floatingWrapper.type(floatingWrapper.props);
const floatingTop = floatingFrame.props.children[1].props.style[1].top;
assert.equal(floatingTop, 99, 'Android starts the indicator below a floating native header');
const floatingObserver = floatingFrame.props.children[0];
const floatingList = floatingObserver.type(floatingObserver.props).props.children;
floatingList.props.onScroll({ nativeEvent: { contentOffset: { y: 1500 }, layoutMeasurement: { height: 500 }, contentSize: { height: 2000 }, contentInset: { top: 0, bottom: 0 } } });
const floatingStyle = animatedStyle();
assert.equal(floatingTop + floatingStyle.transform[0].translateY + floatingStyle.height, 500 - 82 - 3, 'Header insets retain the tab boundary');
cleanup();
assert.equal(cancellations.length, 1, 'Unmount cancels the delayed fade');
platform.OS = 'ios';
bottomInset = 82;
const iosChild = { ...child, props: { ...child.props, scrollIndicatorInsets: { top: 12, right: 2, bottom: 4 } } };
let iosList = TabScrollEdgeFade({ children: iosChild }).props.children;
assert.deepEqual(iosList.props.scrollIndicatorInsets, { top: 12, right: 2, bottom: 82 });
assert.equal(iosList.props.automaticallyAdjustsScrollIndicatorInsets, false);
assert.equal(iosList.props.ref, ref);
assert.equal(iosList.props.showsVerticalScrollIndicator, undefined, 'iOS keeps its native indicator');
bottomInset = 0;
iosList = TabScrollEdgeFade({ children: iosChild }).props.children;
assert.equal(iosList.props.scrollIndicatorInsets.bottom, 4, 'Keyboard-hidden tabs preserve caller insets');
for (const props of [{ horizontal: true }, { showsVerticalScrollIndicator: false }]) {
  const ignored = { ...child, props: { ...child.props, ...props } };
  assert.equal(TabScrollEdgeFade({ children: ignored }).props.children, ignored);
}
assert.equal(TabScrollEdgeFade({ children: null }).props.children, null);
console.log('PASS: Android thumb stays above tabs at the end, safe areas/resizing/keyboard, short lists, overscroll, callback/ref/refresh preservation, cleanup and iOS native insets.');
