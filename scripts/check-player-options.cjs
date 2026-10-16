/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..'), ts = require(path.join(root, 'node_modules/typescript'));
function load(file, modules) {
  modules = { ...require('./test-cloud-fixtures.cjs').cloudFixtures({}, modules), ...modules };
  const mod = { exports: {} }, code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'module', 'exports', code)(name => { if (!(name in modules)) throw Error('Unexpected dependency ' + name); return modules[name]; }, mod, mod.exports);
  return mod.exports;
}
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const jsx = (type, props) => ({ type, props });
function findAll(node, type) { if (!node || typeof node !== 'object') return []; const children = node.props?.children; return [...(node.type === type ? [node] : []), ...(Array.isArray(children) ? children : [children]).flatMap(child => findAll(child, type))]; }
async function main() {
  let stored = null, failRead = false, failWrite = false, readCount = 0, writeGate;
  const modules = { zustand: require(path.join(root, 'node_modules/zustand')), '@/components/text': { Text: 'Text' },
  'react-native': { Platform: { OS: 'android' } }, 'expo-secure-store': {
    getItemAsync: async () => { readCount++; if (failRead) throw Error('read'); return stored; },
    setItemAsync: async (_, value) => { if (writeGate) await writeGate.promise; if (failWrite) throw Error('write'); stored = value; },
  } };
  let preferences = load('src/stores/display-preferences.ts', modules).useDisplayPreferences;
  await Promise.all([preferences.getState().load(), preferences.getState().load()]); assert.equal(readCount, 1); assert.equal(preferences.getState().hideArtwork, false);
  await preferences.getState().setHideArtwork(true); assert.equal(stored, 'true'); assert.equal(preferences.getState().hideArtwork, true);
  preferences = load('src/stores/display-preferences.ts', modules).useDisplayPreferences;
  await preferences.getState().load(); assert.equal(preferences.getState().hideArtwork, true, 'Preference survives store/app restart');
  failWrite = true; await preferences.getState().setHideArtwork(false); assert.equal(preferences.getState().hideArtwork, true); assert(preferences.getState().error); failWrite = false;
  writeGate = deferred(); const first = preferences.getState().setHideArtwork(false), second = preferences.getState().setHideArtwork(true);
  await flush(); assert.equal(preferences.getState().saving, true); writeGate.resolve(); await Promise.all([first, second]); writeGate = null;
  assert.equal(stored, 'true'); assert.equal(preferences.getState().hideArtwork, true); assert.equal(preferences.getState().saving, false);
  stored = 'corrupt'; await preferences.getState().load(true); assert.equal(preferences.getState().hideArtwork, false);
  failRead = true; await preferences.getState().load(true); assert.equal(preferences.getState().ready, true); assert(preferences.getState().error); failRead = false;
  stored = 'true'; await preferences.getState().load(true); assert.equal(preferences.getState().hideArtwork, true); assert.equal(preferences.getState().error, null);
  console.log('PASS: artwork preference persistence/restart, coalesced reads, ordered writes, corrupt value, visible failures and retry. SecureStore is mocked.');
  const native = { Image: 'Image', View: 'View', Text: 'Text', StyleSheet: { create: value => value } };
  const imageUrls = load('src/services/artwork/image-url.ts', {});
  let failedImage = null;
  const { Artwork } = load('src/components/artwork.tsx', { react: { useState: () => [failedImage, value => { failedImage = value; }] },
    '@/services/artwork/image-url': imageUrls, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native, 'expo-linear-gradient': { LinearGradient: 'Gradient' }, '@/stores/display-preferences': { useDisplayPreferences: selector => selector(preferences.getState()) } });
  const expand = tree => Array.isArray(tree) ? tree.map(expand) : !tree || typeof tree !== 'object' ? tree : typeof tree.type === 'function' ? expand(tree.type(tree.props)) : { ...tree, props: { ...tree.props, children: expand(tree.props.children) } };
  const renderArtwork = props => expand(Artwork(props));
  const artworkProps = { item: { title: 'Song', artworkUrl: 'https://example.invalid/cover', palette: ['#123456', '#654321'] }, size: 45 };
  assert.equal(findAll(renderArtwork(artworkProps), 'Image').length, 0);
  assert.deepEqual(findAll(Artwork(artworkProps), 'Gradient')[0].props.colors, ['#77466D', '#25345A']);
  await preferences.getState().setHideArtwork(false);
  assert.equal(findAll(renderArtwork(artworkProps), 'Image').length, 1);
  assert.deepEqual(findAll(Artwork(artworkProps), 'Gradient')[0].props.colors, artworkProps.item.palette);
  console.log('PASS: shared Artwork suppresses image requests and private palette in hidden mode, restores original artwork when shown.');
  const thumbnail = 'https://nas.invalid/webapi/AudioStation/cover.cgi?api=SYNO.AudioStation.Cover&method=getsongcover&version=3&id=track%26one&size=320&library=all&_sid=private%2Bsession&SynoToken=private%26token';
  const large = new URL(imageUrls.fullArtworkUrl(thumbnail)), small = new URL(thumbnail);
  assert.equal(large.searchParams.get('size'), '1024');
  for (const key of ['api', 'method', 'version', 'id', 'library', '_sid', 'SynoToken']) assert.equal(large.searchParams.get(key), small.searchParams.get(key), 'Cover resolution preserves the request and credentials');
  assert.equal(large.origin + large.pathname, small.origin + small.pathname);
  for (const uri of ['file:///album-art/custom.jpg', 'data:image/jpeg;base64,AAAA', 'content://media/cover', 'https://example.invalid/cover?size=320', thumbnail.replace('getsongcover', 'stream')]) assert.equal(imageUrls.fullArtworkUrl(uri), uri, 'Local/custom/cloud artwork is never rewritten');
  const nasProps = { item: { ...artworkProps.item, artworkUrl: thumbnail }, size: 340 };
  assert.equal(findAll(renderArtwork(nasProps), 'Image')[0].props.source.uri, thumbnail, 'Lists keep the existing thumbnail request');
  const playerProps = { ...nasProps, fullResolution: true };
  let image = findAll(renderArtwork(playerProps), 'Image')[0];
  assert.equal(image.props.source.uri, large.toString());
  image.props.onError();
  image = findAll(renderArtwork(playerProps), 'Image')[0];
  assert.equal(image.props.source.uri, thumbnail, 'A server rejecting the larger cover falls back to the working thumbnail');
  assert.equal(image.props.onError, undefined, 'A failed fallback cannot loop requests');
  assert.equal(new URL(findAll(renderArtwork({ ...playerProps, item: { artworkUrl: thumbnail.replace('track%26one', 'track-two') } }), 'Image')[0].props.source.uri).searchParams.get('size'), '1024', 'A previous cover failure cannot downgrade the next track');
  await preferences.getState().setHideArtwork(true);
  assert.equal(findAll(renderArtwork(playerProps), 'Image').length, 0, 'Hidden artwork never requests a large image');
  await preferences.getState().setHideArtwork(false);
  console.log('PASS: player-only larger NAS artwork, unchanged thumbnails/custom artwork, preserved authentication, bounded error fallback and track-change recovery. NAS response dimensions are checked separately on device.');
  let sessionId = 123, panelError = false, panelGate;
  const calls = [], alerts = [], platform = { OS: 'android' };
  const equalizer = load('src/services/playback/equalizer.ts', {
    '@/components/text': { Text: 'Text' },
  'react-native': { Platform: platform, Alert: { alert: (...args) => alerts.push(args) } },
    'expo-constants': { default: { expoConfig: { android: { package: 'xyz.yeongdu.yeongdumusic' } } }, __esModule: true },
    'expo-intent-launcher': { ActivityAction: { SOUND_SETTINGS: 'android.settings.SOUND_SETTINGS' }, startActivityAsync: async (action, params) => { calls.push({ action, params }); if (panelGate) await panelGate.promise; if (panelError) throw Error('no activity'); } },
    './controller': { getPlaybackAudioSessionId: () => sessionId },
  });
  await equalizer.openSystemEqualizer(); assert.equal(calls[0].action, 'android.media.action.DISPLAY_AUDIO_EFFECT_CONTROL_PANEL');
  assert.equal(calls[0].params.extra['android.media.extra.AUDIO_SESSION'], 123);
  assert.equal(calls[0].params.extra['android.media.extra.PACKAGE_NAME'], 'xyz.yeongdu.yeongdumusic');
  assert.equal(calls[0].params.extra['android.media.extra.CONTENT_TYPE'], 0);
  sessionId = null; await equalizer.openSystemEqualizer(); assert(!('android.media.extra.AUDIO_SESSION' in calls.at(-1).params.extra));
  panelGate = deferred(); const held = equalizer.openSystemEqualizer(); const before = calls.length; await equalizer.openSystemEqualizer(); assert.equal(calls.length, before); panelGate.resolve(); await held; panelGate = null;
  panelError = true; await equalizer.openSystemEqualizer(); assert.equal(alerts.at(-1)[2][1].text, '소리 설정 열기');
  panelError = false; alerts.at(-1)[2][1].onPress(); await flush(); assert.equal(calls.at(-1).action, 'android.settings.SOUND_SETTINGS');
  for (const os of ['ios', 'web']) { platform.OS = os; const count = calls.length; await equalizer.openSystemEqualizer(); assert.equal(calls.length, count); assert.match(alerts.at(-1)[1], /지원하지 않습니다/); }
  const { ExpoAudioEngine } = load('src/services/playback/audio-engine.ts', { 'expo-audio': {}, 'expo-constants': { default: {}, AppOwnership: { Expo: 'expo' }, __esModule: true }, '@/components/text': { Text: 'Text' },
  'react-native': { Platform: platform } });
  const engine = new ExpoAudioEngine(); platform.OS = 'android'; assert.equal(engine.getAudioSessionId(), null);
  for (const value of [0, -1, undefined, NaN, Infinity, 1.5]) { engine.player = { audioSessionId: value }; assert.equal(engine.getAudioSessionId(), null); }
  engine.player = { audioSessionId: 123 }; assert.equal(engine.getAudioSessionId(), 123); platform.OS = 'ios'; assert.equal(engine.getAudioSessionId(), null);
  console.log('PASS: official equalizer action/package/int extras, active/no-session cases, duplicate launch guard, unsupported platforms and missing-panel sound-settings fallback; existing player session getter validation. Native UI is mocked.');
  // Exercise the actual retry handlers and UI for cached missing results.
  let search = false, result = { data: { kind: 'missing', lines: [], provider: 'lrclib' }, isFetching: false, refetch: () => { retries++; } }, retries = 0;
  const translation = { enabled: true, shown: false };
  const panelModules = {
    react: { memo: fn => fn, useState: () => [search, value => { search = value; }] }, 'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/components/text': { Text: 'Text' },
  'react-native': { ...native, Pressable: 'Pressable', ActivityIndicator: 'Spinner' },
    'react-native-reanimated': { createAnimatedComponent: () => 'AnimatedText' }, '@expo/vector-icons/Ionicons': 'Icon',
    './lyrics-edge-fade': { LyricsEdgeFade: 'Fade' }, '@/services/lyrics/parse-lyrics': {},
    './use-active-lyric-index': { useActiveLyricIndex: () => -1 },
    './use-lyric-scroll': {},
    './use-lyric-timing': { useLyricTiming: () => ({ offsetMs: 0, key: null }) },
    './lyrics-timing-controls': { LyricsTimingControls: 'TimingControls' },
    './lyrics-source-control': { LyricsSourceControl: 'SourceControl' },
    './timing': {},
    './use-lyrics': { useLyrics: () => result }, '@/stores/playback': { usePlaybackStore: selector => selector({ duration: 120 }) }, '@/services/playback/controller': {},
    './use-lyrics-translation': { useLyricsTranslation: () => translation }, './lyrics-translation-controls': { LyricsTranslationControls: 'TranslationControls' },
  };
  const { LyricsPanel } = load('src/features/lyrics/lyrics-panel.tsx', panelModules);
  const panelProps = { song: { id: 'demo' }, source: 'auto', onSourceChange() {} };
  let panel = LyricsPanel(panelProps), retry = findAll(panel, 'Pressable').find(node => findAll(node, 'Text').some(text => text.props.children === '다시 찾기'));
  retry.props.onPress(); assert.equal(search, true); assert.equal(retries, 0);
  panel = LyricsPanel(panelProps); findAll(panel, 'Pressable').find(node => node.props.accessibilityLabel === '가사 다시 찾기').props.onPress(); assert.equal(retries, 1);
  result = { ...result, isFetching: true }; panel = LyricsPanel(panelProps); assert.equal(findAll(panel, 'Spinner').length, 2); assert(!findAll(panel, 'Text').some(node => node.props.children === '이 곡의 가사를 찾지 못했어요'));
  result = { ...result, isFetching: false, isError: true, error: new Error('retry failed') }; panel = LyricsPanel(panelProps); assert(findAll(panel, 'Text').some(node => node.props.children === 'retry failed'));
  search = false; result = { ...result, isError: false }; LyricsPanel({ ...panelProps, source: 'nas' }).props.children[0].props.children[1].props.onPress(); assert.equal(search, false); assert.equal(retries, 2);
  result = { ...result, data: { kind: 'plain', lines: [{ id: 'first', time: null, text: 'Original lyrics' }], provider: 'lrclib' } };
  assert.equal(findAll(LyricsPanel(panelProps), 'TranslationControls').length, 1);
  translation.enabled = false; const disabledPanel = LyricsPanel(panelProps);
  assert.equal(findAll(disabledPanel, 'TranslationControls').length, 0, 'Disabling the feature removes all translation controls');
  assert(disabledPanel.props.children.some(node => typeof node?.type === 'function' && node.type.name === 'LyricLines'), 'Original lyrics remain available');
  console.log('PASS: manual re-search switches strategy, repeated/NAS retries refetch, cached missing results show loading and retry errors. React/native rendering is mocked.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
