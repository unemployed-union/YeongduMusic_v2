const assert = require('node:assert/strict');
const { loadSource } = require('./test-source-loader.cjs');
const { moveMenuItems, defaultMenuLayout } = loadSource('src/features/settings/menu-layout.ts');

const items = ['a', 'b', 'c', 'd', 'e'];
assert.deepEqual(moveMenuItems(items, [0], 5), ['b', 'c', 'd', 'e', 'a']);
assert.deepEqual(moveMenuItems(items, [4], 0), ['e', 'a', 'b', 'c', 'd']);
assert.deepEqual(moveMenuItems(items, [1], 3), ['a', 'c', 'b', 'd', 'e']);
assert.deepEqual(moveMenuItems(items, [3, 1], 5), ['a', 'c', 'e', 'b', 'd']);
for (const [sources, destination] of [
  [[0], 1],
  [[2], 2],
  [[], 0],
  [[-1], 1],
  [[5], 0],
  [[1, 1], 3],
  [[0], -1],
  [[0], 6],
  [[0.5], 1],
]) {
  assert.equal(
    moveMenuItems(items, sources, destination),
    items,
    'Invalid or unchanged moves are ignored',
  );
}

const saved = new Map();
let rejectWrites = false;
let writes = 0;
const storage = {
  getItemAsync: async (key) => saved.get(key) ?? null,
  setItemAsync: async (key, value) => {
    writes++;
    if (rejectWrites) {
      throw new Error('disk full');
    }
    saved.set(key, value);
  },
};
function createStore() {
  return loadSource('src/stores/menu-preferences.ts', {
    zustand: require('zustand'),
    'react-native': { Platform: { OS: 'ios' } },
    'expo-secure-store': storage,
  }).useMenuPreferences;
}

async function main() {
  let store = createStore();
  await store.getState().load();
  for (const group of ['bottom', 'library', 'player']) {
    const initial = store.getState().layout[group];
    await store.getState().setVisible(group, initial[1].id, false);
    const visibility = Object.fromEntries(
      store.getState().layout[group].map((item) => [item.id, item.visible]),
    );
    const ids = initial.map((item) => item.id).reverse();
    await store.getState().reorder(group, ids);
    assert.deepEqual(
      store.getState().layout[group].map((item) => item.id),
      ids,
    );
    assert.deepEqual(
      Object.fromEntries(store.getState().layout[group].map((item) => [item.id, item.visible])),
      visibility,
    );
    store = createStore();
    await store.getState().load();
    assert.deepEqual(
      store.getState().layout[group].map((item) => item.id),
      ids,
      'Drag order survives restart',
    );
  }

  await store.getState().restore(defaultMenuLayout());
  await Promise.all([
    store.getState().setVisible('bottom', 'search', false),
    store.getState().reorder('bottom', ['search', 'library', 'playlists']),
  ]);
  assert.equal(
    store.getState().layout.bottom[0].visible,
    false,
    'A queued drag preserves a concurrent visibility edit',
  );
  assert.deepEqual(
    store.getState().layout.bottom.map((item) => item.id),
    ['search', 'library', 'playlists'],
  );
  const before = store.getState().layout;
  for (const invalid of [
    [],
    ['library', 'library', 'search'],
    ['library', 'playlists', 'lyrics'],
  ]) {
    const previousWrites = writes;
    await store.getState().reorder('bottom', invalid);
    assert.deepEqual(store.getState().layout, before);
    assert.equal(writes, previousWrites, 'Malformed or stale row IDs are never persisted');
    assert(store.getState().error);
  }
  rejectWrites = true;
  await store.getState().reorder('bottom', ['library', 'playlists', 'search']);
  assert.deepEqual(store.getState().layout, before, 'A failed save keeps the last persisted order');
  assert(store.getState().error);
  assert.equal(store.getState().saving, false);
  rejectWrites = false;
  await store.getState().reorder('bottom', ['library', 'playlists', 'search']);
  assert.equal(store.getState().error, null);
  store = createStore();
  await store.getState().load();
  assert.deepEqual(
    store.getState().layout.bottom.map((item) => item.id),
    ['library', 'playlists', 'search'],
  );
  assert.equal(store.getState().layout.bottom[2].visible, false);
  console.log(
    'PASS: native drag offsets, end/up/down/multiple-row moves, all three menu groups, restart persistence, concurrent visibility edits, invalid IDs, disk failure and retry. Storage is mocked.',
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
