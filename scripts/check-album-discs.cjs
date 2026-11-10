const assert = require('node:assert/strict');
const { loadSource } = require('./test-source-loader.cjs');
const { albumDiscLayout } = loadSource('src/features/library/album-disc-layout.ts');
const { albumsFromSongs, songsForAlbum } = loadSource('src/features/library/album-library.ts');

function song(id, discNumber, trackNumber) {
  return { id, album: 'Double Album', albumSource: 'tag', artist: 'Artist', title: id, duration: 10, discNumber, trackNumber };
}

const songs = [song('2-2', 2, 2), song('1-3', 1, 3), song('2-1', 2, 1), song('1-1', 1, 1), song('1-2', 1, 2)];
const original = JSON.stringify(songs);
const page = { items: songs, total: songs.length, stale: true };
const albums = albumsFromSongs(page);
assert.equal(albums.total, 1, 'Disk numbers never split one album');
const ordered = songsForAlbum(page, albums.items[0]);
assert.deepEqual(ordered.items.map(item => item.id), ['1-1', '1-2', '1-3', '2-1', '2-2']);
assert.equal(ordered.stale, true);

for (const columns of [1, 2, 3]) {
  const layout = albumDiscLayout(ordered.items, columns);
  assert.equal(layout.discCount, 2);
  assert.equal(layout.showDiscs, true);
  assert.deepEqual(layout.rows.filter(row => row.showDiscHeading).map(row => row.discNumber), [1, 2]);
  assert(layout.rows.every(row => row.tracks.length <= columns));
  assert(layout.rows.every(row => row.tracks.every(track => track.song.discNumber === row.discNumber)), 'An odd track count never mixes disks in a tablet row');
  const tracks = layout.rows.flatMap(row => row.tracks);
  assert.deepEqual(tracks.map(track => track.trackNumber), [1, 2, 3, 1, 2]);
  for (const track of tracks) {
    assert.equal(ordered.items[track.queueIndex], track.song, 'Headings and grid padding do not shift playback selection');
  }
}

const missing = albumDiscLayout([song('missing', undefined), song('gap', 1, 4), song('two', 2)], 2);
assert.deepEqual(missing.rows.flatMap(row => row.tracks).map(track => track.trackNumber), [1, 4, 1]);
assert.equal(albumDiscLayout([song('single', 1, 1)], 1).showDiscs, false);
assert.equal(albumDiscLayout([song('only-second', 2, 1)], 1).rows[0].discNumber, 2);
assert.equal(albumDiscLayout([], 2).rows.length, 0);
assert.equal(albumDiscLayout([song('invalid', -1, NaN)], 1).rows[0].discNumber, 1);
assert.equal(JSON.stringify(songs), original, 'Display layout leaves saved song metadata untouched');
console.log('PASS: multi-disk ordering, headings, per-disk track numbering, odd tablet rows, queue selection, missing tags, single/empty albums and immutable metadata.');
