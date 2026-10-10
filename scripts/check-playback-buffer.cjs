const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));
const code = ts.transpileModule(fs.readFileSync(path.join(root, 'src/services/playback/audio-engine.ts'), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function harness({ os = 'android', dev = true, ownership = 'standalone', mode = async () => {} } = {}) {
  let now = 0;
  const events = [], logs = [], subscriptions = new Map();
  const player = {
    addListener(name, listener) {
      subscriptions.set(name, listener);
      return { remove: () => { subscriptions.delete(name); events.push(['unsubscribe', name]); } };
    },
    replace: source => events.push(['replace', source]),
    setActiveForLockScreen: (...args) => events.push(['lockscreen', ...args]),
    play: () => events.push(['play']), pause: () => events.push(['pause']),
    seekTo: async seconds => events.push(['seek', seconds]), release: () => events.push(['release']),
  };
  const modules = {
    'expo-audio': {
      createAudioPlayer: (source, options) => { events.push(['create', source, options]); return player; },
      setAudioModeAsync: options => { events.push(['mode', options]); return mode(); },
    },
    'expo-constants': { __esModule: true, default: { appOwnership: ownership }, AppOwnership: { Expo: 'expo' } },
    'react-native': { Platform: { OS: os } },
  };
  const exports = {};
  new Function('require', 'exports', '__DEV__', 'performance', 'console', code)(
    name => { if (!(name in modules)) throw new Error('Unexpected dependency: ' + name); return modules[name]; },
    exports, dev, { now: () => now }, { info: (...args) => logs.push(args) },
  );
  const engine = new exports.ExpoAudioEngine();
  const states = [];
  engine.subscribe(status => states.push(status));
  return {
    engine, events, logs, states, subscriptions,
    time: value => { now = value; },
    emit: status => subscriptions.get('playbackStatusUpdate')({
      playing: true, isBuffering: false, currentTime: 0, duration: 180, didJustFinish: false, error: null, ...status,
    }),
  };
}

const song = { id: 'mock-id', title: 'Private title', artist: 'Private artist', album: 'Private album', duration: 180 };
const source = { uri: 'https://example.invalid/webapi/stream.cgi?_sid=secret', headers: { Authorization: 'secret-header' } };
async function main() {
  const h = harness();
  await h.engine.load(source, song);
  const options = h.events.find(event => event[0] === 'create')[2];
  assert.equal(options.preferredForwardBufferDuration, 120);
  assert.equal(options.updateInterval, 500);
  assert.equal(h.events.filter(event => event[0] === 'mode').length, 1);
  const lockscreen = h.events.find(event => event[0] === 'lockscreen');
  assert.equal(lockscreen[3].showSkipPrevious, true);
  assert.equal(lockscreen[3].showSkipNext, true);

  // Initial loading is not reported as an interruption after playback.
  h.emit({ isBuffering: true });
  h.emit({ isBuffering: true });
  h.emit({ currentTime: 0 });
  assert.equal(h.logs.length, 0);
  h.emit({ currentTime: 12 });
  const before = h.events.length;
  h.time(1000);
  h.emit({ isBuffering: true, currentTime: 12 });
  h.time(1500);
  h.emit({ isBuffering: true, currentTime: 12 });
  h.time(2750);
  h.emit({ currentTime: 12.5 });
  assert.equal(h.events.length, before, 'Buffering status must not replace, play or release the stream');
  assert.deepEqual(h.logs, [
    ['[Playback] Buffering started', { positionSeconds: 12 }],
    ['[Playback] Buffering ended', { durationMs: 1750 }],
  ]);
  assert.equal(h.states.at(-1).buffering, false);
  assert.equal(h.states.at(-1).position, 12.5);
  const text = JSON.stringify(h.logs);
  for (const secret of [source.uri, 'secret-header', song.title, song.artist, song.id]) assert.ok(!text.includes(secret));

  const count = h.logs.length;
  await h.engine.seek(50);
  h.emit({ isBuffering: true, currentTime: 50 });
  h.emit({ currentTime: 51 });
  h.engine.pause();
  h.emit({ isBuffering: true, playing: false, currentTime: 51 });
  h.emit({ playing: false, currentTime: 51 });
  assert.equal(h.logs.length, count, 'Seek and intentional pause must not be counted as rebuffering');
  h.engine.play();
  h.emit({ currentTime: 52 });
  await h.engine.load(source, { ...song, id: 'second-song' });
  h.emit({ isBuffering: true });
  assert.equal(h.logs.length, count);
  assert.equal(h.events.filter(event => event[0] === 'create').length, 1, 'Reuse the global player across tracks');
  assert.equal(h.events.filter(event => event[0] === 'mode').length, 1);
  assert.equal(h.events.filter(event => event[0] === 'replace').length, 2);
  const remote = [];
  h.engine.subscribeRemoteNavigation(direction => remote.push(direction));
  h.subscriptions.get('remoteTrackChange')({ direction: 'next' });
  assert.deepEqual(remote, ['next']);
  h.emit({ currentTime: 5 });
  h.emit({ isBuffering: true, currentTime: 5 });
  h.emit({ error: 'mock error', currentTime: 5 });
  h.emit({ currentTime: 6 });
  assert.equal(h.logs.length, count + 1, 'Failed buffering must not be reported as a successful resume');
  h.engine.release();
  assert.equal(h.subscriptions.size, 0);
  assert.equal(h.events.filter(event => event[0] === 'release').length, 1);

  // Release builds never emit development diagnostics.
  const production = harness({ dev: false });
  await production.engine.load(source, song);
  production.emit({ currentTime: 1 });
  production.emit({ currentTime: 1, isBuffering: true });
  production.emit({ currentTime: 2 });
  assert.equal(production.logs.length, 0);
  production.engine.release();

  // iOS retains the system default, rather than claiming replace() honors the option.
  const ios = harness({ os: 'ios' });
  await ios.engine.load(source, song);
  assert.equal(ios.events.find(event => event[0] === 'create')[2].preferredForwardBufferDuration, 0);
  assert.equal(ios.subscriptions.has('remoteTrackChange'), false);
  ios.engine.release();
  const go = harness({ ownership: 'expo' });
  await go.engine.load(source, song);
  assert.equal(go.events.find(event => event[0] === 'mode')[1].shouldPlayInBackground, false);
  assert.equal(go.events.some(event => event[0] === 'lockscreen'), false);
  go.engine.release();

  let finish;
  const cancelled = harness({ mode: () => new Promise(resolve => { finish = resolve; }) });
  const loading = cancelled.engine.load(source, song);
  cancelled.engine.release();
  finish();
  await assert.rejects(loading, /취소/);
  assert.equal(cancelled.events.some(event => event[0] === 'create'), false);
  console.log('PASS: global player reuse, buffering without stream restart, startup/seek/pause diagnostics, sanitized timing, release cleanup, remote navigation, production/Expo Go/iOS behavior, and cancelled setup. Native buffering and actual NAS/device playback remain unverified.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
