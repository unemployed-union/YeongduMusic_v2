const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { create } = require('zustand');
const { QueryClient } = require('@tanstack/react-query');
const { loadSource } = require('./test-source-loader.cjs');

async function flush() {
  for (let i = 0; i < 40; i++) {
    await Promise.resolve();
  }
}

function clock() {
  let now = 1_000_000;
  let serial = 0;
  const timers = new Map();
  return {
    now: () => now,
    globals: {
      setTimeout: (fn, ms) => {
        timers.set(++serial, { fn, at: now + ms });
        return serial;
      },
      clearTimeout: (id) => timers.delete(id),
    },
    async advance(ms) {
      const target = now + ms;
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) {
          break;
        }
        now = next[1].at;
        timers.delete(next[0]);
        next[1].fn();
        await flush();
      }
      now = target;
      await flush();
    },
    timers,
  };
}

function song(id, extra = {}) {
  return { id, source: 'nas', title: id, artist: 'Artist', album: 'Album', duration: 20, ...extra };
}

async function checkScheduler() {
  const time = clock();
  const { createLibrarySyncTask } = loadSource('src/services/music-providers/library-sync-task.ts', {}, time.globals);
  let requests = 0;
  const task = createLibrarySyncTask({ now: time.now, hydrate: async () => 0, refresh: async () => {
    requests++;
    return time.now();
  } });
  let release = task.acquire();
  await flush();
  for (let i = 1; i < 39; i++) {
    release();
    await time.advance(31_000);
    release = task.acquire();
    await flush();
  }
  assert.equal(requests, 2, '39 visits over 19m38s perform two full scans, not 39');
  release();
  await time.advance(60 * 60_000);
  assert.equal(requests, 2, 'Settings/inactive consumers produce no polling');
  assert.equal(time.timers.size, 0);
  console.log('MEASURED (fake clock): 39 visits / 19m38s, 30s policy=39 NAS scans, new policy=2; at 16 pages/scan: 624 versus 32 requests. Not a live NAS measurement.');

  let full = 0;
  let changes = 0;
  const deltaTask = createLibrarySyncTask({ now: time.now, hydrate: async () => time.now(),
    refresh: async () => { full++; return time.now(); },
    revalidate: async () => { changes++; return 'unchanged'; } });
  const a = deltaTask.acquire();
  const b = deltaTask.acquire();
  await flush();
  await time.advance(5 * 60_000);
  assert.equal(changes, 1);
  assert.equal(full, 0);
  a();
  await time.advance(5 * 60_000);
  assert.equal(changes, 2);
  await time.advance(5 * 60_000);
  assert.equal(full, 1, 'A full scan remains the 15 minute safety net');
  b();

  let failedCalls = 0;
  const failed = createLibrarySyncTask({ now: time.now, hydrate: async () => 0, refresh: async () => {
    failedCalls++;
    throw Error('offline');
  } });
  const stopFailed = failed.acquire();
  await flush();
  await time.advance(59_000);
  assert.equal(failedCalls, 1);
  await time.advance(1000);
  assert.equal(failedCalls, 2);
  await time.advance(119_000);
  assert.equal(failedCalls, 2);
  await time.advance(1000);
  assert.equal(failedCalls, 3);
  await assert.rejects(failed.refresh());
  assert.equal(failedCalls, 4, 'Manual retry bypasses the backoff');
  stopFailed();

  let authCalls = 0;
  const denied = createLibrarySyncTask({ now: time.now, hydrate: async () => 0, refresh: async () => {
    authCalls++;
    throw Object.assign(Error('denied'), { status: 403 });
  } });
  const stopDenied = denied.acquire();
  await flush();
  await time.advance(60 * 60_000);
  assert.equal(authCalls, 1, 'Authorization failures do not poll indefinitely');
  stopDenied();

  let pendingSignal;
  let finish;
  const pending = createLibrarySyncTask({ now: time.now, hydrate: async () => 0, refresh: (signal) => {
    pendingSignal = signal;
    return new Promise((resolve) => { finish = resolve; });
  } });
  const stopA = pending.acquire();
  const stopB = pending.acquire();
  await flush();
  const manual = pending.refresh();
  stopA();
  assert.equal(pendingSignal.aborted, false);
  stopB();
  assert.equal(pendingSignal.aborted, true);
  finish(time.now());
  await manual;
  assert.equal(time.timers.size, 0);
}

