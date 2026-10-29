const assert = require('node:assert/strict');
const { createStore } = require('zustand/vanilla');
const { loadSource } = require('./test-source-loader.cjs');
const create = initializer => {
  const store = createStore(initializer);
  return Object.assign(select => select ? select(store.getState()) : store.getState(), store);
};
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const jsx = (type, props) => ({ type, props });
async function check(os) {
  const values = new Map(), key = 'yeongdumusic-play-on-seek-v1';
  let failRead = false, failWrite = false, gate;
  const kv = {
    getItem: async name => { if (failRead) throw Error('read'); return values.get(name) ?? null; },
    setItem: async (name, value) => { if (gate) await gate.promise; if (failWrite) throw Error('write'); values.set(name, value); },
  };
  const mocks = { zustand: { create }, 'react-native': { Platform: { OS: os } }, 'expo-sqlite/kv-store': { __esModule: true, default: kv } };
  const globals = { localStorage: { getItem: name => values.get(name) ?? null, setItem: (name, value) => values.set(name, value) } };
  const load = () => loadSource('src/stores/playback-preferences.ts', mocks, globals).usePlaybackPreferences;
  let store = load(); await store.getState().load(); assert.equal(store.getState().playOnSeek, false);
  await store.getState().setPlayOnSeek(true); assert.equal(values.get(key), 'true');
  store = load(); await store.getState().load(); assert.equal(store.getState().playOnSeek, true, 'Preference survives restart on ' + os);
  await Promise.all([store.getState().setPlayOnSeek(false), store.getState().setPlayOnSeek(true)]);
  assert.equal(store.getState().playOnSeek, true);
  if (os === 'web') return;
  failWrite = true; await assert.rejects(store.getState().setPlayOnSeek(false));
  assert.equal(store.getState().playOnSeek, true, 'A failed write retains the working preference'); failWrite = false;
  const colors = { text: '#fff', muted: '#999', tint: '#f58', separator: '#333' };
  const Settings = loadSource('src/features/playback/seek-playback-settings.tsx', {
    react: { useEffect() {} }, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { View: 'View', Pressable: 'Button', StyleSheet: { create: value => value } },
    '@expo/vector-icons/Ionicons': 'Icon', '@/components/text': { Text: 'Text' }, '@/components/animated-switch': { AnimatedSwitch: 'Switch' },
    '@/stores/playback-preferences': { usePlaybackPreferences: store }, '@/theme/tokens': { useColors: () => colors },
    '@/features/settings/settings-menu-layout': { settingsMenuStyles: { row: {} }, useSettingsMenuIconStyle: () => ({}) },
  }).SeekPlaybackSettings;
  const switchNode = () => nodes(Settings()).find(node => node.type === 'Switch');
  assert.equal(switchNode().props.accessibilityLabel, '탐색 후 자동 재생');
  gate = deferred(); switchNode().props.onValueChange(false); await flush();
  assert.equal(switchNode().props.busy, true); assert.equal(switchNode().props.disabled, false, 'Saving keeps the switch tone stable');
  assert.equal(switchNode().props.value, true);
  gate.resolve(); await flush(); gate = null;
  assert.equal(switchNode().props.value, false); assert.equal(switchNode().props.busy, false);
  failRead = true; await store.getState().load(true);
  assert.equal(switchNode().props.disabled, true); assert(nodes(Settings()).some(node => node.props?.accessibilityRole === 'alert'));
  failRead = false; nodes(Settings()).find(node => node.type === 'Button').props.onPress(); await flush();
  assert.equal(switchNode().props.disabled, false);
  values.set(key, '"true"'); store = load(); await store.getState().load();
  assert.equal(store.getState().playOnSeek, false); assert.equal(store.getState().loadError, true, 'Malformed settings cannot enable audio');
  await assert.rejects(store.getState().setPlayOnSeek(true), /먼저 다시/);
}
(async () => {
  for (const os of ['android', 'ios', 'web']) await check(os);
  console.log('PASS: seek-playback defaults, persistence/restart, ordered writes, storage failures, malformed values, switch busy tone and retry on Android/iOS/web. Storage and native rendering are mocked.');
})().catch(error => { console.error(error); process.exitCode = 1; });
