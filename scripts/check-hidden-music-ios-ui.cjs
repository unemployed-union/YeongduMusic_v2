const assert = require('node:assert/strict');
const { loadSource } = require('./test-source-loader.cjs');
const jsx = (type, props) => ({ type, props });
const nodes = (tree) =>
  Array.isArray(tree)
    ? tree.flatMap(nodes)
    : tree && typeof tree === 'object'
      ? [tree, ...nodes(tree.props?.children)]
      : [];
const calls = [];
let manager;
function harness(file) {
  const slots = [];
  let cursor = 0;
  const params = {};
  const mocks = {
    react: {
      useMemo: (fn) => fn(),
      useState(initial) {
        const index = cursor++;
        if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
        return [
          slots[index],
          (next) => {
            slots[index] = typeof next === 'function' ? next(slots[index]) : next;
          },
        ];
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { View: 'View' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 34 }) },
    'expo-router': {
      useLocalSearchParams: () => params,
      router: { setParams: (next) => Object.assign(params, next) },
      Stack: { Screen: 'Screen', Toolbar: Object.assign('Toolbar', { Button: 'ToolbarButton' }) },
    },
    '@expo/ui/swift-ui': Object.fromEntries(
      ['Button', 'DisclosureGroup', 'HStack', 'Image', 'Spacer', 'Text', 'VStack'].map((name) => [
        name,
        name,
      ]),
    ),
    '@expo/ui/swift-ui/modifiers': Object.fromEntries(
      [
        'accessibilityLabel',
        'buttonStyle',
        'font',
        'foregroundStyle',
        'frame',
        'lineLimit',
        'multilineTextAlignment',
        'padding',
        'disabled',
      ].map((name) => [name, (...args) => ({ name, args })]),
    ),
    '@/features/settings/ios/controls': Object.fromEntries(
      ['SettingsFeedback', 'SettingsNote', 'SettingsPicker', 'SettingsToggle'].map((name) => [
        name,
        name,
      ]),
    ),
    '@/features/settings/ios/field': { SettingsField: 'SettingsField' },
    '@/components/toast-notice': { ToastNotice: 'ToastNotice' },
    '@/features/settings/settings-ui': {
      SettingsPage: 'SettingsPage',
      SettingsNativeContent: 'SettingsNativeContent',
      SettingsSection: 'SettingsSection',
    },
    '@/theme/tokens': {
      useColors: () => ({
        tint: '#FF5C80',
        text: '#000000',
        muted: '#8A8A8E',
        background: '#FFFFFF',
      }),
    },
    './use-preset-manager': { usePresetManager: () => manager },
    './preset-editor': { PresetEditor: 'PresetEditor' },
    './source-kind': { isNasSong: () => true },
  };
  const component = loadSource(file, mocks);
  return (name, props) => {
    cursor = 0;
    return component[name](props);
  };
}
const preset = { id: 'one', name: '개인 음악', enabled: true, folders: [], songIds: [] };
const songs = [
  {
    id: 'a',
    title: '노래 A',
    artist: '가수',
    album: '앨범',
    path: '/music/개인 음악/매우 긴 폴더 이름/2026/가을/a.mp3',
  },
  { id: 'b', title: '노래 B', artist: '다른 가수', album: '앨범', path: '/music/공개/b.mp3' },
];
const render = harness('src/features/hidden-music/preset-editor.ios.tsx');
const props = {
  preset,
  songs,
  busy: false,
  error: null,
  onCancel: () => calls.push(['cancel']),
  onSave: (value) => calls.push(['save', value]),
};
const tree = () => nodes(render('PresetEditor', props));
let ui = tree();
assert.equal(ui.find((n) => n.type === 'Screen').props.options.title, '음악 숨기기');
assert.equal(ui.find((n) => n.type === 'SettingsField').props.layout, 'plain');
assert.equal(ui.find((n) => n.type === 'SettingsPicker').props.style, 'segmented');
assert.equal(ui.filter((n) => n.type === 'ToolbarButton').length, 2);
assert(
  !ui.some((n) => n.type === 'Button' && n.props.label === '프리셋 저장'),
  'Save belongs to the native header',
);
const selection = (list, path) =>
  list.find(
    (n) =>
      n.type === 'Button' &&
      n.props.modifiers?.some(
        (m) => m.name === 'accessibilityLabel' && m.args[0].startsWith(path + ', '),
      ),
  );
const open = (list, path) =>
  list.find(
    (n) =>
      n.type === 'Button' &&
      n.props.modifiers?.some(
        (m) => m.name === 'accessibilityLabel' && m.args[0] === path + ' 폴더 열기',
      ),
  );
