/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { Buffer } = require('node:buffer'), ts = require('typescript'), { create } = require('zustand');
function load(file, modules = {}, globals = {}) {
  modules = { ...require('./test-cloud-fixtures.cjs').cloudFixtures(globals, modules), ...modules };
  const exports = {}, code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  new Function('require', 'exports', ...Object.keys(globals), code)(name => {
    if (name === 'zustand') return { create };
    if (name in modules) return modules[name];
    if (name.startsWith('jsmediatags/')) return require(name);
    throw Error('Unexpected import ' + name);
  }, exports, ...Object.values(globals));
  return exports;
}
const writer = load('src/services/metadata/tag-writer.ts'), fields = { title: '새 제목 🎵', artist: '아티스트', album: '앨범', albumArtist: '앨범 가수', year: 2026, trackNumber: 4, discNumber: 2 };
const tags = load('src/services/google-drive/read-tags.ts'), options = load('src/features/metadata/file-options.ts');
const u32 = n => { const bytes = Buffer.alloc(4); bytes.writeUInt32BE(n); return bytes; };
const le32 = n => { const bytes = Buffer.alloc(4); bytes.writeUInt32LE(n); return bytes; };
const sync = n => Buffer.from([(n >>> 21) & 127, (n >>> 14) & 127, (n >>> 7) & 127, n & 127]);
const frame = (id, body, version = 3) => Buffer.concat([Buffer.from(id), version === 4 ? sync(body.length) : u32(body.length), Buffer.alloc(2), body]);
const audio = Buffer.concat([Buffer.from([255, 251, 144, 0]), Buffer.from(Array.from({ length: 8192 }, (_, index) => index % 256))]);
const image = Buffer.from([255, 216, 255, 217]);
const newImage = Buffer.concat([Buffer.from([255, 216, 255]), Buffer.alloc(2048, 42), Buffer.from([255, 217])]);
const cover = { bytes: new Uint8Array(newImage), mime: 'image/jpeg', width: 500, height: 400 };
const artwork = frame('APIC', Buffer.concat([Buffer.from([0]), Buffer.from('image/jpeg\0'), Buffer.from([3, 0]), image]));
const lyrics = frame('USLT', Buffer.from([3, 101, 110, 103, 0, 65, 66, 67]));
function mp3(version = 3, footer = false, extended = false) {
  const toVersion = bytes => frame(bytes.subarray(0, 4).toString(), bytes.subarray(10), version);
  const extension = !extended ? Buffer.alloc(0) : version === 3 ? Buffer.concat([u32(6), Buffer.alloc(6)]) : Buffer.from([0, 0, 0, 6, 1, 0]);
  const frames = Buffer.concat([toVersion(artwork), toVersion(lyrics), frame('TIT2', Buffer.from([0, 79, 108, 100]), version), frame('TRCK', Buffer.from([0, 49]), version)]);
  const body = Buffer.concat([extension, frames, footer ? Buffer.alloc(0) : Buffer.alloc(1024)]);
  const header = Buffer.concat([Buffer.from('ID3'), Buffer.from([version, 0, (extended ? 64 : 0) | (footer ? 16 : 0)]), sync(body.length)]);
  return Buffer.concat([header, body, footer ? Buffer.concat([Buffer.from('3DI'), header.subarray(3)]) : Buffer.alloc(0), audio]);
}
function flac() {
  const block = (type, bytes) => Buffer.concat([Buffer.from([type, bytes.length >>> 16, (bytes.length >>> 8) & 255, bytes.length & 255]), bytes]);
  const entries = ['TITLE=Old title', 'ARTIST=Old artist', 'REPLAYGAIN_TRACK_GAIN=-3 dB', 'LYRICS=가사'];
  const comments = Buffer.concat([le32(4), Buffer.from('test'), le32(entries.length), ...entries.flatMap(entry => [le32(Buffer.byteLength(entry)), Buffer.from(entry)])]);
  const stream = Buffer.alloc(34); stream.writeBigUInt64BE((44100n << 44n) | (1n << 41n) | (15n << 36n) | 88200n, 10);
  const picture = Buffer.concat([u32(3), u32(10), Buffer.from('image/jpeg'), u32(0), u32(1), u32(1), u32(24), u32(0), u32(image.length), image]);
  return Buffer.concat([Buffer.from('fLaC'), block(0, stream), block(4, comments), block(6, picture), block(129, Buffer.alloc(64)), audio]);
}
function render(bytes, format, metadata = fields, picture) {
  const plan = writer.buildTagPlan({ size: bytes.length, read: (offset, length) => new Uint8Array(bytes.subarray(offset, offset + length)) }, format, metadata === null ? undefined : metadata, picture);
  const output = Buffer.concat(plan.parts.map(part => part instanceof Uint8Array ? Buffer.from(part) : bytes.subarray(part.offset, part.offset + part.length)));
  assert.equal(output.length, plan.size); return output;
}
const readTags = bytes => tags.readEmbeddedTags(bytes.length, async (start, end) => new Uint8Array(bytes.subarray(start, end + 1)), new AbortController().signal);
async function main() {
  for (const [version, footer, extended] of [[3, false, false], [4, false, false], [3, false, true], [4, true, true]]) {
    const original = mp3(version, footer, extended), output = render(original, 'mp3'), parsed = await readTags(output);
    assert.deepEqual(parsed.fields, fields); assert.deepEqual(Buffer.from(parsed.picture.bytes), image);
    assert.deepEqual(output.subarray(-audio.length), audio, 'Every MP3 audio byte remains unchanged');
    assert(output.includes(Buffer.from('ABC')), 'Existing lyrics remain'); assert.deepEqual(original, mp3(version, footer, extended));
    const empty = render(output, 'mp3', { ...fields, artist: '', albumArtist: undefined, year: undefined, trackNumber: undefined, discNumber: undefined });
    const cleared = (await readTags(empty)).fields;
    for (const key of ['artist', 'albumArtist', 'year', 'trackNumber', 'discNumber']) assert.equal(cleared[key], undefined);
  }
  const bare = render(audio, 'mp3'); assert.deepEqual((await readTags(bare)).fields, fields);
  const totalsBody = Buffer.concat([frame('TRCK', Buffer.from([0, ...Buffer.from('1/12')]), 4), frame('TPOS', Buffer.from([0, ...Buffer.from('1/3')]), 4), frame('TDRC', Buffer.from([3, ...Buffer.from('2026-10-14')]), 4)]);
  const withTotals = Buffer.concat([Buffer.from('ID3'), Buffer.from([4, 0, 0]), sync(totalsBody.length), totalsBody, audio]);
  const preservedTotals = render(withTotals, 'mp3');
  assert(preservedTotals.includes(Buffer.from('4/12'))); assert(preservedTotals.includes(Buffer.from('2/3'))); assert(preservedTotals.includes(Buffer.from('2026-10-14')));
  const legacy = Buffer.alloc(128); legacy.write('TAG'); legacy.write('Old title', 3); legacy.write('Comment', 97); legacy[127] = 13;
  const updatedLegacy = render(Buffer.concat([audio, legacy]), 'mp3'); assert.equal(updatedLegacy.at(-1), 13); assert(updatedLegacy.subarray(-128).includes(Buffer.from('Comment')));
  const originalFlac = flac(), editedFlac = render(originalFlac, 'flac'), parsedFlac = await readTags(editedFlac);
  assert.deepEqual(parsedFlac.fields, { ...fields, duration: 2 }); assert.deepEqual(Buffer.from(parsedFlac.picture.bytes), image);
  assert(editedFlac.includes(Buffer.from('REPLAYGAIN_TRACK_GAIN=-3 dB'))); assert(editedFlac.includes(Buffer.from('LYRICS=가사')));
  assert.deepEqual(editedFlac.subarray(-audio.length), audio); assert.deepEqual(editedFlac.subarray(8, 42), originalFlac.subarray(8, 42));
  for (const [version, footer, extended] of [[3, false, false], [4, false, false], [3, false, true], [4, true, true]]) {
    const input = mp3(version, footer, extended), rewritten = render(input, 'mp3', null, cover), read = await readTags(rewritten);
    assert.deepEqual(read.fields, (await readTags(input)).fields, 'Artwork-only writes preserve every existing text field');
    assert.deepEqual(Buffer.from(read.picture.bytes), newImage); assert.equal(read.picture.mime, 'image/jpeg');
    assert.deepEqual(rewritten.subarray(-audio.length), audio); assert(rewritten.includes(Buffer.from('ABC')));
    assert.deepEqual(rewritten, render(rewritten, 'mp3', null, cover), 'Repeated writes replace rather than accumulate front covers');
  }
  const bareCover = render(audio, 'mp3', null, cover); assert.deepEqual(Buffer.from((await readTags(bareCover)).picture.bytes), newImage);
  const legacyCover = render(Buffer.concat([mp3(), legacy]), 'mp3', null, cover); assert.deepEqual(legacyCover.subarray(-128), legacy, 'Artwork-only changes preserve ID3v1 byte for byte');
  const back = frame('APIC', Buffer.concat([Buffer.from([0]), Buffer.from('image/jpeg\0'), Buffer.from([4, 0]), image]));
  const multipleBody = Buffer.concat([back, artwork, artwork, lyrics]);
  const multiple = Buffer.concat([Buffer.from('ID3'), Buffer.from([3, 0, 0]), sync(multipleBody.length), multipleBody, audio]);
  const multipleOutput = render(multiple, 'mp3', null, cover); assert(multipleOutput.includes(back), 'Back covers survive front-cover replacement');
  assert.equal(multipleOutput.toString('latin1').split('APIC').length - 1, 2, 'Duplicate front covers are replaced by one cover while retaining the back');
  assert.deepEqual(Buffer.from((await readTags(multipleOutput)).picture.bytes), newImage, 'Front cover is preferred by independent readers');
  const newFlac = render(originalFlac, 'flac', null, cover), readFlac = await readTags(newFlac);
  assert.deepEqual(readFlac.fields, (await readTags(originalFlac)).fields); assert.deepEqual(Buffer.from(readFlac.picture.bytes), newImage);
  assert.deepEqual(newFlac.subarray(-audio.length), audio); assert.deepEqual(newFlac.subarray(8, 42), originalFlac.subarray(8, 42));
  assert(newFlac.includes(Buffer.from('REPLAYGAIN_TRACK_GAIN=-3 dB'))); assert(newFlac.includes(Buffer.from('LYRICS=가사')));
  assert.deepEqual(render(newFlac, 'flac', null, cover), newFlac);
  assert.deepEqual((await readTags(render(originalFlac, 'flac', fields, cover))).fields, { ...fields, duration: 2 });
  for (const invalid of [{ ...cover, width: 0 }, { ...cover, bytes: new Uint8Array(0) }, { ...cover, mime: 'image/svg+xml' }]) assert.throws(() => render(mp3(), 'mp3', null, invalid));
  for (const format of ['mp3', 'flac']) assert.throws(() => render(Buffer.from('not audio'), format));
  const unsupported = mp3(); unsupported[3] = 2; assert.throws(() => render(unsupported, 'mp3'));
  const unsync = mp3(); unsync[5] = 128; assert.throws(() => render(unsync, 'mp3'));
  const corrupt = mp3(); corrupt[14] = 255; assert.throws(() => render(corrupt, 'mp3'));
  assert.throws(() => render(originalFlac.subarray(0, 45), 'flac'));
  assert.equal(options.fileTagFormat('track.MP3'), 'mp3'); assert.equal(options.fileTagFormat('track.m4a'), null);
  assert(options.fileWriteUnavailable({ ...fields, path: '/music/song.mp3' }, 'mock', 'android'));
  await checkNativeIO(); await checkCloudTargets(); await checkNasTarget(); await checkLocalTransaction(); await checkSavePipeline();
  console.log('PASS: independent jsmediatags reads of ID3v2.3/2.4 and FLAC text/artwork writes; front-cover replacement, back-cover/text/ID3v1/lyrics/ReplayGain/STREAMINFO/audio preservation; malformed rejection, chunked I/O, NAS/S3/local writing/conflict/cancellation, Drive file write blocking and local crash recovery. Network/native files are mocked.');
}
async function checkNativeIO() {
  let failTransfer = false, uploadStatus = 412;
  const contents = new Map([['input', mp3()]]), transfers = [];
  class File {
    constructor(uri, name) { this.uri = name ? uri + '/' + name : uri; this.parentDirectory = 'cache'; }
    get exists() { return contents.has(this.uri); }
    get size() { return contents.get(this.uri)?.length ?? 0; }
    delete() { contents.delete(this.uri); }
    create() { if (contents.has(this.uri)) throw Error('exists'); contents.set(this.uri, Buffer.alloc(0)); }
    open() { const file = this; let offset = 0;
      return { get offset() { return offset; }, set offset(value) { offset = value; }, get size() { return contents.get(file.uri).length; },
        readBytes(length) { const bytes = contents.get(file.uri).subarray(offset, offset + length); offset += bytes.length; return new Uint8Array(bytes); },
        writeBytes(bytes) { const old = contents.get(file.uri), next = Buffer.alloc(Math.max(old.length, offset + bytes.length)); old.copy(next); next.set(bytes, offset); contents.set(file.uri, next); offset += bytes.length; }, close() {} };
    }
  }
  const io = load('src/services/metadata/file-io.ts', { 'expo-file-system': { File, FileMode: {}, UploadType: { BINARY_CONTENT: 0 }, UploadTask: class {
    constructor(file, url, options) { this.file = file; this.url = url; this.options = options; }
    async uploadAsync() { transfers.push({ body: Buffer.from(contents.get(this.file.uri)), url: this.url, options: this.options }); if (failTransfer) throw Error('native error https://example.invalid/?_sid=SECRET'); return { status: uploadStatus }; }
  } }, './tag-writer': writer });
  await io.rewriteTags(new File('input'), new File('output'), 'mp3', fields, new AbortController().signal);
  assert.deepEqual(contents.get('output'), render(contents.get('input'), 'mp3'));
  const controller = new AbortController(); controller.abort(); await assert.rejects(io.rewriteTags(new File('input'), new File('cancelled'), 'mp3', fields, controller.signal));
  assert.equal(contents.has('cancelled'), false);
  await assert.rejects(io.uploadFile(new File('output'), 'https://example.invalid', {}, () => {}), /변경/);
  for (const status of [502, 503, 504]) {
    uploadStatus = status;
    await assert.rejects(io.uploadFile(new File('output'), 'https://example.invalid', {}, () => {}), error => error.status === status && /중계 서버/.test(error.message));
  }
  failTransfer = true; await assert.rejects(io.uploadFile(new File('output'), 'https://example.invalid', {}, () => {}), error => error.message.includes('확인하지 못') && !error.message.includes('SECRET'));
  failTransfer = false; uploadStatus = 200;
  const large = Buffer.alloc(700000); for (let index = 0; index < large.length; index++) large[index] = index % 256;
  contents.set('large', large);
  const parameters = { api: 'SYNO.FileStation.Upload', version: '2', method: 'upload', path: '/music/한글 & 日本語', create_parents: 'false', overwrite: 'false' };
  await io.uploadMultipartFile(new File('large'), 'https://example.invalid/upload', parameters, '.yeongdu-new-test', { 'X-SYNO-TOKEN': 'test-token' }, new AbortController().signal, () => {});
  const transfer = transfers.at(-1);
  assert.equal(transfer.options.uploadType, 0); assert.equal(transfer.options.httpMethod, 'POST');
  assert.equal(transfer.options.headers['X-SYNO-TOKEN'], 'test-token');
  assert.match(transfer.options.headers['Content-Type'], /^multipart\/form-data; boundary=yeongdu-form-/);
  const form = await new Request(transfer.url, { method: 'POST', headers: transfer.options.headers, body: transfer.body }).formData();
  for (const [key, value] of Object.entries(parameters)) assert.equal(form.get(key), value);
  assert.equal(form.get('file').name, '.yeongdu-new-test'); assert.deepEqual(Buffer.from(await form.get('file').arrayBuffer()), large);
  assert.equal([...form.keys()].at(-1), 'file', 'The binary file is the last part');
  assert(!transfer.body.includes(Buffer.from('Content-Length:')), 'No per-part Content-Length headers added by native multipart');
  assert(!transfer.body.includes(Buffer.from('charset=')), 'No per-part charset attribute');
  assert(![...contents.keys()].some(uri => uri.startsWith('cache/upload-body-')), 'Remove the credential-bearing temporary request after success');
  const multipartAbort = new AbortController(), transferCount = transfers.length;
  await assert.rejects(io.uploadMultipartFile(new File('large'), transfer.url, parameters, '.yeongdu-new-cancelled', {}, multipartAbort.signal, () => multipartAbort.abort()), /취소/);
  assert.equal(transfers.length, transferCount, 'Cancelled preparation never starts a remote upload');
  uploadStatus = 502;
  await assert.rejects(io.uploadMultipartFile(new File('large'), transfer.url, parameters, '.yeongdu-new-failed', {}, new AbortController().signal, () => {}), error => error.status === 502);
  assert(![...contents.keys()].some(uri => uri.startsWith('cache/upload-body-')), 'Remove the temporary request after cancellation or failure');
  assert.deepEqual(contents.get('large'), large, 'Multipart construction never modifies the source file');
  await assert.rejects(io.uploadMultipartFile(new File('large'), transfer.url, parameters, 'bad\r\nname', {}, new AbortController().signal, () => {}), /형식/);
}
async function checkCloudTargets() {
  const calls = [], uploads = []; let etag = '"first"', tagging = 0;
  const s3 = create(() => ({ source: async () => ({ uri: 'https://s3.example.invalid/get' }), fileRequest: async (_, method, headers) => { calls.push({ method, headers }); return { uri: 'https://s3.example.invalid/' + method }; } }));
  const cloud = load('src/services/metadata/cloud-file.ts', { 'expo-file-system': { File: class {} },
    '@/stores/s3': { useS3Store: s3 },
    './file-io': { checkCancelled: signal => { if (signal.aborted) throw Error('cancel'); }, uploadFile: async (file, url, config) => { uploads.push({ file, url, config }); return { status: 200 }; } },
  }, { fetch: async (url, config) => {
    calls.push({ url, config });
    return { ok: true, status: 200, headers: new Headers({ etag, 'content-length': '123', 'content-type': 'audio/mpeg', 'x-amz-meta-owner': 'owner', 'x-amz-tagging-count': String(tagging) }) };
  } });
  const signal = new AbortController().signal;
  assert.equal(cloud.prepareDriveFile, undefined, 'No Drive upload adapter remains');
  const s3Song = { ...fields, id: 's3:A:song', source: 's3', s3: { key: 'music/song.mp3', connectionId: 'A' } };
  const s3Target = await cloud.prepareS3File(s3Song, signal); await s3Target.commit({ size: 456 }, () => {});
  assert.equal(uploads.at(-1).config.headers['if-match'], '"first"'); assert.equal(uploads.at(-1).config.headers['x-amz-meta-owner'], 'owner');
  etag = '"changed"'; const count = uploads.length; await assert.rejects(s3Target.commit({ size: 456 }, () => {}), /변경/); assert.equal(uploads.length, count);
  tagging = 1; await assert.rejects(cloud.prepareS3File(s3Song, signal), /객체 태그/);
}
async function checkNasTarget() {
  const files = new Map([['/music/song.mp3', { size: 123, mtime: 1, ctime: 1 }]]), calls = [];
  let failRename = false, failUpload = false, httpStatus = 200, uploadStatus = 200;
  const cloudRequest = load('src/services/cloud-music/request.ts');
  class File { constructor(parent, name) { this.name = name; this.parentDirectory = parent; this.size = 456; } async copy(to) { to.size = this.size; } }
  const session = { baseUrl: 'https://nas.example.invalid', sid: 'test-sid', token: 'test-token', apis: Object.fromEntries(['List', 'Upload', 'Download', 'CheckPermission', 'Rename'].map(api => ['SYNO.FileStation.' + api, { path: 'entry.cgi', minVersion: 1, maxVersion: 3 }])) };
  const nas = load('src/services/metadata/nas-file.ts', { 'expo-file-system': { File, UploadType: { MULTIPART: 1 } },
    '@/services/cloud-music/request': cloudRequest,
    './file-io': { checkCancelled: signal => { if (signal.aborted) throw Error('cancel'); }, uploadMultipartFile: async (file, url, parameters, filename, headers, uploadSignal) => {
      calls.push({ upload: true, url });
      const endpoint = new URL(url);
      assert.equal(endpoint.origin + endpoint.pathname, 'https://nas.example.invalid/webapi/entry.cgi');
      assert.deepEqual(Object.fromEntries(endpoint.searchParams), { api: 'SYNO.FileStation.Upload', version: '2', method: 'upload', _sid: session.sid, SynoToken: session.token }, 'DSM needs routing/auth before it can select its multipart handler');
      assert.deepEqual(parameters, { api: 'SYNO.FileStation.Upload', version: '2', method: 'upload', _sid: session.sid, SynoToken: session.token, path: '/music', create_parents: 'false', overwrite: 'false' });
      assert.deepEqual(headers, { 'X-SYNO-TOKEN': session.token });
      assert(filename.startsWith('.yeongdu-new-')); assert.equal(file.name, 'song.mp3');
      assert.equal(uploadSignal, signal);
      if (failUpload) return { body: '{"success":false,"error":{"code":401}}' };
      if (uploadStatus !== 200) throw new cloudRequest.CloudRequestError('Gateway failure https://example.invalid/?_sid=SECRET', uploadStatus);
      files.set(parameters.path + '/' + filename, { size: 456, mtime: 2, ctime: 2 }); return { body: '{"success":true}' };
    } },
  }, { fetch: async url => {
    const params = new URL(url).searchParams, method = params.get('method'); calls.push({ method }); let data = {};
    assert.equal(params.get('_sid'), session.sid); assert.equal(params.get('SynoToken'), session.token);
    if (httpStatus !== 200) return { ok: false, status: httpStatus };
    if (method === 'write') {
      assert.equal(JSON.parse(params.get('path')), '/music'); assert.equal(JSON.parse(params.get('filename')), 'song.mp3');
      assert.equal(JSON.parse(params.get('overwrite')), true); assert.equal(JSON.parse(params.get('create_only')), false);
    }
    if (method === 'getinfo') {
      const path = JSON.parse(params.get('path'))[0], file = files.get(path);
      if (!file) return { ok: true, json: async () => ({ success: false, error: { code: 408 } }) };
      data = { files: [{ path, name: path.slice(path.lastIndexOf('/') + 1), isdir: false, additional: { size: file.size, time: file, real_path: '/volume1' + path } }] };
    }
    if (method === 'rename') {
      const path = JSON.parse(params.get('path'))[0], name = JSON.parse(params.get('name'))[0];
      if (failRename && path.includes('.yeongdu-new-')) return { ok: true, json: async () => ({ success: false, error: { code: 400 } }) };
      assert(files.has(path)); const destination = '/music/' + name; assert(!files.has(destination)); files.set(destination, files.get(path)); files.delete(path);
    }
    return { ok: true, json: async () => ({ success: true, data }) };
  } });
  const signal = new AbortController().signal, target = await nas.prepareNasFile(session, '/volume1/music/song.mp3', signal);
  assert.equal(new URL(target.download.uri).searchParams.get('path'), '["/music/song.mp3"]');
  assert.equal(JSON.parse(new URL(target.download.uri).searchParams.get('mode')), 'download', 'File Station string parameters must be JSON encoded');
  failUpload = true;
  const beforeFailure = [...files], renamesBefore = calls.filter(call => call.method === 'rename').length;
  await assert.rejects(target.commit(new File('cache', 'song.mp3'), () => {}), error => /임시 파일 업로드.*File Station 코드 401/.test(error.message) && !/세션이 만료|test-sid|test-token/.test(error.message));
  assert.deepEqual([...files], beforeFailure, 'A rejected upload leaves the original untouched');
  assert.equal(calls.filter(call => call.method === 'rename').length, renamesBefore, 'Do not publish or retry a rejected upload');
  failUpload = false;
  for (const status of [502, 503, 504]) {
    uploadStatus = status;
    await assert.rejects(target.commit(new File('cache', 'song.mp3'), () => {}), error => error.status === status && /원본은 교체하지 않았/.test(error.message) && !/SECRET|test-sid|test-token/.test(error.message));
    assert.deepEqual([...files], beforeFailure); assert.equal(calls.filter(call => call.method === 'rename').length, renamesBefore);
  }
  uploadStatus = 200;
  await target.commit(new File('cache', 'song.mp3'), () => {});
  assert.equal(files.get('/music/song.mp3').size, 456); assert([...files].some(([path, file]) => path.endsWith('.yeongdu-backup') && file.size === 123));
  const retry = await nas.prepareNasFile(session, '/music/song.mp3', signal); failRename = true;
  await assert.rejects(retry.commit(new File('cache', 'song.mp3'), () => {}), /백업/); assert.equal(files.get('/music/song.mp3').size, 456, 'A failed publish restores the source name');
  for (const path of ['../song.mp3', '/music/../song.mp3', '/music\\song.mp3']) assert.throws(() => nas.nasFilePath(path));
  assert.throws(() => nas.nasFileEndpoint({ ...session, apis: {} }, 'SYNO.FileStation.Upload', 'upload', 2));
  httpStatus = 401;
  await assert.rejects(nas.prepareNasFile(session, '/music/song.mp3', signal), /파일 정보 확인 실패 \(HTTP 401\)/);
  for (const code of [106, 107, 119]) assert.throws(() => nas.parseNasFileResponse({ success: false, error: { code } }), /세션이 만료/);
  for (const code of [105, 407, 411]) assert.throws(() => nas.parseNasFileResponse({ success: false, error: { code } }, '쓰기 권한 확인'), /쓰기 권한 확인.*읽기·쓰기 권한/);
}
async function checkLocalTransaction() {
  const files = new Map(), rows = new Map(); let failWrite = false, failMove = false;
  const bytes = mp3(), digest = crypto.createHash('md5').update(bytes).digest('hex'), id = 'local:' + digest + ':' + bytes.length;
  const song = { ...fields, id, source: 'local', duration: 180, local: { fileName: digest + '-' + bytes.length + '.mp3', originalName: 'song.mp3', size: bytes.length } };
  const uri = 'file:///app/local-music/' + song.local.fileName; files.set(uri, bytes); rows.set(id, JSON.stringify(song)); files.set('file:///edited', render(bytes, 'mp3', { ...fields, title: 'Changed' }));
  const fsMock = { documentDirectory: 'file:///app/', getInfoAsync: async (uri, config = {}) => files.has(uri) ? { exists: true, isDirectory: false, size: files.get(uri).length, md5: config.md5 ? crypto.createHash('md5').update(files.get(uri)).digest('hex') : undefined } : { exists: false },
    copyAsync: async ({ from, to }) => files.set(to, Buffer.from(files.get(from))), deleteAsync: async uri => files.delete(uri),
    moveAsync: async ({ from, to }) => { if (failMove && from.endsWith('.metadata-new')) throw Error('move failed'); if (!files.has(from)) throw Error('missing'); files.set(to, files.get(from)); files.delete(from); },
    writeAsStringAsync: async (uri, value) => files.set(uri, Buffer.from(value)), readAsStringAsync: async uri => files.get(uri).toString() };
  const modules = { 'react-native': { Platform: { OS: 'android' } }, 'expo-file-system/legacy': fsMock,
    'expo-sqlite': { openDatabaseAsync: async () => ({ execAsync: async () => {}, getAllAsync: async () => [...rows.values()].map(value => ({ value })),
      getFirstAsync: async (_, id) => rows.has(id) ? { value: rows.get(id) } : null, runAsync: async (_, id, value) => { if (failWrite) { failWrite = false; throw Error('disk'); } rows.set(id, value); } }) },
    'expo-document-picker': {}, '@/stores/folder-exclusions': { useFolderExclusionStore: { getState: () => ({ ready: true, folders: [], load: async () => {} }) } },
    './folders': load('src/services/local-music/folders.ts'),
  };
  let storage = load('src/services/local-music/storage.ts', modules);
  failMove = true; await assert.rejects(storage.replaceLocalMetadataFile(id, 'file:///edited', { ...fields, title: 'Changed' }, () => {}));
  assert.deepEqual(files.get(uri), bytes); assert.equal(JSON.parse(rows.get(id)).title, fields.title); failMove = false;
  failWrite = true; await assert.rejects(storage.replaceLocalMetadataFile(id, 'file:///edited', { ...fields, title: 'Changed' }, () => {})); assert.deepEqual(files.get(uri), bytes);
  const updated = await storage.replaceLocalMetadataFile(id, 'file:///edited', { ...fields, title: 'Changed' }, () => {});
  assert.equal(updated.id, id); assert.equal(updated.local.fileName, song.local.fileName); assert.equal(updated.local.size, files.get(uri).length);
  assert.equal((await storage.readLocalSongs())[0].title, 'Changed'); await storage.localSource(updated);
  // Simulate termination between swapping the file and committing its DB row.
  files.set(uri + '.metadata-backup', bytes); files.set(uri + '.metadata-journal', Buffer.from(JSON.stringify({ before: song, after: updated, digest: crypto.createHash('md5').update(files.get(uri)).digest('hex') }))); rows.set(id, JSON.stringify(song));
  storage = load('src/services/local-music/storage.ts', modules); assert.equal((await storage.readLocalSongs())[0].title, fields.title); assert.deepEqual(files.get(uri), bytes);
  assert.equal(files.has(uri + '.metadata-journal'), false); assert.equal(files.has(uri + '.metadata-backup'), false);
  files.set('file:///cover-edited', render(bytes, 'mp3', null, cover));
  const artUri = 'file:///app/album-art/art-' + 'a'.repeat(32) + '.jpg';
  const beforeArt = JSON.parse(rows.get(id));
  const artworkSong = await storage.replaceLocalMetadataFile(id, 'file:///cover-edited', undefined, () => {}, artUri);
  assert.equal(artworkSong.title, beforeArt.title); assert.equal(artworkSong.albumId, beforeArt.albumId); assert.equal(artworkSong.duration, beforeArt.duration);
  assert.equal(artworkSong.artworkUrl, artUri); assert.equal(artworkSong.local.fileName, beforeArt.local.fileName); assert.equal(artworkSong.artworkOriginal, undefined);
  assert.equal(artworkSong.local.size, files.get(uri).length); assert.deepEqual(Buffer.from((await readTags(files.get(uri))).picture.bytes), newImage);
  const restarted = load('src/services/local-music/storage.ts', modules); assert.equal((await restarted.readLocalSongs())[0].artworkUrl, artUri);
}
async function checkSavePipeline() {
  const contents = new Map(), uploads = [], source = mp3(); let gate = null, failUpload = false;
  class Directory {
    constructor(...parts) { this.uri = parts.map(part => typeof part === 'string' ? part : part.uri).join('/'); this.exists = false; }
    create() { this.exists = true; }
    delete() { for (const key of contents.keys()) if (key.startsWith(this.uri + '/')) contents.delete(key); this.exists = false; }
  }
  class File {
    constructor(...parts) { this.uri = parts.map(part => typeof part === 'string' ? part : part.uri).join('/'); }
    get size() { return contents.get(this.uri)?.length ?? 0; }
    async copy(file) { contents.set(file.uri, Buffer.from(contents.get(this.uri))); }
    create() { if (contents.has(this.uri)) throw Error('exists'); contents.set(this.uri, Buffer.alloc(0)); }
    open() { const file = this; let offset = 0; return { get offset() { return offset; }, set offset(value) { offset = value; }, get size() { return file.size; },
      readBytes(length) { const bytes = contents.get(file.uri).subarray(offset, offset + length); offset += bytes.length; return new Uint8Array(bytes); },
      writeBytes(bytes) { const old = contents.get(file.uri), next = Buffer.alloc(Math.max(old.length, offset + bytes.length)); old.copy(next); next.set(bytes, offset); contents.set(file.uri, next); offset += bytes.length; }, close() {} }; }
    static async downloadFileAsync(_, file, config) { if (gate) await gate.promise; if (config.signal.aborted) throw Error('cancelled'); contents.set(file.uri, source); return file; }
  }
  const filesystem = { File, Directory, FileMode: {}, Paths: { cache: { uri: 'file:///cache' }, availableDiskSpace: 1e10 } };
  const io = load('src/services/metadata/file-io.ts', { 'expo-file-system': filesystem, './tag-writer': writer });
  const auth = create(() => ({ mode: 'nas', generation: 1, session: { account: 'A' } }));
  const drive = create(() => ({ generation: 1, account: { id: 'A' }, songs: [] }));
  const s3 = create(() => ({ generation: 1, connection: { id: 'A' }, songs: [] }));
  for (const store of [drive, s3]) store.setState({ recordWrittenSong: song => store.setState(state => ({ songs: state.songs.map(item => item.id === song.id ? song : item) })) });
  const playback = create(() => ({ queue: [], index: 0, position: 37, playing: true }));
  const local = create(() => ({ busy: false, songs: [], load: async () => {} }));
  const metadata = load('src/features/metadata/rules.ts');
  const target = async () => ({ name: 'original.mp3', size: source.length, download: { uri: 'https://example.invalid/original' }, unchanged: async () => {},
    commit: async file => { if (failUpload) throw Error('failed upload'); uploads.push(Buffer.from(contents.get(file.uri))); return 'saved'; } });
  const service = load('src/services/metadata/write-song-file.ts', {
    'react-native': { Platform: { OS: 'android' } }, 'expo-file-system': filesystem, './file-io': io,
    './cloud-file': { prepareS3File: target }, './nas-file': { prepareNasFile: target },
    '@/stores/auth': { useAuthStore: auth }, '@/stores/google-drive': { useGoogleDriveStore: drive }, '@/stores/s3': { useS3Store: s3 },
    '@/stores/playback': { usePlaybackStore: playback }, '@/stores/local-music': { useLocalMusicStore: local },
    '@/services/local-music/storage': { localSource: async () => ({ uri: 'file:///local/original' }), replaceLocalMetadataFile: async (id, uri, fields, check, artworkUrl) => {
      check(); uploads.push(Buffer.from(contents.get(uri))); contents.set('file:///local/original', Buffer.from(contents.get(uri)));
      const updated = { ...playback.getState().queue.find(song => song.id === id), ...fields,
        ...(artworkUrl ? { artworkUrl, artworkOriginal: undefined } : {}), local: { ...playback.getState().queue[0].local, size: contents.get(uri).length } };
      local.setState({ songs: [updated] }); return updated;
    } }, '@/services/local-music/file-copy': { fingerprintFile: async uri => ({ size: contents.get(uri).length, digest: crypto.createHash('md5').update(contents.get(uri)).digest('hex') }) },
    '@/features/metadata/file-options': options, '@/features/metadata/rules': metadata,
    '@/services/artwork/files': { readArtworkForTags: async () => cover, artworkBaseUri: () => 'file:///documents/album-art/' },
  });
  const driveSong = { ...fields, id: 'drive:A:file', source: 'drive', drive: { accountId: 'A', fileId: 'file' } };
  assert.equal(options.fileWriteUnavailable(driveSong, 'nas', 'android'), options.DRIVE_FILE_WRITE_BLOCKED_MESSAGE);
  await assert.rejects(service.writeSongFile(driveSong, fields, () => {}), error => error.message === options.DRIVE_FILE_WRITE_BLOCKED_MESSAGE);
  await assert.rejects(service.writeSongArtworkFile(driveSong, '../invalid-image', () => {}), error => error.message === options.DRIVE_FILE_WRITE_BLOCKED_MESSAGE);
  assert.equal(uploads.length, 0); assert.equal(contents.size, 0, 'Drive writes are blocked before download or file I/O');
  for (const kind of ['nas', 's3']) {
    const song = { ...fields, title: 'Before', id: kind + ':A:file', source: kind, path: '/music/original.mp3', duration: 180,
      ...(kind === 'drive' ? { drive: { accountId: 'A', fileId: 'file' } } : kind === 's3' ? { s3: { connectionId: 'A', key: 'music/original.mp3', size: source.length } } : {}) };
    if (kind === 'drive') drive.setState({ songs: [song] }); if (kind === 's3') s3.setState({ songs: [song] }); playback.setState({ queue: [{ ...song, duration: 200, artworkUrl: 'file:///latest-artwork' }] });
    const result = await service.writeSongFile(song, fields, () => {});
    assert.equal(result.song.title, fields.title); assert.equal(playback.getState().queue[0].title, fields.title);
    assert.equal(playback.getState().queue[0].duration, 200); assert.equal(playback.getState().queue[0].artworkUrl, 'file:///latest-artwork', 'File saving preserves metadata learned while the editor was open');
    assert.equal(playback.getState().playing, true); assert.equal(playback.getState().position, 37); assert.equal(contents.size, 0, 'Successful transfers clean app cache');
    assert.deepEqual((await readTags(uploads.at(-1))).fields, fields); assert.equal(playback.getState().queue[0].metadataOriginal, undefined);
    failUpload = true; await assert.rejects(service.writeSongFile(song, fields, () => {}), /failed upload/); assert.equal(contents.size, 0); failUpload = false;
  }
  const artworkName = 'art-' + 'a'.repeat(32) + '.jpg', artUri = 'file:///documents/album-art/' + artworkName;
  for (const kind of ['nas', 's3', 'local']) {
    const song = { ...fields, id: kind + ':A:cover', source: kind, path: '/music/original.mp3', duration: 180,
      ...(kind === 's3' ? { s3: { connectionId: 'A', key: 'music/original.mp3', size: source.length } } : kind === 'local' ? {
        local: { fileName: 'a'.repeat(32) + '-' + source.length + '.mp3', size: source.length } } : {}) };
    if (kind === 's3') s3.setState({ songs: [song] });
    if (kind === 'local') contents.set('file:///local/original', source);
    playback.setState({ queue: [{ ...song, title: 'Live display title', duration: 200, metadataOriginal: { title: 'Original title' },
      artworkUrl: 'file:///previous-art', artworkOriginal: { artworkUrl: 'file:///old-original' } }] });
    const result = await service.writeSongArtworkFile(song, artworkName, () => {});
    const parsed = await readTags(uploads.at(-1));
    assert.deepEqual(parsed.fields, (await readTags(source)).fields, `${kind} artwork saves never rewrite text tags`);
    assert.deepEqual(Buffer.from(parsed.picture.bytes), newImage); assert.deepEqual(uploads.at(-1).subarray(-audio.length), audio);
    assert.equal(result.song.artworkUrl, artUri); assert.equal(playback.getState().queue[0].artworkUrl, artUri);
    assert.equal(playback.getState().queue[0].artworkOriginal.artworkUrl, artUri, 'Clearing a display override restores the written cover');
    assert.equal(playback.getState().queue[0].title, 'Live display title'); assert.equal(playback.getState().queue[0].metadataOriginal.title, 'Original title');
    assert.equal(playback.getState().position, 37); assert.equal(playback.getState().playing, true);
    assert([...contents.keys()].every(uri => !uri.startsWith('file:///cache')), 'Artwork saves clean transfer staging');
    if (kind === 'local') {
      assert.equal(local.getState().busy, false); assert.notEqual(local.getState().songs[0].local.size, song.local.size);
      await service.writeSongFile(song, fields, () => {});
      assert.deepEqual(Buffer.from((await readTags(uploads.at(-1))).picture.bytes), newImage, 'Text saved with a pre-artwork editor snapshot preserves the written cover and uses the new file size');
      contents.delete('file:///local/original');
    }
    const canceled = new AbortController(); canceled.abort(); const uploadCount = uploads.length;
    await assert.rejects(service.writeSongArtworkFile(song, artworkName, () => {}, canceled.signal)); assert.equal(uploads.length, uploadCount);
    await assert.rejects(service.writeSongArtworkFile(song, artworkName, () => {}, undefined, () => false)); assert.equal(uploads.length, uploadCount);
  }
  let resolve; gate = { promise: new Promise(done => { resolve = done; }) };
  const song = { ...fields, id: 's3:A:file', source: 's3', s3: { connectionId: 'A', key: 'music/original.mp3', size: source.length } };
  const pending = service.writeSongFile(song, fields, () => {}); await Promise.resolve();
  await assert.rejects(service.writeSongFile(song, fields, () => {}), /다른 음악/);
  s3.setState({ generation: 2, connection: null }); const count = uploads.length; resolve(); await assert.rejects(pending); assert.equal(uploads.length, count, 'Connection changes cancel before any file overwrite');
  assert.equal(contents.size, 0);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
