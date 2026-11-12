/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');
const { loadSource } = require('./test-source-loader.cjs');

const root = path.resolve(__dirname, '..');
const filename = path.join(root, 'src/features/settings/creator-dialog.ios.tsx');
const source = fs.readFileSync(filename, 'utf8');
const jsx = (type, props) => {
  assert(type, 'Every compiled element must resolve to a component');
  return { type, props };
};
const swift = Object.fromEntries(
  ['Button', 'Form', 'Host', 'Image', 'NavigationStack', 'RNHostView', 'Text', 'ToolbarItem'].map(
    (name) => [name, function NativeComponent() {}],
  ),
);
swift.Toolbar = Object.assign(function Toolbar() {}, { Content: function Content() {} });
const creator = loadSource('src/features/settings/creator-info.ts');

function compileAndLoad(input, version) {
  // Match the production Expo/Metro caller. A plain TypeScript transform misses this crash.
  const { code } = babel.transformSync(input, {
    filename,
    configFile: false,
    babelrc: false,
    presets: ['babel-preset-expo'],
    envName: 'production',
    caller: {
      name: 'metro',
      bundler: 'metro',
      platform: 'ios',
      engine: 'hermes',
      isDev: false,
      isNodeModule: false,
      isServer: false,
      projectRoot: root,
      supportsReactCompiler: true,
      supportsStaticESM: false,
      metroSourceType: 'module',
    },
  });
  const native = { Modal: 'Modal', View: 'View', Image: 'Image', Platform: { Version: version } };
  const mocks = {
    react: { useState: () => [null, () => {}] },
    'react/compiler-runtime': {
      c: (size) => new Array(size).fill(Symbol.for('react.memo_cache_sentinel')),
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': native,
    'expo-linking': { openURL: () => assert.fail('Rendering must not open an external URL') },
    '@expo/ui/swift-ui': swift,
    '@expo/ui/swift-ui/modifiers': new Proxy(
      {},
      {
        get:
          (_, name) =>
          (...args) => ({ name, args }),
      },
    ),
    './creator-info': creator,
    '../../../assets/images/creator-profile.png': 42,
  };
  const result = {};
  new Function('require', 'exports', code)((name) => {
    if (name in mocks) {
      return mocks[name];
    }
    if (name.startsWith('@babel/runtime/')) {
      return require(name);
    }
    throw new Error('Unexpected compiled import: ' + name);
  }, result);
  assert(code.includes('react.memo_cache_sentinel'), 'React Compiler must actually run');
  return result.CreatorDialog;
}

const props = { onClose() {}, onPressName() {} };
const originalAlias = source
  .replace('Image as SwiftUIImage', 'Image as Symbol')
  .replace('<SwiftUIImage systemName=', '<Symbol systemName=');
assert.notEqual(originalAlias, source, 'The negative control must restore the crashing alias');
assert.throws(() => compileAndLoad(originalAlias, 27)(props), TypeError);

for (const version of [18, 26, 27]) {
  const dialog = compileAndLoad(source, version)(props);
  assert.equal(dialog.type, 'Modal');
  assert.equal(dialog.props.presentationStyle, 'formSheet');
}
console.log(
  'PASS: production Expo React Compiler reproduces the Symbol alias crash; the corrected creator dialog renders on iOS 18/26/27. Native views are mocked.',
);
