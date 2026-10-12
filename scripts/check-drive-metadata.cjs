/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, modules = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', ...Object.keys(globals), code)(name => {
    if (name in modules) return modules[name];
    if (name.startsWith('jsmediatags/')) return require(name);
    throw Error('Unexpected dependency ' + name);
  }, mod, mod.exports, ...Object.values(globals));
  return mod.exports;
}
const tags = load('src/services/google-drive/read-tags.ts');
const api = load('src/services/google-drive/api.ts');
const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const le32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const sync = n => Buffer.from([(n >>> 21) & 127, (n >>> 14) & 127, (n >>> 7) & 127, n & 127]);
const picture = Buffer.from([255, 216, 255, 217]);
function id3() {
  const frame = (id, bytes) => Buffer.concat([Buffer.from(id), u32(bytes.length), Buffer.alloc(2), bytes]);
  const text = (id, text) => frame(id, Buffer.concat([Buffer.from([3]), Buffer.from(text)]));
  const body = Buffer.concat([text('TIT2', '테스트 제목'), text('TPE1', '가수'), text('TALB', '앨범'), text('TPE2', '앨범 가수'), text('TRCK', '3/12'), text('TPOS', '2/2'), text('TYER', '2026'), text('TLEN', '120000'), frame('APIC', Buffer.concat([Buffer.from([0]), Buffer.from('image/jpeg\0'), Buffer.from([3, 0]), picture]))]);
  return Buffer.concat([Buffer.from('ID3'), Buffer.from([3, 0, 0]), sync(body.length), body, Buffer.alloc(128)]);
}
function flac() {
  const block = (type, body) => Buffer.concat([Buffer.from([type, (body.length >>> 16) & 255, (body.length >>> 8) & 255, body.length & 255]), body]);
  const entries = ['TITLE=FLAC title', 'ARTIST=FLAC artist', 'ALBUM=FLAC album', 'TRACKNUMBER=4'];
  const comments = Buffer.concat([le32(0), le32(entries.length), ...entries.flatMap(entry => [le32(Buffer.byteLength(entry)), Buffer.from(entry)])]);
  const info = Buffer.alloc(34); const packed = (44100n << 44n) | (1n << 41n) | (15n << 36n) | 88200n; info.writeBigUInt64BE(packed, 10);
  const image = Buffer.concat([u32(3), u32(10), Buffer.from('image/jpeg'), u32(0), u32(1), u32(1), u32(24), u32(0), u32(picture.length), picture]);
  return Buffer.concat([Buffer.from('fLaC'), block(0, info), block(4, comments), block(134, image), Buffer.alloc(128)]);
}
function m4a() {
  const atom = (name, body) => Buffer.concat([u32(body.length + 8), Buffer.from(name, 'latin1'), body]);
  const field = (name, bytes, type = 1) => atom(name, atom('data', Buffer.concat([u32(type), u32(0), bytes])));
  const list = atom('ilst', Buffer.concat([field('©nam', Buffer.from('M4A title')), field('©ART', Buffer.from('M4A artist')), field('©alb', Buffer.from('M4A album')), field('aART', Buffer.from('M4A album artist')), field('covr', picture, 13)]));
  // moov is after the audio body: the reader must skip, not download, mdat.
  return Buffer.concat([atom('ftyp', Buffer.concat([Buffer.from('M4A '), u32(0), Buffer.from('M4A ')])), atom('mdat', Buffer.alloc(4096)), atom('moov', atom('udta', atom('meta', Buffer.concat([u32(0), list]))))]);
}
function harness(bytes, globals = {}) {
  const rows = new Map(), files = new Map(), calls = [];
  let fetchCount = 0;
  const db = { execAsync: async () => {}, getFirstAsync: async (_, key) => rows.has(key) ? { value: rows.get(key) } : null, runAsync: async (_, key, value) => { rows.set(key, value); } };
  const filesystem = {
    cacheDirectory: 'file:///cache/', EncodingType: { Base64: 'base64' }, makeDirectoryAsync: async () => {},
    getInfoAsync: async uri => ({ exists: files.has(uri), isDirectory: false, size: files.get(uri)?.length ?? 0 }),
    writeAsStringAsync: async (uri, value) => { files.set(uri, value); }, deleteAsync: async uri => { files.delete(uri); },
  };
  const mockFetch = globals.fetch ?? (async (url, options) => {
    fetchCount++; calls.push({ url, ...options });
    const [start, end] = options.headers.Range.match(/\d+/g).map(Number);
    const part = bytes.subarray(start, end + 1);
    return { status: 206, headers: new Headers({ 'content-range': `bytes ${start}-${end}/${bytes.length}`, 'content-length': String(part.length) }), arrayBuffer: async () => part };
  });
  const metadata = load('src/services/google-drive/metadata.ts', {
    'react-native': { Platform: { OS: 'android' } }, 'expo-sqlite': { openDatabaseAsync: async () => db },
    'expo-file-system/legacy': filesystem, './api': api, './read-tags': tags,
    'expo/fetch': { fetch: async (url, options) => {
      const response = await mockFetch(url, options);
      if (response.body) return response;
      let read = false;
      return { ...response, body: { getReader: () => ({
        read: async () => {
          if (read) return { done: true };
          read = true; return { done: false, value: new Uint8Array(await response.arrayBuffer()) };
        }, cancel: async () => {}, releaseLock: () => {},
      }) } };
    } },
  }, globals);
  return { metadata, rows, files, calls, get fetchCount() { return fetchCount; } };
}
async function main() {
  for (const [file, title] of [[id3(), '테스트 제목'], [flac(), 'FLAC title'], [m4a(), 'M4A title']]) {
    const ranges = [];
    const result = await tags.readEmbeddedTags(file.length, async (start, end) => { ranges.push([start, end]); return file.subarray(start, end + 1); }, new AbortController().signal);
    assert.equal(result.fields.title, title); assert.ok(result.fields.album); assert.ok(result.fields.artist);
    assert.deepEqual(Buffer.from(result.picture.bytes), picture);
    if (title === '테스트 제목') { assert.equal(result.fields.duration, 120); assert.equal(result.fields.discNumber, 2); assert.equal(result.fields.trackNumber, 3); assert.equal(result.fields.albumArtist, '앨범 가수'); }
    if (title === 'FLAC title') assert.equal(result.fields.duration, 2);
    if (title === 'M4A title') { assert.equal(result.fields.albumArtist, 'M4A album artist'); assert.ok(ranges.every(([a, b]) => b - a < 4096), 'Do not fetch audio mdat to get tail tags'); }
  }
  const plain = Buffer.alloc(256); assert.deepEqual(await tags.readEmbeddedTags(plain.length, async (a, b) => plain.subarray(a, b + 1), new AbortController().signal), { fields: {} });
  const large = Buffer.concat([Buffer.from('ID3'), Buffer.from([3, 0, 0]), sync(5 * 1024 * 1024), Buffer.alloc(128)]);
  await assert.rejects(tags.readEmbeddedTags(10 * 1024 * 1024, async (a, b) => large.subarray(a, b + 1), new AbortController().signal), /limit/);
  const cancel = new AbortController(); cancel.abort(); await assert.rejects(tags.readEmbeddedTags(256, async () => plain, cancel.signal), /Cancelled/);
  const badMp4 = Buffer.concat([u32(20), Buffer.from('ftypM4A '), Buffer.alloc(8), u32(0), Buffer.from('free'), Buffer.alloc(32)]);
  assert.deepEqual((await tags.readEmbeddedTags(badMp4.length, async (a, b) => badMp4.subarray(a, b + 1), new AbortController().signal)).fields, {});
  console.log('PASS: real MP3 ID3/UTF-8, FLAC tags/art/duration, tail M4A art/tags, untagged files, read limits and cancellation.');

  const bytes = id3(), h = harness(bytes);
  const song = { id: 'drive:A:file', source: 'drive', title: 'Filename', artist: 'unknown', album: 'Google Drive', albumId: 'drive:A', duration: 0, drive: { fileId: 'file', accountId: 'A', size: bytes.length, mimeType: 'audio/mpeg', modifiedTime: 'revision1' } };
  let result;
  assert.equal(await h.metadata.enrichDriveSongs([song], async () => 'fixture', new AbortController().signal, songs => { result = songs; }), 0);
  assert.equal(result[0].title, '테스트 제목'); assert.ok(result[0].artworkUrl.startsWith('file:///cache/drive-artwork/'));
  assert.notEqual(result[0].albumId, song.albumId); assert.equal(h.files.size, 1);
  assert.equal([...h.files.values()][0], picture.toString('base64'));
  for (const value of h.rows.values()) { assert.ok(!value.includes('fixture')); assert.ok(!value.includes('googleapis')); }
  const count = h.fetchCount;
  await h.metadata.enrichDriveSongs([song], async () => 'fixture', new AbortController().signal, () => {}); assert.equal(h.fetchCount, count, 'Persistent cache avoids repeat HTTP');
  h.files.clear(); await h.metadata.enrichDriveSongs([song], async () => 'fixture', new AbortController().signal, () => {}); assert.ok(h.fetchCount > count, 'Purged cover must be rebuilt');
  const refreshedCount = h.fetchCount;
  await h.metadata.enrichDriveSongs([{ ...song, drive: { ...song.drive, modifiedTime: 'revision2' } }], async () => 'fixture', new AbortController().signal, () => {}); assert.ok(h.fetchCount > refreshedCount, 'Changed file must invalidate tags');
  assert.ok(h.calls.every(call => !call.url.includes('fixture') && call.headers.Authorization === 'Bearer fixture'));
  for (let length = 0; length < 10; length++) { const bytes = Uint8Array.from({ length }, (_, i) => i * 23); assert.equal(h.metadata.base64(bytes), Buffer.from(bytes).toString('base64')); }
  console.log('PASS: tag/art cache, account-scoped album identity, version invalidation, purged artwork recovery and tokens excluded from cache/URLs.');

  let bodyRead = false;
  const ignored = harness(bytes, { fetch: async () => ({ status: 200, arrayBuffer: async () => { bodyRead = true; return bytes; } }) });
  const failures = await ignored.metadata.enrichDriveSongs([song], async () => 'fixture', new AbortController().signal, songs => { result = songs; });
  assert.equal(failures, 1); assert.equal(bodyRead, false); assert.equal(result[0].title, 'Filename'); assert.equal(ignored.rows.size, 0);
  for (const body of [Buffer.alloc(15), Buffer.alloc(17)]) {
    const invalid = harness(bytes, { fetch: async () => ({ status: 206, headers: new Headers({ 'content-range': `bytes 0-15/${bytes.length}` }), arrayBuffer: async () => body }) });
    assert.equal(await invalid.metadata.enrichDriveSongs([song], async () => 'fixture', new AbortController().signal, () => {}), 1);
    assert.equal(invalid.rows.size, 0, 'Truncated or oversized reads must not be cached');
  }
  let timerCallback, cleared = false, activeSignal;
  const stalled = harness(bytes, { setTimeout: callback => { timerCallback = callback; return 1; }, clearTimeout: () => { cleared = true; }, fetch: async (_, options) => {
    activeSignal = options.signal;
    return { status: 206, headers: new Headers({ 'content-range': `bytes 0-15/${bytes.length}`, 'content-length': '16' }), arrayBuffer: () => new Promise(() => {}) };
  } });
  const pending = stalled.metadata.enrichDriveSongs([song], async () => 'fixture', new AbortController().signal, () => {});
  for (let i = 0; i < 20 && !activeSignal; i++) await new Promise(resolve => setImmediate(resolve));
  assert.ok(activeSignal); timerCallback(); assert.equal(await pending, 1); assert.equal(activeSignal.aborted, true); assert.equal(cleared, true);
  let published = false;
  const abort = new AbortController();
  const stopped = harness(bytes, { fetch: async () => { abort.abort(); return new Promise(() => {}); } });
  assert.equal(await stopped.metadata.enrichDriveSongs([song], async () => 'fixture', abort.signal, () => { published = true; }), 0); assert.equal(published, false); assert.equal(stopped.rows.size, 0);
  let authCalls = 0, rejected;
  const retry = harness(bytes, { fetch: async (_, options) => {
    authCalls++;
    if (authCalls === 1) return { status: 401 };
    return { status: 206, headers: new Headers({ 'content-range': `bytes 0-15/${bytes.length}` }), arrayBuffer: async () => bytes.subarray(0, 16) };
  } });
  await retry.metadata.readDriveRange('file', bytes.length, 0, 15, async token => { rejected = token; return token ? 'new' : 'old'; }, new AbortController().signal);
  assert.equal(rejected, 'old'); assert.equal(authCalls, 2);
  console.log('PASS: ignored Range does not download audio, partial failure preserves playback fallback, body timeout, cancellation, timer cleanup and one 401 token refresh.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
