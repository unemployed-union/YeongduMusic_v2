/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2] || path.resolve(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));
function load(file, modules) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => {
    if (name in modules) return modules[name];
    if (name === 'react/jsx-runtime') return require(path.join(root, 'node_modules/react/jsx-runtime'));
    throw new Error('Unexpected runtime dependency: ' + name);
  }, mod, mod.exports);
  return mod.exports;
}
let pendingEffect, previousDependencies, cleanup, valueIndex;
const values = [], animations = [], cancellations = [];
const sameDependencies = (a, b) => a && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
const React = {
  useEffect: (effect, dependencies) => { if (!sameDependencies(previousDependencies, dependencies)) pendingEffect = { effect, dependencies }; },
};
const reanimated = {
  Easing: { quad: value => value * value, inOut: value => value },
  withTiming: (target, config) => ({ target, config }),
  cancelAnimation: value => { cancellations.push(value); value.animation = null; },
  useAnimatedStyle: factory => ({ read: factory }),
  useSharedValue: initial => values[valueIndex++] ??= {
    value: initial, animation: null, get() { return this.value; },
    set(animation) { animations.push(animation); this.animation = animation; },
  },
};
const { useScrollEdgeTransition: transitionHook, EDGE_TRANSITION_MS } = load(process.argv[3] || path.join(root, 'src/components/use-scroll-edge-transition.ts'), { react: React, 'react-native-reanimated': reanimated });
function render(top, bottom) {
  valueIndex = 0; pendingEffect = null;
  const result = transitionHook(top, bottom);
  if (pendingEffect) {
    cleanup?.(); previousDependencies = pendingEffect.dependencies; cleanup = pendingEffect.effect();
  }
  return result;
}
function finish(value) { assert.ok(value.animation); value.value = value.animation.target; value.animation = null; }
let transition = render(false, false);
assert.equal(transition.topStyle.read().opacity, 0);
assert.equal(transition.bottomStyle.read().opacity, 0);
const initiallyScheduled = animations.length;
render(false, false);
assert.equal(animations.length, initiallyScheduled, 'Stable visibility does not restart animation');
transition = render(true, true);
assert.equal(transition.topStyle.read().opacity, 0, 'Fade starts at the current value');
assert.equal(values[0].animation.target, 1); assert.equal(values[1].animation.target, 1);
values[0].value = 0.4; values[1].value = 0.3;
transition = render(false, false);
assert.equal(transition.topStyle.read().opacity, 0.4);
assert.equal(transition.bottomStyle.read().opacity, 0.3);
assert.equal(values[0].animation.target, 0);
transition = render(true, true);
assert.equal(values[0].get(), 0.4, 'Rapid reversals never jump back to zero');
finish(values[0]); finish(values[1]);
assert.equal(transition.topStyle.read().opacity, 1);
const afterMiddle = animations.length;
render(true, true); assert.equal(animations.length, afterMiddle);
transition = render(true, false); finish(values[0]); finish(values[1]);
assert.equal(transition.topStyle.read().opacity, 1);
assert.equal(transition.bottomStyle.read().opacity, 0, 'End of list removes only the bottom effect');
transition = render(false, false); finish(values[0]); finish(values[1]);
assert.equal(transition.topStyle.read().opacity, 0);
assert.ok(animations.every(animation => animation.config.duration === EDGE_TRANSITION_MS));
assert.equal(EDGE_TRANSITION_MS, 200);
const cancelled = cancellations.length;
cleanup(); assert.equal(cancellations.length, cancelled + 2, 'Unmount cancels both UI animations');

