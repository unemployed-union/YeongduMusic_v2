const assert = require('node:assert/strict');
const { loadSource } = require('./test-source-loader.cjs');
const progress = loadSource('src/features/library/load-progress.ts');
const { loadSongLibrary } = loadSource('src/features/library/load-song-library.ts');
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { resolve, reject, promise };
}

async function checkLifecycle() {
  const pages = [deferred(), deferred(), deferred()];
  const reports = [];
  const unsubscribe = progress.subscribeLibraryLoads(() => reports.push(progress.libraryLoadSnapshot()));
  let finished = false;
  const run = progress.trackLibraryLoad('a', report => loadSongLibrary({
    songs: ({ offset, limit }) => {
      assert.equal(limit, 100);
      return pages[offset / 100].promise;
    },
  }, new AbortController().signal, report)).then(value => { finished = true; return value; });
  assert.equal(progress.libraryLoadSnapshot()[0].total, null);
  pages[0].resolve({ items: Array.from({ length: 100 }, (_, id) => ({ id: String(id) })), total: 205 });
  await tick();
  assert.equal(progress.libraryLoadSnapshot()[0].loaded, 100);
  assert.equal(progress.libraryLoadSnapshot()[0].total, 205);
  assert.equal(finished, false, 'Progress never publishes a partial library as final data');
  pages[1].resolve({ items: Array.from({ length: 100 }, (_, id) => ({ id: String(id + 100) })), total: 205 });
  await tick();
  pages[2].resolve({ items: Array.from({ length: 5 }, (_, id) => ({ id: String(id + 200) })), total: 205 });
  assert.equal((await run).items.length, 205);
  assert.equal(progress.libraryLoadSnapshot().length, 0);
  assert(reports.some(snapshot => snapshot[0]?.loaded === 205));

  const abort = new AbortController();
  const late = deferred();
  const cancelled = progress.trackLibraryLoad('a', report => loadSongLibrary({ songs: () => late.promise }, abort.signal, report));
  abort.abort();
  late.resolve({ items: [{ id: 'late' }], total: 1 });
  await assert.rejects(cancelled);
  assert.equal(progress.libraryLoadSnapshot().length, 0);

  const old = deferred();
  const next = deferred();
  let reportOld;
  let reportNext;
  const first = progress.trackLibraryLoad('same-account', report => { reportOld = report; return old.promise; });
  const second = progress.trackLibraryLoad('same-account', report => { reportNext = report; return next.promise; });
  reportOld({ loaded: 99, total: 100 });
  assert.equal(progress.libraryLoadSnapshot()[0].loaded, 0);
  old.resolve();
  await first;
  assert.equal(progress.libraryLoadSnapshot().length, 1, 'Old completion cannot hide a newer request');
  reportNext({ loaded: 50, total: 100 });
  const notifications = reports.length;
  reportNext({ loaded: 50, total: 100 });
  assert.equal(reports.length, notifications, 'Unchanged counters do not notify observers');
  next.reject(Error('network'));
  await assert.rejects(second, /network/);
  assert.equal(progress.libraryLoadSnapshot().length, 0);
  unsubscribe();
}

