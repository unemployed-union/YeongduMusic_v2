const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));
const { create } = require(path.join(root, 'node_modules/zustand'));
function load(file, modules = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => { if (name in modules) return modules[name]; throw new Error('Unexpected module: ' + name); }, exports);
  return exports;
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
const rules = load('src/features/playlists/rules.ts');
const db = new DatabaseSync(':memory:');
let failWrite = false, delayWrite = null, delayRead = null, opens = 0;
const storage = load('src/services/playlists/storage.ts', {
  '@/features/playlists/rules': rules,
  'expo-sqlite': { openDatabaseAsync: async () => {
    opens++;
    return {
      execAsync: async sql => db.exec(sql),
      getFirstAsync: async (sql, ...args) => { const row = db.prepare(sql).get(...args); if (delayRead) await delayRead.promise; return row; },
      runAsync: async (sql, ...args) => { if (delayWrite) await delayWrite.promise; if (failWrite) throw new Error('disk full'); return db.prepare(sql).run(...args); },
    };
  } },
});
const freshStore = () => load('src/stores/playlists.ts', { zustand: { create }, '@/features/playlists/rules': rules, '@/services/playlists/storage': storage }).usePlaylistStore;
const song = id => ({ id, title: id, artist: 'Artist', album: 'Album', duration: 120, artworkUrl: 'https://example.invalid/?_sid=SECRET' });
async function main() {
  const store = freshStore();
  await assert.rejects(store.getState().createPreset('Workout'), /먼저/);
  await store.getState().load('demo');
  const first = await store.getState().createPreset(' 운동 ', ['a', 'b', 'a']);
  const second = await store.getState().createPreset('드라이브');
  assert.notEqual(first, second);
  assert.deepEqual(store.getState().profile.presets[0].songIds, ['a', 'b']);
  assert.equal(store.getState().profile.presets[0].name, '운동');
  await assert.rejects(store.getState().createPreset('운동'), /같은 이름/);
  await assert.rejects(store.getState().createPreset(' '), /이름/);
  await assert.rejects(store.getState().renamePreset(first, 'x'.repeat(61)), /이름/);
  await assert.rejects(store.getState().renamePreset(first, '드라이브'), /같은 이름/);
  await store.getState().addSongs(first, ['b', 'c']);
  await store.getState().addSongs(second, ['a']);
  assert.deepEqual(store.getState().profile.presets[0].songIds, ['a', 'b', 'c']);
  await store.getState().moveSong(first, 'c', -1);
  assert.deepEqual(store.getState().profile.presets[0].songIds, ['a', 'c', 'b']);
  // Hidden/missing songs stay saved but never leak metadata, counts, or playback.
  const preset = store.getState().profile.presets[0];
  assert.deepEqual(rules.playlistSongs(preset, [song('b'), song('a')]).map(item => item.id), ['a', 'b']);
  await store.getState().moveSong(first, 'b', -1, ['a', 'b']);
  assert.deepEqual(store.getState().profile.presets[0].songIds, ['b', 'c', 'a']);
  await store.getState().removeSong(first, 'c');
  await store.getState().renamePreset(first, '밤 산책');
  const rebooted = freshStore();
  await rebooted.getState().load('demo');
  assert.deepEqual(rebooted.getState().profile, store.getState().profile, 'Restore all playlists after app restart');
  await store.getState().load('nas-alice');
  assert.equal(store.getState().profile.presets.length, 0);
  await store.getState().createPreset('Alice');
  await store.getState().load('nas-bob');
  assert.equal(store.getState().profile.presets.length, 0);
  await store.getState().load('demo');
  assert.equal(store.getState().profile.presets.length, 2);
  assert.equal(opens, 1);
  const before = store.getState().profile;
  failWrite = true;
  await assert.rejects(store.getState().removePreset(first), /disk full/);
  assert.equal(store.getState().profile, before, 'Failed writes must preserve UI and persisted data');
  assert.equal(store.getState().busy, false);
  failWrite = false;
  await store.getState().load('demo');
  assert.deepEqual(store.getState().profile, before);
  delayWrite = deferred();
  const pending = store.getState().addSongs(first, ['late']);
  await assert.rejects(store.getState().removeSong(first, 'a'), /저장 중/);
  const switched = store.getState().load('nas-bob');
  const rejection = assert.rejects(pending, /계정이 변경/);
  delayWrite.resolve(); await rejection; await switched; delayWrite = null;
  assert.equal(store.getState().scope, 'nas-bob');
  assert.equal(store.getState().profile.presets.length, 0);
  await store.getState().load('demo');
  assert.ok(store.getState().profile.presets[0].songIds.includes('late'), 'In-flight saves stay with their original account');
  delayRead = deferred();
  const lateRead = store.getState().load('demo');
  await new Promise(done => setImmediate(done));
  const latestRead = store.getState().load('nas-bob');
  delayRead.resolve(); await Promise.all([lateRead, latestRead]); delayRead = null;
  assert.equal(store.getState().scope, 'nas-bob');
  assert.equal(store.getState().profile.presets.length, 0, 'Late reads must not replace another account');
  db.prepare('INSERT OR REPLACE INTO profiles VALUES (?, ?)').run('broken', '{bad');
  await store.getState().load('broken');
  assert.equal(store.getState().ready, false);
  await assert.rejects(store.getState().createPreset('Do not overwrite'), /먼저/);
  assert.equal(db.prepare('SELECT value FROM profiles WHERE scope = ?').get('broken').value, '{bad');
  await store.getState().load('demo');
  await store.getState().removePreset(second);
  await assert.rejects(store.getState().addSongs(second, ['a']), /삭제/);
  assert.equal(store.getState().profile.presets.length, 1);
  // Storage strips unexpected song metadata and validates version/schema on read.
  await storage.writePlaylists('clean', { version: 1, presets: [{ id: 'safe', name: 'Safe', songIds: ['a'], songs: [song('a')], artworkUrl: 'SECRET' }] });
  assert.ok(!db.prepare('SELECT value FROM profiles WHERE scope = ?').get('clean').value.includes('SECRET'));
  assert.throws(() => rules.parsePlaylists('{broken'));
  assert.throws(() => rules.parsePlaylists('{"version":2,"presets":[]}'));
  assert.throws(() => rules.parsePlaylists(JSON.stringify({ version: 1, presets: [{ id: 'a', name: 'A', songIds: [] }, { id: 'a', name: 'B', songIds: [] }] })));
  console.log('PASS: SQLite round-trip, multiple presets, duplicate prevention, ordered additions/removal/reordering, filtered playback, account isolation, restarts, concurrent saves, delayed reads/writes, disk failures, corrupted data, and credential-free persistence. Native UI remains unverified.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.close());