// Render the actual shared viewport with mocked native components. Loading it
// must not depend on BlurTargetView, BlurView, MaskedView or worklet RN callbacks.
let viewportHeight = null, edges = { top: false, bottom: false };
const child = { type: 'FlatList', key: 'fixture', props: { ref: { current: 'native-list' } } };
const scrollProps = { onScroll: () => {}, scrollEventThrottle: 48 };
const themed = { light: { background: '#F8F8FA' }, dark: { background: '#0C0D12' } };
const ScrollEdgeChild = () => null;
const actual = load(path.join(root, 'src/components/scroll-edge-fade-view.tsx'), {
  react: { memo: component => component, useMemo: factory => factory(), useState: initial => [viewportHeight ?? initial, value => { viewportHeight = value; }] },
  'react-native': { View: 'View', StyleSheet: { create: styles => styles, absoluteFill: { position: 'absolute' } } },
  'expo-linear-gradient': { LinearGradient: 'LinearGradient' },
  'react-native-reanimated': { default: { View: 'AnimatedView' } },
  '@/theme/tokens': { palette: themed, useColors: () => themed.light },
  './scroll-edge-child': { ScrollEdgeChild },
  './use-scroll-edges': { useScrollEdges: () => ({ child, scrollProps, ...edges }) },
  './use-scroll-edge-transition': { useScrollEdgeTransition: (top, bottom) => ({ topStyle: { opacity: +top }, bottomStyle: { opacity: +bottom } }) },
}).ScrollEdgeFade;
function overlays(tree) { return tree.props.children.slice(1).map(element => element.type(element.props)); }
const initialTree = actual({ children: child });
assert.equal(initialTree.props.children[0].type, ScrollEdgeChild);
assert.equal(initialTree.props.children[0].props.element, child);
assert.equal(initialTree.props.children[0].props.scrollProps, scrollProps);
const initialOverlays = overlays(initialTree);
assert.equal(initialOverlays.length, 2, 'Both edges exist before the first scroll');
for (const edge of initialOverlays) {
  assert.equal(edge.props.pointerEvents, 'none');
  assert.equal(edge.props.importantForAccessibility, 'no-hide-descendants');
  assert.equal(edge.props.children.type, 'LinearGradient');
  assert.equal(edge.props.children.props.dither, false);
  assert.equal(edge.props.style.at(-1).opacity, 0);
}
assert.equal(initialOverlays[0].props.children.props.colors[0], '#F8F8FA');
assert.equal(initialOverlays[0].props.children.props.colors.at(-1), '#F8F8FA00');
assert.deepEqual(initialOverlays[1].props.children.props.colors, [...initialOverlays[0].props.children.props.colors].reverse());
edges = { top: true, bottom: true };
const scrolledTree = actual({ children: child });
assert.equal(scrolledTree.props.children.length, initialTree.props.children.length);
assert.equal(scrolledTree.props.children[1].type, initialTree.props.children[1].type, 'No edge component insertion/replacement on first scroll');
assert.equal(overlays(scrolledTree)[0].props.style.at(-1).opacity, 1);
const floatingHeader = overlays(actual({ children: child, topEnabled: false }));
assert.equal(floatingHeader[0].props.style.at(-1).opacity, 0, 'A floating header can disable only the top overlay');
assert.equal(floatingHeader[1].props.style.at(-1).opacity, 1, 'The bottom fade remains available');
const dark = overlays(actual({ children: child, tint: 'dark' }));
assert.equal(dark[0].props.children.props.colors[0], '#0C0D12', 'Player uses a dark surface even in a light app theme');
const sheet = overlays(actual({ children: child, backgroundColor: '#FFFFFF', fill: false }));
assert.equal(sheet[0].props.children.props.colors[0], '#FFFFFF');
assert.equal(actual({ children: child, fill: false }).props.style[1].flexShrink, 1);
initialTree.props.onLayout({ nativeEvent: { layout: { height: 24 } } });
assert.equal(overlays(actual({ children: child }))[0].props.style[2].height, 8, 'Small sheets cap each edge to a third of the viewport');
assert.equal(overlays(actual({ children: child, fadeHeight: 0 }))[0].props.style[2].height, 0);
const entryFiles = ['scroll-edge-fade.tsx', 'scroll-edge-fade.web.tsx'];
for (const entryFile of entryFiles) {
  const entry = load(path.join(root, 'src/components', entryFile), { './scroll-edge-fade-view': { ScrollEdgeFade: actual } });
  assert.equal(entry.ScrollEdgeFade, actual, 'Native and web use the same lightweight implementation');
}
console.log('PASS: transparent initial edges, 200ms opacity fade, interrupted/reversed transitions, stable-region updates, end/reset, unmount cleanup; pre-mounted gradients, unchanged scroll child, touch/accessibility exclusion, light/dark/sheet colors, small-sheet/disabled edge sizing and shared native/web view. Native frame times and visual appearance are not measured.');
