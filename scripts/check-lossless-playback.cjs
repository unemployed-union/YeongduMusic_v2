/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const { create } = require('zustand');
function load(file, modules = {}, globals = {}) {
  modules = { ...require('./test-cloud-fixtures.cjs').cloudFixtures(globals, modules), ...modules };
  const exports = {}, code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'exports', ...Object.keys(globals), code)(name => {
    if (name === 'zustand') return { create };
    if (name in modules) return modules[name];
    throw Error('Unexpected import: ' + name);
  }, exports, ...Object.values(globals));
  return exports;
}
const song = { id: 'fixture', title: 'Fixture', artist: 'Artist', album: 'Album', duration: 180, path: '/music/fixture.flac' };
const rules = load('src/services/playback/lossless.ts');
const session = { baseUrl: 'https://example.invalid', sid: 'fixture', apis: Object.fromEntries(['Song', 'Stream', 'Cover'].map(name => ['SYNO.AudioStation.' + name, { path: 'AudioStation/' + name.toLowerCase() + '.cgi', minVersion: 1, maxVersion: 3 }])) };
const { SynologyClient } = load('src/services/synology/api.ts');
const client = new SynologyClient(session);
function checkFormats() {
  for (const codec of ['flac', 'alac', 'Apple Lossless', 'ape', 'wavpack', 'pcm_s16le', 'pcm_s24be', 'pcm_f32le', 'lpcm']) assert.equal(rules.isLosslessSong({ ...song, audioCodec: codec }), true, codec);
  for (const codec of ['mp3', 'aac', 'opus', 'vorbis', 'pcm_alaw', 'pcm_mulaw', 'unknown']) assert.equal(rules.isLosslessSong({ ...song, audioCodec: codec }), false, codec);
  assert.equal(rules.isLosslessSong({ ...song, lossless: false }), false, 'Explicit lossy metadata overrides an extension');
  assert.equal(rules.isLosslessSong({ ...song, path: 'music.m4a', lossless: true }), true);
  for (const extension of ['mp3', 'aac', 'ogg', 'opus', 'm4a', 'wav', 'aiff']) assert.equal(rules.isLosslessSong({ ...song, path: 'music.' + extension, bitrate: 320000 }), false, extension);
  for (const extension of ['FLAC', 'alac', 'ape', 'wv', 'tta']) assert.equal(rules.isLosslessSong({ ...song, path: 'music.' + extension }), true, extension);
  assert.equal(rules.isLosslessSong({ ...song, source: 'local', local: { fileName: 'song.flac' } }), true);
  assert.equal(rules.isLosslessSong({ ...song, source: 'drive', path: undefined, drive: { mimeType: 'audio/flac' } }), true);
  assert.equal(rules.isLosslessSong({ ...song, source: 's3', s3: { key: 'music/song.flac' } }), true);
  assert.equal(rules.isLosslessPlayback(song, client.streamSource(song)), true);
  assert.equal(rules.isLosslessPlayback(song, client.streamSource(song, 'mp3')), false, 'Lossless originals transcoded to MP3 are lossy playback');
  assert.equal(rules.isLosslessPlayback(song, { assetId: 1 }), false);
  assert.equal(rules.isLosslessPlayback(song, { uri: 'invalid' }), false);
}
async function checkNasMetadata() {
  const audio = [{ codec: 'flac', lossless: true }, { codec: 'mp3', lossless: false }, { codec: 'alac' }, { lossless: 'false' }, null];
  const nas = load('src/services/synology/api.ts', {}, { fetch: async uri => {
    assert.equal(new URL(uri).searchParams.get('additional'), 'song_tag,song_audio');
    return new Response(JSON.stringify({ success: true, data: { total: audio.length, songs: audio.map((song_audio, index) => ({ id: String(index), title: 'Fixture', additional: { song_audio, song_tag: { album: 'Album', artist: 'Artist' } } })) } }));
  } });
  const mapped = (await new nas.SynologyClient(session).songs({ offset: 0, limit: 10 })).items;
  assert.deepEqual(mapped.map(item => item.audioCodec), ['flac', 'mp3', 'alac', undefined, undefined]);
  assert.deepEqual(mapped.map(item => item.lossless), [true, false, undefined, undefined, undefined]);
  assert.deepEqual(mapped.map(rules.isLosslessSong), [true, false, true, false, false]);
}
async function checkController() {
  const playback = load('src/stores/playback.ts').usePlaybackStore;
  let source = async item => client.streamSource(item), engine;
  class Engine {
    constructor() { engine = this; }
    subscribe(listener) { this.listener = listener; }
    subscribeRemoteNavigation() {}
    emit(status = {}) { this.listener({ playing: true, buffering: false, position: 0, duration: 180, ended: false, error: null, ...status }); }
    async load() { this.emit(); }
    pause() { this.emit({ playing: false }); }
    play() { this.emit(); }
    release() {}
    setPlaybackRate() {}
    setPreservePitch() {}
  }
  const controller = load('src/services/playback/controller.ts', {
    './audio-engine': { ExpoAudioEngine: Engine }, '@/stores/playback': { usePlaybackStore: playback },
    '@/stores/hidden-music': { useHiddenMusicStore: create(() => ({ ready: true, scope: 'demo', profile: { presets: [] } })) },
    '@/stores/auth': { useAuthStore: { getState: () => ({ mode: 'mock', session: null }) } },
    '@/features/hidden-music/rules': { hiddenMatcher: () => () => false, privacyScope: () => 'demo' },
    '@/features/library/repository': { musicRepository: () => ({ streamSource: item => source(item) }) },
    '@/services/synology/api': { SessionExpiredError: class extends Error {}, SynologyError: class extends Error {} },
    '@/stores/player-background': { usePlayerBackgroundStore: { getState: () => ({ selectArtwork() {}, reset() {} }) } },
  });
  await controller.playQueue([song]); assert.equal(playback.getState().lossless, true);
  source = async item => client.streamSource(item, 'mp3');
  engine.emit({ position: 1 }); assert.equal(playback.getState().lossless, true, 'Changing a preference does not relabel the loaded stream');
  await controller.playQueue([song]); assert.equal(playback.getState().lossless, false);
  let resolve;
  source = () => new Promise(done => { resolve = done; });
  const pending = controller.playQueue([song]); assert.equal(playback.getState().lossless, false);
  source = async item => client.streamSource(item);
  const lossy = { ...song, id: 'lossy', path: '/music/song.mp3' };
  await controller.playQueue([lossy]); resolve(client.streamSource(song)); await pending;
  assert.equal(playback.getState().lossless, false, 'Stale source resolutions cannot label a newer track');
  await controller.playQueue([song]); controller.stopPlayback(); assert.equal(playback.getState().lossless, false);
  await controller.restorePlayback([song], 0, 12, false, false, 'off');
  assert.equal(playback.getState().lossless, false, 'An unloaded restored queue has no known stream quality');
  controller.stopPlayback();
}
function checkBadge() {
  const state = { lossless: true, buffering: false, error: null, playing: true };
  const jsx = (type, props) => ({ type, props });
  const { LosslessBadge } = load('src/features/playback/lossless-badge.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': { View: 'View', StyleSheet: { create: value => value } },
    '@/components/text': { Text: 'Text' }, '@/stores/playback': { usePlaybackStore: select => select(state) },
  });
  const render = () => LosslessBadge({ color: '#FFFFFF' });
  assert.equal(render().props.children.props.children, '고음질 · 무손실');
  assert.equal(render().props.accessibilityLabel, '고음질, 무손실 음원');
  const assertHidden = () => {
    const badge = render();
    assert.equal(badge.props.style.at(-1).opacity, 0, 'Hidden badges retain their text layout space');
    assert.equal(badge.props.accessibilityElementsHidden, true);
    assert.equal(badge.props.importantForAccessibility, 'no-hide-descendants');
  };
  state.playing = false; assert.ok(render(), 'Pausing retains known stream quality');
  state.buffering = true; assertHidden();
  state.buffering = false; state.error = 'Failed'; assertHidden();
  state.error = null; state.lossless = false; assertHidden();
}
async function main() {
  checkFormats(); await checkNasMetadata(); await checkController(); checkBadge();
  console.log('PASS: lossless codecs/containers, lossy transcodes, NAS metadata, loaded stream snapshot, stale loads, queue restoration and badge visibility. Native decoding is not exercised.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
