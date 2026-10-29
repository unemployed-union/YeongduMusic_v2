/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..'), ts = require(path.join(root, 'node_modules/typescript'));
function load(modules) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, 'src/stores/library-preferences.ts'), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => name === '@/services/async/serial-queue' ? require('./test-source-loader.cjs').loadSource('src/services/async/serial-queue.ts') : modules[name], mod, mod.exports);
  return mod.exports.useLibraryPreferences;
}
async function main() {
  let stored = null, grouping = null, reads = 0, failRead = false, failWrite = false;
  const modules = { zustand: require(path.join(root, 'node_modules/zustand')), 'react-native': { Platform: { OS: 'android' } }, 'expo-secure-store': {
    getItemAsync: async key => { reads++; if (failRead) throw Error('read'); return key === 'yeongdumusic-folder-albums-v1' ? stored : grouping; },
    setItemAsync: async (key, value) => { if (failWrite) throw Error('write'); if (key === 'yeongdumusic-folder-albums-v1') stored = value; else grouping = value; },
  } };
  let preferences = load(modules);
  await Promise.all([preferences.getState().load(), preferences.getState().load()]);
  assert.equal(reads, 2); assert.equal(preferences.getState().includeFolderAlbums, true); assert.equal(preferences.getState().groupAlbumsByTitle, false);
  await preferences.getState().setIncludeFolderAlbums(false);
  assert.equal(stored, 'false'); assert.equal(preferences.getState().includeFolderAlbums, false);
  preferences = load(modules); await preferences.getState().load();
  assert.equal(preferences.getState().includeFolderAlbums, false, 'Restore after restart');
  failWrite = true; await preferences.getState().setIncludeFolderAlbums(true);
  assert.equal(preferences.getState().includeFolderAlbums, false, 'A failed save must not change the displayed setting');
  assert(preferences.getState().error); assert.equal(preferences.getState().saving, false);
  failWrite = false;
  await Promise.all([preferences.getState().setIncludeFolderAlbums(true), preferences.getState().setIncludeFolderAlbums(false)]);
  assert.equal(stored, 'false'); assert.equal(preferences.getState().includeFolderAlbums, false);
  assert.equal(preferences.getState().error, null); assert.equal(preferences.getState().saving, false);
  failRead = true; await preferences.getState().load(true);
  assert.equal(preferences.getState().ready, true); assert(preferences.getState().error);
  failRead = false; await preferences.getState().load(true);
  assert.equal(preferences.getState().error, null); assert.equal(preferences.getState().loading, false);
  await preferences.getState().setGroupAlbumsByTitle(true);
  preferences = load(modules); await preferences.getState().load();
  assert.equal(preferences.getState().groupAlbumsByTitle, true); assert.equal(preferences.getState().includeFolderAlbums, false, 'Album grouping and folder display persist independently');
  failWrite = true; await preferences.getState().setGroupAlbumsByTitle(false);
  assert.equal(preferences.getState().groupAlbumsByTitle, true); assert(preferences.getState().error); failWrite = false;
  await Promise.all([preferences.getState().setGroupAlbumsByTitle(false), preferences.getState().setGroupAlbumsByTitle(true)]);
  assert.equal(grouping, 'true'); assert.equal(preferences.getState().groupAlbumsByTitle, true);
  grouping = 'corrupt'; await preferences.getState().load(true); assert.equal(preferences.getState().groupAlbumsByTitle, false);
  const jsx = (type, props) => ({ type, props });
  const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
  const Settings = require('./test-source-loader.cjs').loadSource('src/features/library/album-display-settings.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': { View: 'View', Pressable: 'Button', ActivityIndicator: 'Spinner', StyleSheet: { create: value => value, hairlineWidth: 1 } },
    '@expo/vector-icons/Ionicons': 'Icon', '@/components/text': { Text: 'Text' }, '@/components/animated-switch': { AnimatedSwitch: 'Switch' },
    '@/stores/library-preferences': { useLibraryPreferences: () => preferences.getState() },
    '@/theme/tokens': { useColors: () => ({ tint: '#f58', text: '#fff', muted: '#999', separator: '#333' }) },
    '@/features/settings/settings-menu-layout': { settingsMenuStyles: { row: {} }, useSettingsMenuIconStyle: () => ({}) },
  }).AlbumDisplaySettings;
  const toggle = nodes(Settings()).find(node => node.props?.accessibilityLabel === '앨범 제목만으로 묶기');
  assert.equal(toggle.props.value, false); toggle.props.onValueChange(true);
  for (let i = 0; i < 30; i++) await Promise.resolve();
  assert.equal(preferences.getState().groupAlbumsByTitle, true, 'The settings switch saves the selected grouping');
  console.log('PASS: folder-album defaults, deduplicated loading, persisted toggle/restart, failed-save rollback, ordered writes and load retry. SecureStore is mocked.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
