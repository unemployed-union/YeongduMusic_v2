const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));
function load(file, modules = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const result = {};
  new Function('require', 'exports', code)(name => { if (!(name in modules)) throw new Error('Unexpected dependency: ' + name); return modules[name]; }, result);
  return result;
}
const rules = load('src/features/hidden-music/rules.ts');
const { buildFolderTree, visibleFolderRows } = load('src/features/hidden-music/folder-tree.ts', { './rules': rules });
const songs = [
  { id: 'one', path: '/music/Pop/Live/one.mp3' },
  { id: 'two', path: '/music/Pop/two.mp3' },
  { id: 'three', path: '/music/Popcorn/three.mp3' },
  { id: 'four', path: '/home/music/Korean/four.mp3' },
];
const tree = buildFolderTree(rules.foldersForSongs(songs));
const selected = new Set(['/music/Pop/Live']);
const paths = rows => rows.map(row => row.path);
const closed = visibleFolderRows(tree, new Set(), selected);
assert.deepEqual(paths(closed), ['/home', '/music']);
assert.equal(closed[1].count, 3);
const open = visibleFolderRows(tree, new Set(['/music', '/music/Pop']), selected);
assert.deepEqual(paths(open), ['/home', '/music', '/music/Pop', '/music/Pop/Live', '/music/Popcorn']);
assert.equal(open.find(row => row.path === '/music/Pop/Live').depth, 2);
assert.equal(open.find(row => row.path === '/music/Pop').count, 2);
const before = [...selected];
visibleFolderRows(tree, new Set(), selected);
assert.deepEqual([...selected], before, 'Collapsing must not modify hidden selections');
const search = visibleFolderRows(tree, new Set(), selected, 'LIVE');
assert.deepEqual(paths(search), ['/music', '/music/Pop', '/music/Pop/Live']);
assert.ok(search.slice(0, 2).every(row => row.expanded));
const onlySelected = visibleFolderRows(tree, new Set(), selected, '', true);
assert.deepEqual(paths(onlySelected), paths(search));
assert.deepEqual(paths(visibleFolderRows(tree, new Set(), selected, 'Popcorn', true)), []);
const parent = new Set(['/music/Pop']);
const inherited = visibleFolderRows(tree, new Set(['/music', '/music/Pop']), parent);
assert.equal(inherited.find(row => row.path === '/music/Pop/Live').coveredByParent, true);
assert.equal(inherited.find(row => row.path === '/music/Popcorn').coveredByParent, false);
const preset = { enabled: true, folders: [...parent], songIds: [] };
assert.deepEqual(songs.filter(rules.hiddenMatcher([preset])).map(song => song.id), ['one', 'two']);
assert.equal(rules.hiddenMatcher([preset])({ id: 'future', path: '/music/Pop/New/new.mp3' }), true);
const savedTree = buildFolderTree(rules.foldersForSongs(songs), ['/music/Missing/Child']);
const savedRows = visibleFolderRows(savedTree, new Set(), new Set(['/music/Missing/Child']), '', true);
assert.deepEqual(paths(savedRows), ['/music', '/music/Missing', '/music/Missing/Child']);
assert.equal(savedRows.at(-1).count, 0);
const relative = buildFolderTree([{ path: 'musi', count: 1 }, { path: 'music', count: 2 }, { path: 'music/Child', count: 2 }]);
assert.deepEqual(relative.map(node => node.path), ['musi', 'music']);
assert.equal(relative[1].children[0].path, 'music/Child');
assert.deepEqual(visibleFolderRows([], new Set(), new Set()), []);
const wide = buildFolderTree(Array.from({ length: 1500 }, (_, index) => ({ path: '/music/folder-' + index, count: 1 })));
assert.equal(visibleFolderRows(wide, new Set(), new Set()).length, 1);
assert.equal(visibleFolderRows(wide, new Set(['/music']), new Set()).length, 1501);
console.log('PASS: tree hierarchy/counts, expansion/collapse, unchanged hidden selections, ancestor-preserving search/selected view, inherited hiding/path boundaries, missing saved folders, relative paths, empty and large trees. Native UI is not exercised.');
