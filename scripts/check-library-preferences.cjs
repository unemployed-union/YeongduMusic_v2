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
  let stored = null, reads = 0, failRead = false, failWrite = false;
  const modules = { zustand: require(path.join(root, 'node_modules/zustand')), 'react-native': { Platform: { OS: 'android' } }, 'expo-secure-store': {
    getItemAsync: async () => { reads++; if (failRead) throw Error('read'); return stored; },
    setItemAsync: async (_, value) => { if (failWrite) throw Error('write'); stored = value; },
  } };
  let preferences = load(modules);
  await Promise.all([preferences.getState().load(), preferences.getState().load()]);
  assert.equal(reads, 1); assert.equal(preferences.getState().includeFolderAlbums, true);
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
  console.log('PASS: folder-album defaults, deduplicated loading, persisted toggle/restart, failed-save rollback, ordered writes and load retry. SecureStore is mocked.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
