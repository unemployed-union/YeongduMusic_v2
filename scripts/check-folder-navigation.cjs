const assert = require('node:assert/strict');
const { loadSource } = require('./test-source-loader.cjs');
const mocks = { '@/services/music-source': { isNasSong: () => true } };
const rules = loadSource('src/features/hidden-music/rules.ts', mocks);
const { buildFolderTree } = loadSource('src/features/hidden-music/folder-tree.ts', mocks);
const { indexFolderTree, folderNavigationRows, parentFolderPath } = loadSource(
  'src/features/hidden-music/folder-navigation.ts',
);
const songs = [
  { id: 'a', path: '/music/Pop/Live/a.mp3' },
  { id: 'b', path: '/music/Jazz/Live/b.mp3' },
  { id: 'c', path: '/music/Popcorn/c.mp3' },
];
const saved = ['/music/Pop', '/music/Pop/Live', '/archive/Missing'];
const selected = new Set(saved);
const tree = buildFolderTree(rules.foldersForSongs(songs), saved);
const index = indexFolderTree(tree);
const rows = (path = '', term = '', only = false) =>
  folderNavigationRows(tree, index, path, selected, term, only);
const paths = (items) => items.map((item) => item.path);
assert.deepEqual(paths(rows()), ['/archive', '/music']);
assert.deepEqual(paths(rows('/music')), ['/music/Jazz', '/music/Pop', '/music/Popcorn']);
assert.deepEqual(paths(rows('/music/Pop')), ['/music/Pop/Live']);
assert.deepEqual(paths(rows('/music/Pop/Live')), []);
assert.equal(parentFolderPath('/music/Pop/Live'), '/music/Pop');
assert.equal(parentFolderPath('/music'), '');
assert.equal(parentFolderPath('music'), '');
assert.equal(parentFolderPath('music/Pop'), 'music');
assert(rows('/music/Pop')[0].coveredByParent);
assert(!rows('/music').find((item) => item.path.endsWith('Popcorn')).coveredByParent);
assert(rows('/music').every((item) => item.depth === 0));
assert.deepEqual(paths(rows('/music/Pop', '', true)), [...saved].sort());
assert.deepEqual(paths(rows('', 'LIVE')), ['/music/Jazz/Live', '/music/Pop/Live']);
assert.deepEqual(paths(rows('', 'live', true)), ['/music/Pop/Live']);
assert.deepEqual(paths(rows('', 'ｌｉｖｅ')), paths(rows('', 'LIVE')));
assert.deepEqual(rows('/deleted'), []);
assert.equal(rows('/archive')[0].count, 0);
assert.deepEqual([...selected], saved, 'Navigation and filtering preserve explicit selections');
const preset = { id: 'p', name: 'Music', enabled: true, folders: saved, songIds: ['a', 'b'] };
assert.deepEqual(
  songs.filter(rules.hiddenMatcher([preset])).map((song) => song.id),
  ['a', 'b'],
);
const restored = rules.parseProfile(
  JSON.stringify({
    version: 1,
    biometricLock: false,
    presets: [preset],
  }),
).presets[0];
assert.deepEqual(restored, preset);
const wide = buildFolderTree(
  Array.from({ length: 1500 }, (_, i) => ({ path: `/music/${i}`, count: 1 })),
);
assert.equal(folderNavigationRows(wide, indexFolderTree(wide), '/music', new Set()).length, 1500);
console.log(
  'PASS: immediate children, deep/back navigation, flat global search and explicit selection filters, same-name paths, parent coverage, missing/empty folders, 1500 siblings, preset round-trip and duplicate-free hiding.',
);
