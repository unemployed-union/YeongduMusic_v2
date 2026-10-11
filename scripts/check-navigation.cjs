const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));
const requireContext = require(path.join(root, 'node_modules/expo-router/build/testing-library/require-context-ponyfill.js')).default;
const { getRoutes } = require(path.join(root, 'node_modules/expo-router/build/getRoutesCore.js'));
const { getReactNavigationConfig } = require(path.join(root, 'node_modules/expo-router/build/getReactNavigationConfig.js'));
const routeFiles = requireContext(path.join(root, 'src/app'), true, /\.[jt]sx?$/).keys();
// Discover the actual route files with Expo Router, without rendering native screens.
const context = Object.assign(file => {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(root, 'src/app', file), 'utf8'), ts.ScriptTarget.Latest, true);
  const exports = { default: () => null };
  for (const statement of source.statements) if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.name.getText(source) !== 'unstable_settings' || !declaration.initializer || !ts.isObjectLiteralExpression(declaration.initializer)) continue;
      exports.unstable_settings = Object.fromEntries(declaration.initializer.properties.filter(property => ts.isPropertyAssignment(property) && ts.isStringLiteral(property.initializer)).map(property => [property.name.getText(source).replace(/['"]/g, ''), property.initializer.text]));
    }
  }
  return exports;
}, { keys: () => routeFiles, resolve: file => file, id: 'test-routes' });
const tree = getRoutes(context, { platform: 'android', importMode: 'lazy', ignoreRequireErrors: true });
const config = getReactNavigationConfig(tree, false);
const library = config.screens['(tabs)'].screens['(library)'];
assert.equal(library.initialRouteName, 'index');
assert.deepEqual(Object.keys(config.screens['(tabs)'].screens).sort(), ['(library)', 'search', 'settings']);
assert.ok(library.screens['album/[id]']);
assert.ok(library.screens['artist/[id]']);
assert.ok(library.screens['playlists/index']);
assert.equal(library.screens['playlists/[id]'].path, 'playlists/:id');
assert.equal(library.screens['album/[id]'].path, 'album/:id');
assert.equal(library.screens['artist/[id]'].path, 'artist/:id');
assert.equal(config.screens['album/[id]'], undefined);
assert.equal(config.screens['artist/[id]'], undefined);
assert.ok(config.screens.player, 'Player remains outside tabs as a full-screen modal');

let state = { queue: [], index: -1 }, calls = [], navigation = [], finish;
let action = async (songs, index) => { state = { queue: songs, index }; };
const modules = {
  'expo-router': { router: { navigate: route => navigation.push(route) } },
  '@/services/playback/controller': { playQueue: async (...args) => { calls.push(args); await action(...args); } },
  '@/stores/playback': { usePlaybackStore: { getState: () => state } },
};
const code = ts.transpileModule(fs.readFileSync(path.join(root, 'src/features/playback/play-and-open-player.ts'), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const actions = {};
new Function('require', 'exports', code)(name => modules[name], actions);
async function main() {
  const songs = [{ id: 'one' }, { id: 'two' }];
  await actions.playAndOpenPlayer(songs, 1);
  assert.equal(calls[0][0], songs);
  assert.equal(calls[0][1], 1);
  assert.deepEqual(navigation, ['/player']);
  navigation = [];
  await actions.playAndOpenPlayer([], 0);
  assert.equal(calls.length, 1);
  action = async () => { state = { queue: [], index: -1 }; };
  await actions.playAndOpenPlayer(songs, 0);
  assert.deepEqual(navigation, [], 'Rejected hidden selection or logout must not open the player');
  action = () => new Promise(resolve => { finish = resolve; });
  const oldSelection = actions.playAndOpenPlayer(songs, 0);
  state = { queue: songs, index: 1 };
  finish();
  await oldSelection;
  assert.deepEqual(navigation, [], 'Late completion must not open the player for an obsolete selection');
  action = async () => { throw new Error('mock failure'); };
  await assert.rejects(actions.playAndOpenPlayer(songs, 0), /mock failure/);
  assert.deepEqual(navigation, []);
  console.log('PASS: Expo Router discovery of nested library details and initial route, preserved detail paths, root player route, song/queue selection, cancelled/stale playback, and error propagation. Native UI and playback are not exercised.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
