const assert = require('node:assert/strict');
const { loadSource } = require('./test-source-loader.cjs');
const jsx = (type, props) => ({ type, props });
const nodes = (tree) =>
  Array.isArray(tree)
    ? tree.flatMap(nodes)
    : tree && typeof tree === 'object'
      ? [tree, ...nodes(tree.props?.children)]
      : [];
const Toolbar = Object.assign(function Toolbar() {}, { Content: 'ToolbarContent' });
const nativeUI = Object.fromEntries(
  [
    'Host',
    'BottomSheet',
    'Button',
    'Group',
    'NavigationStack',
    'ToolbarItem',
    'List',
    'Menu',
    'Section',
    'Label',
    'Picker',
    'Text',
    'HStack',
    'Image',
    'ProgressView',
  ].map((name) => [name, name]),
);
nativeUI.Toolbar = Toolbar;
const modifiers = Object.fromEntries(
  [
    'accessibilityLabel',
    'navigationBarTitleDisplayMode',
    'navigationTitle',
    'presentationDetents',
    'presentationDragIndicator',
    'disabled',
    'tint',
    'labelsHidden',
    'foregroundStyle',
    'frame',
    'listStyle',
    'pickerStyle',
    'tag',
    'buttonStyle',
    'controlSize',
    'lineLimit',
  ].map((name) => [name, (...args) => ({ name, args })]),
);
let accent = '#FF5588';
const boundaries = {
  'react-native': { Platform: { Version: 27 } },
  'react/jsx-runtime': { jsx, jsxs: jsx },
  '@expo/ui/swift-ui': nativeUI,
  '@expo/ui/swift-ui/modifiers': modifiers,
  '@/theme/tokens': { useColors: () => ({ tint: accent }), useAppColorScheme: () => 'dark' },
};
const { MusicSourceSheet } = loadSource(
  'src/features/library/music-source-sheet.ios.tsx',
  boundaries,
);
let closed = 0,
  dismissed = 0;
const props = {
  title: '음악 소스',
  visible: true,
  children: jsx('NativeContent', {}),
  onClose() {
    closed++;
  },
  onDismiss() {
    dismissed++;
  },
};
let tree = MusicSourceSheet(props);
assert.equal(tree.type, 'Host');
assert.equal(
  tree.props.style.position,
  'absolute',
  'The presentation anchor must not add spacing to library content',
);
const sheet = nodes(tree).find((node) => node.type === 'BottomSheet');
assert.equal(sheet.props.isPresented, true);
assert.equal(
  MusicSourceSheet({ ...props, visible: false }).props.children.props.isPresented,
  false,
);
assert(
  !nodes(tree).some((node) => ['Modal', 'Pressable', 'Glass', 'SafeAreaView'].includes(node.type)),
  'SwiftUI owns presentation and chrome',
);
const group = nodes(tree).find((node) => node.type === 'Group');
assert.deepEqual(
  group.props.modifiers.find((value) => value.name === 'presentationDetents').args[0],
  ['medium', 'large'],
);
assert.equal(
  group.props.modifiers.find((value) => value.name === 'presentationDragIndicator').args[0],
  'visible',
);
const toolbar = nodes(tree).find((node) => node.type === Toolbar);
assert(
  toolbar.props.modifiers.some(
    (value) => value.name === 'navigationTitle' && value.args[0] === '음악 소스',
  ),
);
const close = nodes(tree).find((node) => node.type === 'Button' && node.props.role === 'close');
close.props.onPress();
assert.equal(closed, 1);
assert.equal(dismissed, 0);
sheet.props.onIsPresentedChange(true);
assert.equal(closed, 1);
sheet.props.onIsPresentedChange(false);
assert.equal(closed, 2);
sheet.props.onDismiss();
assert.equal(dismissed, 1, 'Only completed dismissal runs deferred actions');
boundaries['react-native'].Platform.Version = 18;
assert(
  nodes(MusicSourceSheet(props)).some(
    (node) => node.type === 'Button' && node.props.label === '닫기' && node.props.role === 'cancel',
  ),
  'Older iOS has a visible native close action',
);
boundaries['react-native'].Platform.Version = 27;

const { MusicSourceMenuContent } = loadSource(
  'src/features/library/music-source-menu-content.ios.tsx',
  boundaries,
);
const selected = [],
  routes = [],
  imports = [];