async function checkSnapshots() {
  const db = new DatabaseSync(':memory:');
  let failWrites = false;
  const nativeDb = {
    withExclusiveTransactionAsync: async (work) => {
      db.exec('BEGIN');
      try {
        await work(nativeDb);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    execAsync: async (sql) => db.exec(sql),
    getFirstAsync: async (sql, ...args) => db.prepare(sql).get(...args) ?? null,
    runAsync: async (sql, ...args) => {
      if (failWrites) {
        throw Error('disk full');
      }
      return db.prepare(sql).run(...args);
    },
  };
  const snapshots = loadSource('src/services/music-providers/library-snapshots.ts', {
    'react-native': { Platform: { OS: 'android' } },
    'expo-sqlite': { openDatabaseAsync: async () => nativeDb },
  });
  const key = snapshots.librarySnapshotKey('nas', 'account-a', 'all');
  await snapshots.writeLibrarySnapshot(key, { version: 1, items: [song('one', {
    artworkUrl: 'https://private.invalid/?_sid=secret', headers: { Authorization: 'secret' }, accessToken: 'secret',
  })], validatedAt: 100, metadata: { cursor: 'checkpoint' } });
  const saved = await snapshots.readLibrarySnapshot(key);
  assert.equal(saved.metadata.cursor, 'checkpoint');
  assert.equal(saved.items[0].artworkUrl, undefined);
  assert.equal(saved.items[0].headers, undefined);
  assert.equal(saved.items[0].accessToken, undefined);
  assert(!db.prepare('SELECT value FROM library_snapshots').get().value.includes('secret'));
  assert.equal(await snapshots.readLibrarySnapshot(snapshots.librarySnapshotKey('nas', 'account-b', 'all')), null);
  failWrites = true;
  await assert.rejects(snapshots.writeLibrarySnapshot(key, { version: 1, items: [], validatedAt: 200 }));
  assert.equal((await snapshots.readLibrarySnapshot(key)).validatedAt, 100, 'A failed replace retains the old complete snapshot and checkpoint');
  failWrites = false;
  let stillCurrent = true;
  const originalRun = nativeDb.runAsync;
  nativeDb.runAsync = async (...args) => {
    const result = await originalRun(...args);
    stillCurrent = false;
    return result;
  };
  await assert.rejects(snapshots.writeLibrarySnapshot(key, { version: 1, items: [], validatedAt: 300 }, () => stillCurrent));
  nativeDb.runAsync = originalRun;
  assert.equal((await snapshots.readLibrarySnapshot(key)).validatedAt, 100, 'Cancellation during the write rolls back the complete snapshot and cursor');
  await nativeDb.execAsync('CREATE TABLE IF NOT EXISTS pages (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at INTEGER NOT NULL)');
  for (const offset of [0, 100, 200]) {
    const items = Array.from({ length: Math.min(100, 205 - offset) }, (_, i) => song('legacy-' + (offset + i)));
    await nativeDb.runAsync('INSERT INTO pages VALUES (?, ?, ?)', 'old:songs::' + offset + ':100', JSON.stringify({ items, total: 205 }), offset);
  }
  const legacy = await snapshots.readLegacyNasLibrary('old');
  assert.equal(legacy.items.length, 205);
  assert.equal(legacy.validatedAt, 0);
  db.prepare('DELETE FROM pages WHERE key = ?').run('old:songs::100:100');
  assert.equal(await snapshots.readLegacyNasLibrary('old'), null, 'A partial old cache cannot masquerade as a complete catalog');
  assert.throws(() => snapshots.parseLibrarySnapshot(JSON.stringify({ version: 1, validatedAt: 0, items: [song('x'), song('x')] })));
  await snapshots.writeLibrarySnapshot(snapshots.librarySnapshotKey('drive', 'account-a'), { version: 1, items: [], validatedAt: 1 });
  const cache = loadSource('src/services/music-providers/cache.ts', {
    'react-native': { Platform: { OS: 'android' } }, 'expo-sqlite': { openDatabaseAsync: async () => nativeDb },
  });
  await cache.clearLibraryCache('nas:');
  assert.equal(await snapshots.readLibrarySnapshot(key), null);
  assert(await snapshots.readLibrarySnapshot(snapshots.librarySnapshotKey('drive', 'account-a')), 'NAS cache clearing preserves the other provider snapshots');
  db.close();
}

async function checkChanges() {
  let fail = false;
  const requests = [];
  const changes = loadSource('src/services/google-drive/changes.ts', {
    './api': { driveJson: async (url, token, signal) => {
      assert.equal(await token(), 'header-token');
      assert(!signal.aborted);
      const parsed = new URL(url);
      requests.push(parsed);
      if (parsed.pathname.endsWith('startPageToken')) {
        return { startPageToken: 'before-baseline' };
      }
      if (fail) {
        throw Error('network');
      }
      return parsed.searchParams.get('pageToken') === 'first'
        ? { changes: [{ fileId: 'one' }, { fileId: 'not-selected' }, { fileId: 'two', removed: true }], nextPageToken: 'second' }
        : { changes: [{ fileId: 'one', file: { trashed: true } }, { fileId: 'three' }], newStartPageToken: 'committed' };
    } },
  });
  const signal = new AbortController().signal;
  assert.equal(await changes.startDriveChanges(async () => 'header-token', signal), 'before-baseline');
  const delta = await changes.readDriveChanges('first', new Set(['one', 'two', 'three']), async () => 'header-token', signal);
  assert.deepEqual([...delta.changed], ['three']);
  assert.deepEqual([...delta.removed], ['two', 'one']);
  assert.equal(delta.cursor, 'committed');
  assert(requests.every(url => !url.toString().includes('header-token')));
  fail = true;
  await assert.rejects(changes.readDriveChanges('first', new Set(['one']), async () => 'header-token', signal));
}

async function checkQueue() {
  const { createDeletionTracker, removeDeletedFutureSongs } = loadSource('src/services/music-providers/catalog-deletions.ts', {
    '@/stores/playback': { usePlaybackStore: create(() => ({ queue: [], index: 0 })) },
  });
  const tracker = createDeletionTracker();
  tracker.baseline([song('old'), song('keep')]);
  assert.equal(tracker.compare([song('keep')]).size, 0);
  assert.deepEqual([...tracker.compare([song('keep')])], ['old']);
  assert.equal(tracker.compare([song('old'), song('keep')]).size, 0);
  let state = { queue: [song('past'), song('current'), song('gone'), song('local', { source: 'local' }), song('other', { source: 's3' })], index: 1, playing: true, position: 42, shuffle: true, repeat: 'all' };
  const rules = loadSource('src/services/music-providers/catalog-deletions.ts', {
    '@/stores/playback': { usePlaybackStore: { setState: (update) => { state = { ...state, ...update(state) }; } } },
  });
  await rules.removeDeletedFutureSongs({ id: 'nas', getState: () => ({ scope: 'a' }) }, new Set(['past', 'current', 'gone', 'local', 'other']));
  assert.deepEqual(state.queue.map(item => item.id), ['past', 'current', 'local', 'other']);
  assert.equal(state.position, 42);
  assert.equal(state.index, 1);
  assert.equal(state.playing, true);
  assert.equal(state.shuffle, true);
  assert.equal(typeof removeDeletedFutureSongs, 'function');
}

async function checkPlaylistQueries() {
  const time = clock();
  const originalNow = Date.now;
  Date.now = time.now;
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
  try {
    const { acquireLibraryQuery } = loadSource('src/services/music-providers/query-library-task.ts', {}, time.globals);
    let requests = 0;
    let fail = false;
    const key = ['provider-playlist-songs', 'jellyfin', 'scope', 'playlist', 1];
    const ordered = [song('duplicate'), song('other'), song('duplicate')];
    await client.fetchQuery({ queryKey: key, staleTime: Infinity, queryFn: async () => {
      requests++;
      if (fail) {
        throw Error('offline');
      }
      return ordered;
    } });
    const a = acquireLibraryQuery(client, key);
    const b = acquireLibraryQuery(client, key);
    await flush();
    assert.equal(requests, 1);
    await time.advance(5 * 60_000);
    assert.equal(requests, 2, 'Server playlists refresh at five minutes without duplicate observers');
    assert.deepEqual(client.getQueryData(key).map(song => song.id), ['duplicate', 'other', 'duplicate']);
    fail = true;
    await time.advance(5 * 60_000);
    assert.equal(requests, 3);
    assert.equal(client.getQueryData(key), ordered, 'Refresh failure preserves the ordered server playlist');
    await time.advance(59_000);
    assert.equal(requests, 3);
    await time.advance(1000);
    assert.equal(requests, 4, 'Server playlist failures share the one minute initial backoff');
    a();
    b();
    await time.advance(60 * 60_000);
    assert.equal(requests, 4);
  } finally {
    client.clear();
    Date.now = originalNow;
  }
}

async function main() {
  await checkScheduler();
  await checkSnapshots();
  await checkChanges();
  await checkQueue();
  await checkPlaylistQueries();
  let focused = true;
  let foreground = true;
  let changed;
  let removed = false;
  const activityStops = [];
  const activity = loadSource('src/features/library/use-library-activity.ts', {
    'expo-router': { useIsFocused: () => focused },
    react: { useState: () => [foreground, (value) => { foreground = value; }], useEffect: (effect) => activityStops.push(effect()) },
    'react-native': { AppState: { currentState: 'active', addEventListener: (_event, listener) => { changed = listener; return { remove: () => { removed = true; } }; } } },
  });
  assert.equal(activity.useLibraryActivity(), true);
  changed('background');
  assert.equal(activity.useLibraryActivity(), false);
  changed('active');
  focused = false;
  assert.equal(activity.useLibraryActivity(), false);
  focused = true;
  assert.equal(activity.useLibraryActivity(false), false);
  activityStops.forEach((stop) => stop());
  assert.equal(removed, true);
  const { loadSongLibrary } = loadSource('src/features/library/load-song-library.ts');
  await assert.rejects(loadSongLibrary({ songs: async () => ({ items: [song('dup'), song('dup')], total: 2 }) }, new AbortController().signal), /변경/);
  await assert.rejects(loadSongLibrary({ songs: async ({ offset }) => offset === 0
    ? { items: [song('one')], total: 2 } : { items: [song('two')], total: 3 } }, new AbortController().signal), /변경/);
  console.log('PASS: scoped complete snapshots, legacy recovery, atomic failure, redaction, foreground demand, deduplication, timers/backoff/auth, Drive cursors and ordered selected changes, conservative deletion and playback preservation.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