const back = (list) => list.find((n) => n.type === 'Button' && n.props.modifiers?.some(
  (m) => m.name === 'accessibilityLabel' && m.args[0] === '상위 폴더로 이동',
));
selection(ui, '/music').props.onPress();
ui = tree();
assert(!selection(ui, '/music/개인 음악'), 'Selecting must keep the current level');
const rootRow = ui.find(
  (n) => n.type === 'HStack' && n.props.children?.includes(open(ui, '/music')),
);
assert(
  rootRow.props.children.includes(selection(ui, '/music')),
  'Browse and select are sibling buttons',
);
assert(
  nodes(open(ui, '/music'))
    .find((n) => n.type === 'Text' && n.props.children === '/music')
    .props.modifiers.some((m) => m.name === 'foregroundStyle' && m.args[0] === '#000000'),
  'Browse labels keep the theme text color inside native buttons',
);
open(ui, '/music').props.onPress();
ui = tree();
assert(!selection(ui, '/music'), 'The parent is not repeated among children');
assert(selection(ui, '/music/개인 음악'));
assert.equal(ui.find((n) => n.type === 'Screen').props.options.title, '음악 숨기기');
assert.equal(ui.filter((n) => n.type === 'ToolbarButton').length, 2);
assert(
  selection(ui, '/music/개인 음악').props.modifiers.some(
    (m) => m.name === 'accessibilityLabel' && m.args[0].includes('상위 폴더에 포함됨'),
  ),
);
selection(ui, '/music/개인 음악').props.onPress();
open(ui, '/music/개인 음악').props.onPress();
ui = tree();
assert(selection(ui, '/music/개인 음악/매우 긴 폴더 이름'));
back(ui).props.onPress();
ui = tree();
assert(
  selection(ui, '/music/개인 음악').props.modifiers.some(
    (m) => m.name === 'accessibilityLabel' && m.args[0].includes('선택됨'),
  ),
);
selection(ui, '/music/개인 음악').props.onPress();
ui.find((n) => n.type === 'SettingsToggle').props.onChange(true);
ui = tree();
assert(selection(ui, '/music'), 'Selected-only spans all levels');
assert(!selection(ui, '/music/개인 음악'), 'Selected-only excludes implicit children');
ui.find((n) => n.type === 'SettingsToggle').props.onChange(false);
ui.find((n) => n.type === 'SettingsField' && n.props.label.includes('검색')).props.onChange('가을');
ui = tree();
assert(!selection(ui, '/music'), 'Search results contain matching paths only');
assert(
  ui.some(
    (n) =>
      n.type === 'Text' && typeof n.props.children === 'string' && n.props.children.includes(' › '),
  ),
);
open(ui, '/music/개인 음악/매우 긴 폴더 이름/2026/가을').props.onPress();
ui = tree();
assert.equal(
  ui.find((n) => n.type === 'SettingsField' && n.props.label.includes('검색')).props.value,
  '',
);
assert(ui.some((n) => n.type === 'SettingsNote' && n.props.children === '하위 폴더가 없습니다.'));
ui.find((n) => n.type === 'SettingsPicker').props.onChange('song');
ui = tree();
assert.equal(
  ui.find((n) => n.type === 'SettingsField' && n.props.label.includes('검색')).props.value,
  '',
);
ui.find(
  (n) =>
    n.type === 'Button' &&
    n.props.modifiers?.some(
      (m) => m.name === 'accessibilityLabel' && m.args[0].startsWith('노래 A'),
    ),
).props.onPress();
ui = tree();
ui.find(
  (n) => n.type === 'ToolbarButton' && n.props.accessibilityLabel === '프리셋 저장',
).props.onPress();
assert.deepEqual(calls.at(-1), ['save', { ...preset, folders: ['/music'], songIds: ['a'] }]);
assert.deepEqual(preset.folders, [], 'Editing must not mutate stored preset');
ui.find((n) => n.type === 'SettingsPicker').props.onChange('folder');
ui = tree();
assert.equal(
  ui.find((n) => n.type === 'SettingsSection' && n.props.title === '가을').props.title,
  '가을',
  'Mode changes preserve the browsing location',
);
assert(
  ui.some(
    (n) =>
      n.type === 'SettingsSection' &&
      n.props.description?.includes('선택한 폴더 1개 · 곡 1개'),
  ),
);
ui.find((n) => n.type === 'SettingsPicker').props.onChange('song');
ui = tree();

ui.find((n) => n.type === 'ToolbarButton' && n.props.children === '취소').props.onPress();
assert.deepEqual(calls.at(-1), ['cancel']);
// A late refresh updates the library snapshot without replacing the draft or current level.
let retries = 0;
props.libraryLoading = true;
props.libraryError = '네트워크 연결이 끊겼습니다.';
props.onRetryLibrary = () => {
  retries++;
};
ui = tree();
let feedback = ui.find((n) => n.type === 'SettingsFeedback' && n.props.onRetry);
assert(feedback.props.loading && feedback.props.disabled);
props.libraryLoading = false;
ui = tree();
feedback = ui.find((n) => n.type === 'SettingsFeedback' && n.props.onRetry);
assert.equal(feedback.props.error, props.libraryError);
feedback.props.onRetry();
assert.equal(retries, 1);
props.songs = [];
ui = tree();
ui.find(
  (n) => n.type === 'ToolbarButton' && n.props.accessibilityLabel === '프리셋 저장',
).props.onPress();
assert.deepEqual(calls.at(-1)[1].folders, ['/music']);
assert.deepEqual(calls.at(-1)[1].songIds, ['a'], 'Disappearing tracks remain in the draft');
props.error = '저장 실패';
assert(tree().some((n) => n.type === 'SettingsFeedback' && n.props.error === '저장 실패'));
props.songs = songs;
props.libraryError = null;
props.error = null;
props.busy = true;
assert(
  tree()
    .filter((n) => n.type === 'ToolbarButton')
    .every((n) => n.props.disabled),
);
const newPreset = harness('src/features/hidden-music/preset-editor.ios.tsx');
assert.equal(
  nodes(newPreset('PresetEditor', { ...props, preset: { ...preset, name: '' } })).find(
    (n) => n.type === 'Screen',
  ).props.options.title,
  '음악 숨기기',
);

