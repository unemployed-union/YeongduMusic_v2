/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
function read(file, modules = {}) {
  const exports = {}, code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'exports', code)(name => {
    assert(name in modules, 'Unexpected dependency: ' + name); return modules[name];
  }, exports);
  return exports;
}
const jsx = (type, props) => ({ type, props });
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const fallback = read('src/theme/liquid-glass.tsx');
assert.deepEqual(fallback.useLiquidGlass(), { supported: false, enabled: false, reduceTransparency: false });
assert.equal(fallback.LiquidGlassProvider({ children: 'Android content' }), 'Android content');
assert.equal(read('src/components/glass-backdrop.tsx').GlassBackdrop({}), null);

function runtime(version, api = true, compiled = true) {
  let cursor = 0, effect, listener, removed = false, resolveQuery, apiCalls = 0;
  const slots = [], context = { current: null };
  const preferences = { ready: true, loadError: false, ...read('src/features/settings/blur-preferences.ts').parseBlurPreferences(true) };
  const glass = read('src/theme/liquid-glass.ios.tsx', {
    react: {
      createContext: initial => { context.current = initial; return context; }, useContext: () => context.current,
      useState: initial => {
        const i = cursor++;
        if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
        return [slots[i], value => { slots[i] = value; }];
      },
      useEffect: callback => { effect = callback; },
    },
    'react/jsx-runtime': { jsx },
    'react-native': { Platform: { OS: 'ios', Version: version }, AccessibilityInfo: {
      addEventListener: (event, callback) => { assert.equal(event, 'reduceTransparencyChanged'); listener = callback; return { remove: () => { removed = true; } }; },
      isReduceTransparencyEnabled: () => new Promise(resolve => { resolveQuery = resolve; }),
    } },
    'expo-glass-effect': { isGlassEffectAPIAvailable: () => { apiCalls++; return api; }, isLiquidGlassAvailable: () => compiled },
    '@/stores/blur-preferences': { useBlurPreferences: select => select(preferences) },
  });
  const render = () => { cursor = 0; context.current = glass.LiquidGlassProvider({ children: 'content' }).props.value; };
  render(); const cleanup = effect();
  return { glass, preferences, render, cleanup, resolveQuery: value => resolveQuery(value), change: value => listener(value),
    removed: () => removed, apiCalls: () => apiCalls };
}
async function main() {
  for (const [version, api, compiled, supported] of [
    ['16.4', true, true, false], ['18.0', true, true, false], ['18.7', true, true, false], ['25.9', true, true, false], ['26.0', false, true, false],
    ['26.0', true, false, false], ['26.0', true, true, true], ['26.1', true, true, true], ['27.0', true, true, true],
  ]) {
    const r = runtime(version, api, compiled);
    assert.equal(r.glass.useLiquidGlass().supported, supported);
    assert.equal(r.glass.useLiquidGlass().enabled, false, 'Wait for accessibility before showing glass');
    if (parseFloat(version) < 26) assert.equal(r.apiCalls(), 0, 'Older iOS never invokes the glass APIs');
    r.resolveQuery(false); await flush(); r.render();
    assert.equal(r.glass.useLiquidGlass('tabBar').enabled, supported);
    r.preferences.areas.tabBar.enabled = false;
    assert.equal(r.glass.useLiquidGlass('tabBar').enabled, false);
    assert.equal(r.glass.useLiquidGlass('miniPlayer').enabled, supported, 'Area choices remain independent');
    r.preferences.enabled = false;
    assert.equal(r.glass.useLiquidGlass().enabled, false, 'Master switch includes player buttons');
    r.preferences.enabled = true; r.preferences.loadError = true;
    assert.equal(r.glass.useLiquidGlass().enabled, false);
    r.preferences.loadError = false;
    r.change(true); r.render();
    assert.equal(r.glass.useLiquidGlass().enabled, false, 'Live accessibility changes disable glass');
    r.change(false); r.render();
    assert.equal(r.glass.useLiquidGlass().enabled, supported);
    r.cleanup(); assert(r.removed(), 'Remove the accessibility subscription on unmount');
  }
  const race = runtime('26.0');
  race.change(true); race.resolveQuery(false); await flush(); race.render();
  assert(race.glass.useLiquidGlass().reduceTransparency, 'A stale initial query cannot override a newer accessibility event');
  race.cleanup();
  const r = runtime('26.0'); r.resolveQuery(false); await flush(); r.render();
  const { GlassBackdrop } = read('src/components/glass-backdrop.ios.tsx', {
    'react/jsx-runtime': { jsx }, 'react-native': { StyleSheet: { absoluteFill: { position: 'absolute' } } },
    'expo-glass-effect': { GlassView: 'NativeGlass' }, '@/theme/tokens': { useAppColorScheme: () => 'light' },
    '@/theme/liquid-glass': r.glass,
  });
  assert.equal(GlassBackdrop({}).type, 'NativeGlass');
  assert.equal(GlassBackdrop({}).props.colorScheme, 'light', 'Glass follows the app theme');
  assert.equal(GlassBackdrop({ dark: true }).props.colorScheme, 'dark', 'Player controls retain their dark appearance');
  r.change(true); r.render(); assert.equal(GlassBackdrop({}), null);
  r.cleanup();
  console.log('PASS: iOS 26/API/build guards, Android/web isolation, independent area/master preferences, live accessibility and stale-query protection, theme-aware native glass. Native rendering is mocked.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