let reloads = 0;
const contentProps = {
  sources: ['all', 'local'],
  selected: 'all',
  busy: false,
  error: null,
  setup: false,
  onSelect: (value) => selected.push(value),
  onOpenConnection: (value) => routes.push(value),
  onImport: (value) => imports.push(value),
  onReload: () => reloads++,
};
const content = (value) => MusicSourceMenuContent({ ...contentProps, ...value });
tree = content();
assert.equal(tree.type, 'List');
assert(
  tree.props.modifiers.some((mod) => mod.name === 'listStyle' && mod.args[0] === 'insetGrouped'),
);
assert(
  nodes(tree)
    .filter((node) => node.type === 'Section')
    .every((node) => !node.props.modifiers?.length),
  'The music-source window uses native grouped sections',
);
assert(
  !nodes(tree).some((node) => node.props?.modifiers?.some((mod) => mod.name === 'glassEffect')),
  'No individual glass button surfaces',
);
const picker = nodes(tree).find((node) => node.type === 'Picker');
assert.deepEqual(
  nodes(picker)
    .filter((node) => node.type === 'Text')
    .map((node) => node.props.children),
  ['전체 음악', '이 기기 음악'],
);
assert.equal(picker.props.label, '', 'Do not show a duplicate music-source row');
assert(picker.props.modifiers.some((mod) => mod.name === 'labelsHidden'));
assert(
  !nodes(tree).some((node) => node.type === 'Label' || node.props?.systemImage),
  'Source and action rows have no decorative icons',
);
assert.equal(MusicSourceSheet(props).props.seedColor, accent);
assert(
  close.props.modifiers.some((mod) => mod.name === 'tint' && mod.args[0] === accent),
  'Native close glyph follows the app accent',
);
picker.props.onSelectionChange('nas');
picker.props.onSelectionChange('all');
picker.props.onSelectionChange('local');
assert.deepEqual(selected, ['local'], 'Only a changed, currently connected source is selected');
const missingSelection = nodes(content({ selected: 'drive' })).find(
  (node) => node.type === 'Picker',
);
assert.equal(
  missingSelection.props.selection,
  'unavailable',
  'Disconnected selections have a valid placeholder tag',
);
missingSelection.props.onSelectionChange('unavailable');
assert.deepEqual(selected, ['local']);
missingSelection.props.onSelectionChange('all');
assert.equal(selected.at(-1), 'all', 'All music remains selectable after a source disconnects');
const buttons = (tree) => nodes(tree).filter((node) => node.type === 'Button');
buttons(tree)
  .find((node) => node.props.label === 'Google Drive 연결 관리')
  .props.onPress();
assert.deepEqual(routes, ['/settings/cloud/google-drive']);
buttons(tree)
  .find((node) => node.props.label === '파일 선택')
  .props.onPress();
buttons(tree)
  .find((node) => node.props.label === '폴더 선택 · 하위 폴더 포함')
  .props.onPress();
assert.deepEqual(imports, ['files', 'folder']);
buttons(tree)
  .find((node) => node.props.label === '저장된 음악 목록 다시 불러오기')
  .props.onPress();
assert.equal(reloads, 1);
assert(!buttons(tree).some((node) => node.props.label === 'NAS 연결'));
assert(buttons(content({ setup: true })).some((node) => node.props.label === 'NAS 연결'));
assert(
  nodes(content({ error: 'Storage error' })).some(
    (node) => node.type === 'Text' && node.props.children === 'Storage error',
  ),
);
const busy = content({ busy: true });
for (const label of ['파일 선택', '폴더 선택 · 하위 폴더 포함', '저장된 음악 목록 다시 불러오기']) {
  assert(
    buttons(busy)
      .find((node) => node.props.label === label)
      .props.modifiers.some((value) => value.name === 'disabled' && value.args[0]),
  );
}
const { MusicSourceTrigger } = loadSource(
  'src/features/library/music-source-trigger.ios.tsx',
  boundaries,
);
let opened = 0;
tree = MusicSourceTrigger({
  selected: 'all',
  label: '전체 음악',
  busy: true,
  onPress: () => opened++,
});
assert.equal(tree.type, 'Host');
assert(nodes(tree).some((node) => node.type === 'ProgressView'));
assert.equal(tree.props.seedColor, accent);
for (const name of ['tint', 'foregroundStyle']) {
  assert(
    buttons(tree)[0].props.modifiers.some((mod) => mod.name === name && mod.args[0] === accent),
  );
}
buttons(tree)[0].props.onPress();
assert.equal(opened, 1);

const selections = [];
const { LibrarySortControl } = loadSource(
  'src/features/library/library-sort-control.ios.tsx',
  boundaries,
);
const renderSort = (props = {}) =>
  LibrarySortControl({
    tab: 'albums',
    order: 'ascending',
    onChange: (value) => selections.push(value),
    ...props,
  });
tree = renderSort();
const sortMenu = nodes(tree).find((node) => node.type === 'Menu');
assert(sortMenu, 'Short sorting choices use a native menu');
assert.equal(tree.props.seedColor, accent);
assert(sortMenu.props.modifiers.some((mod) => mod.name === 'tint' && mod.args[0] === accent));
assert(
  !nodes(tree).some((node) => node.type === 'BottomSheet'),
  'Sorting does not add another sheet',
);
assert.deepEqual(
  buttons(tree).map((node) => node.props.label),
  ['기본', '오름차순', '내림차순'],
);
assert.equal(buttons(tree)[1].props.systemImage, 'checkmark');
buttons(tree)[1].props.onPress();
assert.deepEqual(selections, [], 'Selecting the current sort does not reset the list');
buttons(tree)[2].props.onPress();
assert.deepEqual(selections, ['descending']);

console.log(
  'PASS: native music-source/sort sheet composition, resize and dismissal, all sort modes/tab labels, live accent colors on both triggers, connected-source filtering, deferred source actions, busy/error states and platform fallback. Native rendering is mocked.',
);