const editMissing = harness('src/features/hidden-music/preset-editor.ios.tsx');
const missingPreset = { ...preset, folders: ['/deleted/Child'], songIds: ['gone'] };
const missingUI = () =>
  nodes(editMissing('PresetEditor', { ...props, busy: false, preset: missingPreset }));
ui = missingUI();
open(ui, '/deleted').props.onPress();
ui = missingUI();
assert(selection(ui, '/deleted/Child'));
ui.find(
  (n) => n.type === 'ToolbarButton' && n.props.accessibilityLabel === '프리셋 저장',
).props.onPress();
assert.deepEqual(calls.at(-1)[1], missingPreset, 'Old paths and IDs round-trip unchanged');
const wideRender = harness('src/features/hidden-music/preset-editor.ios.tsx');
const wideSongs = Array.from({ length: 151 }, (_, i) => ({
  id: String(i),
  title: String(i),
  artist: '',
  album: '',
  path: `/wide/folder-${i}/song.mp3`,
}));
const wideUI = () => nodes(wideRender('PresetEditor', { ...props, busy: false, songs: wideSongs }));
ui = wideUI();
open(ui, '/wide').props.onPress();
ui = wideUI();
assert.equal(
  ui.filter(
    (n) =>
      n.type === 'Button' &&
      n.props.modifiers?.some(
        (m) => m.name === 'accessibilityLabel' && m.args[0].endsWith(' 폴더 열기'),
      ),
  ).length,
  100,
);
ui.find((n) => n.type === 'Button' && n.props.label === '더 보기').props.onPress();
ui = wideUI();
assert.equal(
  ui.filter(
    (n) =>
      n.type === 'Button' &&
      n.props.modifiers?.some(
        (m) => m.name === 'accessibilityLabel' && m.args[0].endsWith(' 폴더 열기'),
      ),
  ).length,
  151,
  'Every sibling is reachable without requiring search',
);

manager = {
  draft: null,
  busy: false,
  message: null,
  error: null,
  hiddenCount: 0,
  songs,
  profile: { biometricLock: true, presets: [] },
  query: { data: { items: songs }, isPending: false, isError: false, isRefetching: false },
  setDraft(value) {
    this.draft = value;
  },
  setMessage(value) {
    this.message = value;
  },
  run: async (task, success) => {
    await task();
    success?.();
  },
  setBiometricLock: async (value) => calls.push(['lock', value]),
  togglePreset: async (id) => calls.push(['toggle', id]),
};
const managerRender = harness('src/features/hidden-music/preset-manager.ios.tsx');
const list = () => nodes(managerRender('PresetManager'));
ui = list();
assert(!ui.some((n) => n.type === 'SettingsField'), 'Empty list has no search');
assert(ui.some((n) => n.type === 'Text' && n.props.children === '아직 프리셋이 없습니다'));
assert(ui.every((n) => n.type !== 'SettingsSection' || n.props.systemAppearance));
ui.find((n) => n.type === 'Button' && n.props.label === '프리셋 만들기').props.onPress();
assert(manager.draft.enabled && manager.draft.id && !manager.draft.name);
manager.draft = null;
manager.profile.presets = [preset, { ...preset, id: 'two', name: '다른 프리셋' }];
ui = list();
assert.equal(ui.filter((n) => n.type === 'DisclosureGroup').length, 2);
assert(
  ui.filter((n) => n.type === 'DisclosureGroup').every((n) => !n.props.isExpanded),
  'Preset controls start collapsed',
);
ui.find((n) => n.type === 'DisclosureGroup').props.onIsExpandedChange(true);
assert(list().find((n) => n.type === 'DisclosureGroup').props.isExpanded);
ui.find((n) => n.type === 'SettingsField').props.onChange('다른');
ui = list();
assert.equal(ui.filter((n) => n.type === 'DisclosureGroup').length, 1);
assert(ui.find((n) => n.type === 'DisclosureGroup').props.label.startsWith('다른 프리셋'));
ui.find((n) => n.type === 'SettingsField').props.onChange('없음');
assert(!list().some((n) => n.type === 'DisclosureGroup'));
console.log(
  'PASS: iOS hidden music native header, hierarchical browse/back and independent selection, filters, empty/search states, save/cancel and immutable draft payloads. Native rendering is checked separately.',
);
