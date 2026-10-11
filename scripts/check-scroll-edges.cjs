const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));
const file = process.argv[3] || path.join(root, 'src/components/use-scroll-edges.ts');
const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const refs = [];
let refIndex = 0, state, renders = 0;
const React = {
  useRef: initial => refs[refIndex++] ??= { current: initial },
  useState: initial => { state ??= initial; return [state, next => { state = next; renders++; }]; },
  useCallback: fn => fn,
  isValidElement: child => !!child && typeof child === 'object' && 'props' in child,
  cloneElement: (child, props) => ({ ...child, props: { ...child.props, ...props } }),
};
const mod = { exports: {} };
new Function('require', 'module', 'exports', source)(name => {
  assert.equal(name, 'react'); return React;
}, mod, mod.exports);
const { scrollEdgeVisibility, useScrollEdges } = mod.exports;
const metrics = { content: 900, viewport: 300, offset: 0, insetTop: 0, insetBottom: 0 };
assert.deepEqual(scrollEdgeVisibility(metrics), { top: false, bottom: false });
assert.deepEqual(scrollEdgeVisibility({ ...metrics, offset: 60 }), { top: true, bottom: true });
assert.deepEqual(scrollEdgeVisibility({ ...metrics, offset: 600 }), { top: true, bottom: false });
assert.deepEqual(scrollEdgeVisibility({ ...metrics, offset: 660 }), { top: true, bottom: false });
assert.deepEqual(scrollEdgeVisibility({ ...metrics, offset: -40 }), { top: false, bottom: false });
for (const content of [0, 100, 300]) assert.deepEqual(scrollEdgeVisibility({ ...metrics, content, offset: 20 }), { top: false, bottom: false });
assert.deepEqual(scrollEdgeVisibility({ ...metrics, viewport: 0, offset: 60 }), { top: false, bottom: false });
assert.deepEqual(scrollEdgeVisibility({ ...metrics, insetTop: 20, offset: -20 }), { top: false, bottom: false });

const calls = [], originalRef = { current: 'retained native list' };
const element = { type: 'FlatList', key: 'retained-key', props: {
  ref: originalRef, scrollEventThrottle: 48,
  onLayout: event => calls.push(['layout', event]),
  onContentSizeChange: (...args) => calls.push(['content', ...args]),
  onScroll: event => calls.push(['scroll', event]),
} };
function render(child = element) {
  refIndex = 0;
  const result = useScrollEdges(child);
  return { ...result, child: result.scrollProps ? React.cloneElement(result.child, result.scrollProps) : result.child };
}
const initial = render();
assert.equal(initial.child.props.ref, originalRef);
assert.equal(initial.child.key, element.key);
assert.equal(initial.child.props.scrollEventThrottle, 48);
const layout = { nativeEvent: { layout: { height: 300 } } };
initial.child.props.onLayout(layout);
initial.child.props.onContentSizeChange(200, 900);
assert.deepEqual(state, { top: false, bottom: false });
const event = offset => ({ nativeEvent: {
  contentSize: { width: 200, height: 900 }, layoutMeasurement: { width: 200, height: 300 },
  contentOffset: { x: 0, y: offset }, contentInset: { top: 0, bottom: 0, left: 0, right: 0 },
} });
const middle = event(60);
initial.child.props.onScroll(middle);
assert.deepEqual(state, { top: true, bottom: true });
const before = renders;
initial.child.props.onScroll(event(80));
assert.equal(renders, before, 'Scrolling within the same region must not schedule React updates');
initial.child.props.onScroll(event(600));
assert.deepEqual(state, { top: true, bottom: false });
initial.child.props.onContentSizeChange(200, 100);
assert.deepEqual(state, { top: false, bottom: false }, 'Filtering to a short list removes both effects');
assert.deepEqual(calls[0], ['layout', layout]);
assert.deepEqual(calls[1], ['content', 200, 900]);
assert.deepEqual(calls[2], ['scroll', middle]);
const horizontal = { ...element, props: { ...element.props, horizontal: true } };
assert.equal(render(horizontal).child, horizontal, 'Do not intercept horizontal paging');
assert.equal(render(null).child, null);
console.log('PASS: initial/empty/short lists, middle/end/bounce/insets, resized content, original ref/key/callbacks/throttle, stable-region updates and horizontal paging exclusion.');
console.log('Native blur/mask appearance and player layout still require device verification.');

