const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadSource } = require('./test-source-loader.cjs');
const jsx = (type, props) => ({ type, props });
const nodes = (tree) =>
  Array.isArray(tree)
    ? tree.flatMap(nodes)
    : tree && typeof tree === 'object'
      ? [tree, ...nodes(tree.props?.children)]
      : [];
let scheme = 'light';
let preferences = {
  accent: null,
  background: null,
  playerBackground: null,
  miniAccent: null,
  miniBackground: null,
};
const tokens = loadSource('src/theme/tokens.ios.ts', {
  'react-native': { useColorScheme: () => scheme },
  '@/stores/theme-preferences': { useThemePreferences: (select) => select({ mode: 'auto' }) },
  '@/stores/appearance-preferences': {
    useAppearancePreferences: (select) => select({ preferences }),
  },
});
assert.equal(tokens.useColors().background, '#FFFFFF');
const first = tokens.useColors();
assert.equal(tokens.useColors(), first, 'Stable semantic palette must not invalidate list rows');
scheme = 'dark';
assert.equal(tokens.useColors().background, '#000000');
assert.equal(tokens.useColors().text, '#FFFFFF');
preferences = { ...preferences, background: '#123456', accent: '#FFBBDD' };
assert.notEqual(
  tokens.useColors().background,
  '#000000',
  'Existing custom background stays active with the original contrast adjustment',
);
assert(tokens.useColors().tint.startsWith('#'));
let viewport = { width: 390, height: 844, fontScale: 1 };
const Toolbar = Object.assign((props) => jsx('Toolbar', props), { Button: 'ToolbarButton' });
const SettingsButton = () => null;
const openSettings = () => {};
const header = loadSource('src/components/screen-header.ios.tsx', {
  react: { isValidElement: (value) => !!value?.type },
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'react-native': { useWindowDimensions: () => viewport },
  'expo-router': { Stack: { Screen: 'Screen', Toolbar } },
  './settings-button': { SettingsButton, useSettingsAction: () => openSettings },
  '@/theme/tokens': {
    useColors: () => ({ tint: '#FF5588', text: '#000000', background: '#FFFFFF' }),
  },
}).ScreenHeader;
const action = jsx(SettingsButton, {});
let tree = header({ title: '보관함', action });
assert.equal(nodes(tree).find((n) => n.type === 'Screen').props.options.headerShown, true);
const settingsAction = nodes(tree).find((n) => typeof n.type === 'function' && n.type !== Toolbar);
const button = nodes(settingsAction.type(settingsAction.props)).find(
  (n) => n.type === 'ToolbarButton',
);
assert.equal(
  button.props.onPress,
  openSettings,
  'Native toolbar reuses the quick-hide/settings hook',
);
assert(
  !nodes(tree).some((n) => n.type === 'Text'),
  'No duplicate React Native title above content',
);
viewport = { width: 1200, height: 900, fontScale: 1 };
tree = header({ title: '보관함', action });
assert.equal(nodes(tree).find((n) => n.type === 'Screen').props.options.headerShown, false);
assert(
  !nodes(tree).some((n) => typeof n.type === 'function'),
  'Keep the existing iPad sidebar/title action',
);
const before = '/tmp/yeongdu-ios-ui-baseline-20261112';
for (const name of [
  'src/stores/playback.ts',
  'src/services/playback/controller.ts',
  'src/services/playback/audio-engine.ts',
  'src/stores/auth.ts',
  'src/stores/hidden-music.ts',
  'src/features/hidden-music/use-preset-editor.ts',
]) {
  const baseline = path.join(before, name);
  if (fs.existsSync(baseline))
    assert.equal(
      fs.readFileSync(name, 'utf8'),
      fs.readFileSync(baseline, 'utf8'),
      'UI work must preserve engine/auth/storage boundaries: ' + name,
    );
}
console.log(
  'PASS: iOS semantic theme and custom preferences, stable palette identities, native phone headers, iPad sidebar ownership and unchanged playback/auth/security boundaries. Rendering is checked separately.',
);
