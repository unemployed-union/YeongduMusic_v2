const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const react = require('react');

const root = path.resolve(__dirname, '..');
function load(file, modules) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => {
    assert(name in modules, 'Unexpected typography dependency: ' + name);
    return modules[name];
  }, exports);
  return exports;
}

// Inspect the actual bundled fonts rather than trusting their filenames.
function readFont(file) {
  const data = fs.readFileSync(path.join(root, 'assets/fonts', file));
  const tables = {};
  for (let index = 0; index < data.readUInt16BE(4); index++) {
    const record = 12 + index * 16;
    tables[data.toString('ascii', record, record + 4)] = data.readUInt32BE(record + 8);
  }
  const cmap = tables.cmap;
  let unicodeMap;
  for (let index = 0; index < data.readUInt16BE(cmap + 2); index++) {
    const offset = cmap + data.readUInt32BE(cmap + 8 + index * 8);
    if (data.readUInt16BE(offset) === 12) {
      unicodeMap = offset;
    }
  }
  assert(unicodeMap, 'Expected a Unicode character map in ' + file);
  const groups = [];
  for (let index = 0; index < data.readUInt32BE(unicodeMap + 12); index++) {
    const offset = unicodeMap + 16 + index * 12;
    groups.push({ start: data.readUInt32BE(offset), end: data.readUInt32BE(offset + 4), glyph: data.readUInt32BE(offset + 8) });
  }
  function glyph(character) {
    const point = character.codePointAt(0);
    const group = groups.find(item => point >= item.start && point <= item.end);
    return group ? group.glyph + point - group.start : 0;
  }
  return {
    glyph,
    units: data.readUInt16BE(tables.head + 18),
    width(character) {
      const metric = Math.min(glyph(character), data.readUInt16BE(tables.hhea + 34) - 1);
      return data.readUInt16BE(tables.hmtx + metric * 4);
    },
  };
}

const originalFont = readFont('PretendardVariable.ttf');
const japaneseFont = readFont('PretendardJPVariable.ttf');
assert.equal(japaneseFont.units, originalFont.units);
for (const character of '가나다라마바사아자차카타파하한글ABCabc0123456789') {
  assert(japaneseFont.glyph(character), 'Retain Korean/Latin coverage: ' + character);
  assert.equal(japaneseFont.width(character), originalFont.width(character), 'Retain Korean/Latin advance width: ' + character);
}
for (const character of 'あいうえおアイウエオ東京音楽日本語') {
  assert(japaneseFont.glyph(character), 'Bundle Japanese glyphs: ' + character);
}

const fontConfig = require('../app.json').expo.plugins.find(item => Array.isArray(item) && item[0] === 'expo-font')[1];
assert.equal(fontConfig.android.fonts[0].fontFamily, 'Pretendard JP Variable');
assert.equal(fontConfig.android.fonts[0].path, './assets/fonts/PretendardJPVariable.ttf');
assert.equal(fontConfig.ios?.fonts?.length ?? 0, 0, 'Do not embed custom fonts on iOS');
assert.equal(fontConfig.fonts?.length ?? 0, 0, 'Do not embed shared custom fonts on iOS');
assert(fs.readFileSync(path.join(root, 'plugins/with-android-text-theme.js'), 'utf8').includes('@font/pretendard_jp_variable'));

for (const os of ['android', 'ios', 'web']) {
  const native = { Platform: { OS: os }, Text: 'NativeText' };
  const typography = load('src/theme/typography.ts', { 'react-native': native });
  const expected = os === 'android' ? { fontFamily: 'Pretendard JP Variable' } : undefined;
  assert.deepEqual(typography.androidTextStyle, expected);
  const { Text } = load('src/components/text.tsx', {
    'react-native': native,
    react: { Children: react.Children, isValidElement: react.isValidElement, forwardRef: render => render, useMemo: calculate => calculate() },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    '@/theme/typography': typography,
    './character-wrap': { characterWrap: text => text },
  });
  const ref = {};
  const node = Text({ children: ['東京 ', '한국어'], variant: 'headline', numberOfLines: 1 }, ref);
  const style = Object.assign({}, ...[node.props.style].flat().filter(Boolean));
  assert.equal(style.fontFamily, expected?.fontFamily);
  assert.equal(node.props.accessibilityLabel, '東京 한국어');
  assert.equal(node.props.ref, ref);
  assert.deepEqual(node.props.children, ['東京 ', '한국어']);
  if (os === 'ios') {
    assert.equal(style.fontWeight, '600');
    assert.equal(node.props.dynamicTypeRamp, 'headline');
  }
  const custom = Text({ children: '東京', style: { fontFamily: 'Custom Font' } });
  assert.equal(Object.assign({}, ...[custom.props.style].flat().filter(Boolean)).fontFamily, 'Custom Font');
  for (const text of ['あいう', 'アイウ', 'ㇰㇱ', '東京', '日本語 한국어 English', 'ｶﾀｶﾅ', '한국어 English']) {
    const label = Text({ children: text });
    const labelStyle = Object.assign({}, ...[label.props.style].flat().filter(Boolean));
    assert.equal(labelStyle.fontFamily, expected?.fontFamily, os + ' font for ' + text);
  }

  const { TextInput } = load('src/components/text-input.tsx', {
    'react-native': {
      ...native,
      View: 'View', TextInput: 'NativeInput', Pressable: 'Button',
      StyleSheet: { create: value => value, flatten: value => value },
    },
    react: {
      forwardRef: render => render,
      useRef: () => ({ current: null }),
      useState: initial => [initial, () => {}],
      useImperativeHandle() {},
    },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    '@/theme/typography': typography,
    '@/theme/tokens': { useColors: () => ({ muted: '#888' }) },
    '@expo/vector-icons/Ionicons': { default: 'Icon', __esModule: true },
  });
  for (const props of [{ value: '東京 한국어' }, { defaultValue: '日本語' }, { placeholder: '検索' }]) {
    const field = TextInput(props, ref).props.children[0];
    assert.equal(Object.assign({}, ...field.props.style.filter(Boolean)).fontFamily, expected?.fontFamily);
  }
}
console.log('PASS: Japanese/Korean font coverage and Android theme; iOS system fonts for every language without custom font embedding; refs, accessibility, inputs and Dynamic Type. Native font rendering is not exercised.');