async function checkStatus() {
  const pending = deferred();
  let report;
  const run = progress.trackLibraryLoad('a', update => { report = update; return pending.promise; });
  let source = 'all';
  let identity = 'a';
  let fetching = true;
  let retries = 0;
  const providers = [{ id: 'nas', name: 'NAS 음악' }, { id: 's3', name: 'S3' }, { id: 'local', name: '기기 음악' }];
  let states = providers.map(() => ({ loading: false }));
  const jsx = (type, props) => ({ type, props });
  const { LibraryLoadStatus } = loadSource('src/features/library/library-load-status.tsx', {
    react: { useSyncExternalStore: (_subscribe, read) => read() },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { View: 'View', Pressable: 'Pressable', StyleSheet: { create: value => value } },
    '@tanstack/react-query': { useIsFetching: ({ predicate }) => fetching && predicate({ queryKey: ['song-library', identity] }) ? 1 : 0 },
    '@/components/text': { Text: 'Text' },
    '@/components/progress-bar': { ProgressBar: 'ProgressBar' },
    '@/theme/tokens': { useColors: () => ({ muted: '#777', tint: '#f08' }) },
    '@/stores/auth': { useAuthStore: select => select({ mode: 'nas', session: null }) },
    '@/stores/local-music': { useLocalMusicStore: select => select({ source }) },
    '@/services/music-providers/registry': { musicProviders: providers },
    './use-source-libraries': { useProviderStates: () => states },
    './load-progress': progress,
    './repository': { libraryIdentity: () => identity },
  });
  function nodes(node, type) {
    if (!node || typeof node !== 'object') {
      return [];
    }
    const children = Array.isArray(node.props?.children) ? node.props.children : [node.props?.children];
    return [...(node.type === type ? [node] : []), ...children.flatMap(child => nodes(child, type))];
  }
  const defaults = { refreshing: false, error: null, message: null, onRetry: async () => { retries++; } };
  let tree = LibraryLoadStatus(defaults);
  assert.equal(nodes(tree, 'ProgressBar')[0].props.percent, null, 'Unknown total has no fabricated percentage');
  report({ loaded: 300, total: 1546 });
  tree = LibraryLoadStatus({ ...defaults, message: '완료' });
  assert.equal(nodes(tree, 'ProgressBar')[0].props.percent, 19);
  assert(nodes(tree, 'Text').some(node => /300.*1,546.*19%/.test(node.props.children)));
  assert(!nodes(tree, 'Text').some(node => node.props.children === '완료'), 'Success notice waits until all active loads finish');
  states = states.map((state, index) => index === 1 ? { loading: true } : state);
  tree = LibraryLoadStatus(defaults);
  assert.deepEqual(nodes(tree, 'ProgressBar').map(node => node.props.percent), [19, null], 'Mixed known/unknown sources stay separate');
  source = 's3';
  states = providers.map(() => ({ loading: false }));
  assert.equal(LibraryLoadStatus(defaults), null, 'A previous source load is hidden after filtering');
  source = 'all';
  identity = 'another-account';
  fetching = false;
  assert.equal(LibraryLoadStatus(defaults), null, 'An old account cannot display progress for a new one');
  identity = 'a';
  assert.equal(LibraryLoadStatus({ ...defaults, active: false }), null, 'Unfocused screens unmount animated progress');
  pending.resolve();
  await run;
  tree = LibraryLoadStatus({ ...defaults, refreshing: true });
  assert.equal(nodes(tree, 'ProgressBar')[0].props.percent, null);
  tree = LibraryLoadStatus({ ...defaults, message: '완료' });
  assert.equal(nodes(tree, 'ProgressBar').length, 0);
  assert.equal(nodes(tree, 'Text')[0].props.children, '완료');
  tree = LibraryLoadStatus({ ...defaults, error: '실패' });
  await nodes(tree, 'Pressable')[0].props.onPress();
  assert.equal(retries, 1);
}

function checkBar() {
  const states = [];
  const effects = [];
  let cursor;
  let effectCursor;
  let reduced = false;
  let started = 0;
  let stopped = 0;
  const configs = [];
  const jsx = (type, props) => ({ type, props });
  const { ProgressBar } = loadSource('src/components/progress-bar.tsx', {
    react: {
      useState(initial) {
        const slot = cursor++;
        if (!(slot in states)) {
          states[slot] = typeof initial === 'function' ? initial() : initial;
        }
        return [states[slot], value => { states[slot] = value; }];
      },
      useEffect(callback, dependencies) {
        const slot = effectCursor++;
        const previous = effects[slot];
        if (!previous || dependencies.some((value, index) => !Object.is(value, previous.dependencies[index]))) {
          previous?.cleanup?.();
          effects[slot] = { dependencies, cleanup: callback() };
        }
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': {
      View: 'View', StyleSheet: { create: value => value }, Easing: { linear: 'linear' },
      Animated: {
        View: 'AnimatedView', Value: class { setValue() {} interpolate(options) { return options; } },
        timing: (_value, config) => { configs.push(config); return {}; },
        loop: () => ({ start: () => { started++; }, stop: () => { stopped++; } }),
      },
    },
    'react-native-reanimated': { useReducedMotion: () => reduced },
    '@/theme/tokens': { useColors: () => ({ tint: '#f08', separator: '#ccc' }) },
  });
  function render(percent) {
    cursor = 0;
    effectCursor = 0;
    return ProgressBar({ percent, label: '진행률' });
  }
  let tree = render(null);
  assert.equal(tree.props.accessibilityValue.now, undefined);
  tree.props.onLayout({ nativeEvent: { layout: { width: 300 } } });
  render(null);
  assert.equal(started, 1);
  assert.equal(configs[0].useNativeDriver, true);
  assert.equal(configs[0].isInteraction, false, 'Loading animation must not block virtualized list batches');
  tree = render(25);
  assert.equal(tree.props.accessibilityValue.now, 25);
  assert.equal(stopped, 1);
  reduced = true;
  render(null);
  assert.equal(started, 1, 'Reduced motion does not start the loop');
}

async function main() {
  await checkLifecycle();
  await checkStatus();
  checkBar();
  console.log('PASS: real page counters, no partial data publication, cancellation/retry races, account/source isolation, mixed indeterminate progress, completion/error notices, accessibility and animation cleanup. Native rendering is mocked.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
