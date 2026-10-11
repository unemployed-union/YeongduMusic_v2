const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));
const code = ts.transpileModule(fs.readFileSync(path.join(root, 'src/services/playback/audio-engine.ts'), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function harness({ os = 'android', dev = true, ownership = 'standalone', mode = async () => {}, seek = async () => {}, pauseStatus = null } = {}) {
  let now = 0;
  let timerId = 0;
  const timers = new Map();
  const events = [], logs = [], subscriptions = new Map();
  const player = {
    isLoaded: false,
    addListener(name, listener) {
      subscriptions.set(name, listener);
      return { remove: () => { subscriptions.delete(name); events.push(['unsubscribe', name]); } };
    },
    replace: source => { player.isLoaded = false; events.push(['replace', source]); },
    setActiveForLockScreen: (...args) => events.push(['lockscreen', ...args]),
    play: () => events.push(['play']), pause: () => {
      events.push(['pause']);
      if (pauseStatus) subscriptions.get('playbackStatusUpdate')?.({ playing: false, isLoaded: true, ...pauseStatus });
    },
    seekTo: async seconds => { events.push(['seek', seconds]); await seek(seconds); }, release: () => events.push(['release']),
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
  new Function('require', 'exports', '__DEV__', 'performance', 'console', 'setTimeout', 'clearTimeout', code)(
    name => { if (!(name in modules)) throw new Error('Unexpected dependency: ' + name); return modules[name]; },
    exports, dev, { now: () => now }, { info: (...args) => logs.push(args) },
    (callback, delay) => { timers.set(++timerId, { callback, at: now + delay }); return timerId; },
    id => timers.delete(id),
  );
  const engine = new exports.ExpoAudioEngine();
  const states = [];
  engine.subscribe(status => states.push(status));
  return {
    engine, events, logs, states, subscriptions, timers,
    time: value => { now = value; },
    advance: ms => {
      const target = now + ms;
      while (true) {
        const due = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at; timers.delete(due[0]); due[1].callback();
      }
      now = target;
    },
    emit: status => {
      player.isLoaded = status.isLoaded ?? true;
      subscriptions.get('playbackStatusUpdate')({
        playing: true, isLoaded: true, isBuffering: false, currentTime: 0, duration: 180, didJustFinish: false, error: null, ...status,
      });
    },
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
  await checkRecovery();
  console.log('PASS: player reuse, short buffering without restart, bounded stream recovery at the saved position, pause/track-change/release cancellation, persistent failure, native interruption, diagnostics, remote navigation, and platform behavior. Actual background NAS/device playback remains unverified.');
}

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
async function checkRecovery() {
  for (const os of ['android', 'ios']) {
    const h = harness({ os, dev: false });
    await h.engine.load(source, song);
    h.emit({ currentTime: 42 });
    h.emit({ error: 'network failure', playing: false, currentTime: 42 });
    h.emit({ playing: false, isLoaded: false, currentTime: 0, duration: 0 });
    assert.equal(h.states.at(-1).position, 42, 'Idle error events must preserve the resume position');
    assert.equal(h.states.at(-1).buffering, true);
    h.advance(1000);
    assert.equal(h.events.filter(e => e[0] === 'replace').length, 2);
    assert.equal(h.events.filter(e => e[0] === 'seek').length, 0, 'Wait for the new item to load before seeking');
    h.emit({ playing: false, isLoaded: false, isBuffering: true, currentTime: 0 });
    h.emit({ playing: false, isLoaded: true, currentTime: 0 });
    await flush();
    assert.deepEqual(h.events.filter(e => e[0] === 'seek').at(-1), ['seek', 42]);
    h.emit({ currentTime: 42.5 });
    assert.equal(h.states.at(-1).error, null);
    assert.equal(h.states.at(-1).buffering, false);
    assert.equal(h.timers.size, 0);

    h.emit({ isBuffering: true, currentTime: 42.5 });
    h.advance(19999);
    assert.equal(h.events.filter(e => e[0] === 'replace').length, 2);
    // No further status events arrive during Android buffering.
    h.advance(1);
    h.advance(3000);
    assert.equal(h.events.filter(e => e[0] === 'replace').length, 3);
    h.engine.release();
    assert.equal(h.timers.size, 0);
  }

  for (const cancel of ['pause', 'release', 'load']) {
    const h = harness(); await h.engine.load(source, song);
    h.emit({ currentTime: 25 }); h.emit({ error: 'failure', playing: false, currentTime: 25 });
    if (cancel === 'load') await h.engine.load({ uri: 'mock:new-track' }, { ...song, id: 'new-track' });
    else h.engine[cancel]();
    const count = h.events.length;
    h.advance(1000);
    assert.equal(h.events.length, count, `${cancel} must cancel the old retry`);
    h.engine.release();
  }

  // Pending seek completion must never restart audio after a pause or selection.
  for (const cancel of ['pause', 'release', 'load']) {
    let finish;
    const h = harness({ seek: () => new Promise(resolve => { finish = resolve; }) });
    await h.engine.load(source, song); h.emit({ currentTime: 55 });
    h.emit({ error: 'failure', playing: false, currentTime: 55 }); h.advance(1000);
    h.emit({ playing: false, currentTime: 0 });
    await flush();
    if (cancel === 'load') await h.engine.load('mock:other', song); else h.engine[cancel]();
    const count = h.events.filter(e => e[0] === 'play').length;
    finish(); await flush();
    assert.equal(h.events.filter(e => e[0] === 'play').length, count);
    h.engine.release();
  }

  const failed = harness(); await failed.engine.load(source, song); failed.emit({ currentTime: 70 });
  for (const delay of [1000, 3000, 6000]) {
    failed.emit({ error: 'failure', playing: false, currentTime: 70 }); failed.advance(delay);
    // A short recovery does not reset the retry budget.
    failed.emit({ playing: false, currentTime: 0 }); await flush();
    failed.emit({ currentTime: 70.5 });
  }
  failed.emit({ error: 'failure', playing: false, currentTime: 70.5 });
  assert.equal(failed.states.at(-1).playing, false);
  assert.equal(failed.states.at(-1).buffering, false);
  assert.ok(failed.states.at(-1).error);
  failed.emit({ playing: false, currentTime: 0, error: null });
  assert.ok(failed.states.at(-1).error, 'Ordinary native idle events must not erase a terminal error');
  assert.equal(failed.timers.size, 0);
  failed.engine.play(); failed.advance(1000);
  assert.equal(failed.events.filter(e => e[0] === 'replace').length, 5, 'Play retries the same track without navigating away');
  failed.engine.release();

  const paused = harness(); await paused.engine.load(source, song); paused.emit({ currentTime: 8 });
  paused.emit({ playing: false, currentTime: 8 }); paused.advance(60000);
  assert.equal(paused.events.filter(e => e[0] === 'replace').length, 1, 'Do not override lock screen pause or audio focus loss');
  paused.engine.release();

  const ended = harness(); await ended.engine.load(source, song); ended.emit({ currentTime: 180, didJustFinish: true });
  ended.advance(60000); assert.equal(ended.states.at(-1).ended, true); assert.equal(ended.timers.size, 0); ended.engine.release();

  const startup = harness(); await startup.engine.load(source, song); startup.advance(21000);
  assert.equal(startup.events.filter(e => e[0] === 'replace').length, 2, 'Recover a load that never emits ready'); startup.engine.release();

  let finish;
  const concurrent = harness({ mode: () => new Promise(resolve => { finish = resolve; }) });
  const first = concurrent.engine.load('mock:first', song);
  const second = concurrent.engine.load('mock:second', song);
  finish(); await Promise.all([first, second]);
  assert.deepEqual(concurrent.events.filter(e => e[0] === 'replace'), [['replace', 'mock:second']]); concurrent.engine.release();

  const oldReady = harness({ pauseStatus: { currentTime: 29, duration: 180, isBuffering: false } });
  await oldReady.engine.load(source, song); oldReady.emit({ currentTime: 29 });
  oldReady.emit({ error: 'failure', playing: false, currentTime: 29 }); oldReady.advance(1000); await flush();
  assert.equal(oldReady.events.some(e => e[0] === 'seek'), false, 'Ignore ready status emitted by pausing the previous item');
  oldReady.emit({ playing: false, currentTime: 0 }); await flush();
  assert.deepEqual(oldReady.events.filter(e => e[0] === 'seek').at(-1), ['seek', 29]); oldReady.engine.release();

  const idle = harness(); await idle.engine.load(source, song); idle.emit({ currentTime: 37 });
  idle.emit({ playing: false, isLoaded: false, currentTime: 0 });
  idle.emit({ error: 'failure', playing: false, isLoaded: false, currentTime: 0 }); idle.advance(1000);
  idle.emit({ playing: false, currentTime: 0 }); await flush();
  assert.deepEqual(idle.events.filter(e => e[0] === 'seek').at(-1), ['seek', 37]); idle.engine.release();

  const bufferPause = harness({ os: 'ios' }); await bufferPause.engine.load(source, song); bufferPause.emit({ currentTime: 6 });
  bufferPause.emit({ playing: false, isBuffering: true, timeControlStatus: 'paused', currentTime: 6 }); bufferPause.advance(60000);
  assert.equal(bufferPause.events.filter(e => e[0] === 'replace').length, 1); bufferPause.engine.release();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
