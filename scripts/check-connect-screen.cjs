const assert = require('node:assert/strict');
const { loadSource } = require('./test-source-loader.cjs');
const jsx = (type, props) => ({ type, props });

function nodes(tree) {
  if (Array.isArray(tree)) {
    return tree.flatMap(nodes);
  }
  if (tree && typeof tree === 'object') {
    return [tree, ...nodes(tree.props?.children), ...nodes(tree.props?.footer)];
  }
  return [];
}

function runtime(platform = 'ios') {
  const slots = [];
  const effects = [];
  const calls = [];
  let cursor = 0;
  let login = async () => {};
  let discover = async () => ({ 'SYNO.AudioStation.Song': {} });
  function state(initial) {
    const index = cursor++;
    if (!(index in slots)) {
      slots[index] = typeof initial === 'function' ? initial() : initial;
    }
    return [
      slots[index],
      (value) => {
        slots[index] = value;
      },
    ];
  }
  class SynologyError extends Error {
    constructor(code) {
      super('추가 인증이 필요합니다.');
      this.code = code;
    }
  }
  const auth = {
    preferredAddress: 'https://nas.example.test:5001',
    notice: null,
    connect: async (...args) => {
      calls.push(['login', ...args]);
      await login(...args);
    },
    useMock: () => calls.push(['demo']),
  };
  const swiftNames = [
    'Button',
    'Form',
    'Host',
    'HStack',
    'NavigationStack',
    'ProgressView',
    'Section',
    'Text',
    'ToolbarItem',
    'VStack',
    'TextField',
    'SecureField',
    'Toggle',
    'Group',
  ];
  const nativeUI = Object.fromEntries(swiftNames.map((name) => [name, 'Swift' + name]));
  nativeUI.Toolbar = Object.assign((props) => jsx('SwiftToolbar', props), {
    Content: 'SwiftToolbarContent',
  });
  nativeUI.useNativeState = (initial) =>
    state(() => {
      let value = initial;
      return {
        get: () => value,
        set: (next) => {
          value = next;
        },
      };
    })[0];
  const modifiers = [
    'accessibilityLabel',
    'autocorrectionDisabled',
    'font',
    'fixedSize',
    'frame',
    'multilineTextAlignment',
    'listRowBackground',
    'listRowInsets',
    'listRowSeparator',
    'keyboardType',
    'textContentType',
    'textInputAutocapitalization',
    'disabled',
    'buttonStyle',
    'controlSize',
    'navigationBarTitleDisplayMode',
    'navigationTitle',
    'tint',
    'foregroundStyle',
    'pickerStyle',
    'tag',
  ];
  const mocks = {
    react: {
      useState: state,
      useRef: (initial) => state(() => ({ current: initial }))[0],
      useEffect: (callback) => effects.push(callback),
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': {
      View: 'View',
      Pressable: 'Pressable',
      ActivityIndicator: 'Spinner',
      Keyboard: { dismiss() {} },
      StyleSheet: { create: (value) => value },
    },
    'expo-router': { router: { replace: (href) => calls.push(['route', href]) } },
    '@expo/ui/swift-ui': nativeUI,
    '@expo/ui/swift-ui/modifiers': Object.fromEntries(
      modifiers.map((name) => [name, (...args) => ({ name, args })]),
    ),
    '@/theme/tokens': {
      useColors: () => ({ tint: '#FF5588', background: '#000000' }),
      useAppColorScheme: () => 'dark',
    },
    '@/services/haptics': { playHaptic() {} },
    '@/stores/auth': { useAuthStore: (selector) => selector(auth) },
    '@/services/synology/api': {
      SynologyError,
      normalizeAddress: (address, allowHttp) => {
        calls.push(['normalize', address, allowHttp]);
        return address;
      },
      discover: async (address) => {
        calls.push(['discover', address]);
        return discover(address);
      },
    },
    '@/components/scroll-edge-fade': { ScrollEdgeFade: 'LegacyScroll' },
    '@/components/text-input': { TextInput: 'LegacyInput' },
    '@/components/text': { Text: 'LegacyText' },
    'react-native-keyboard-controller': { KeyboardAwareScrollView: 'LegacyKeyboardScroll' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 34 }) },
    'expo-linear-gradient': { LinearGradient: 'LegacyGradient' },
    '@expo/vector-icons/Ionicons': { __esModule: true, default: 'LegacyIcon' },
  };
  const cache = new Map();
  const Screen = loadSource('src/app/connect.tsx', mocks, {}, cache, platform).default;
  const { useConnectForm } = loadSource(
    'src/features/connection/use-connect-form.ts',
    mocks,
    {},
    cache,
    platform,
  );
  function expand(tree) {
    if (Array.isArray(tree)) {
      return tree.map(expand);
    }
    if (!tree || typeof tree !== 'object') {
      return tree;
    }
    if (typeof tree.type === 'function') {
      return expand(tree.type(tree.props));
    }
    return {
      ...tree,
      props: {
        ...tree.props,
        children: expand(tree.props?.children),
        footer: expand(tree.props?.footer),
      },
    };
  }
  let form;
  return {
    calls,
    SynologyError,
    setLogin: (next) => {
      login = next;
    },
    setDiscover: (next) => {
      discover = next;
    },
    render: () => {
      cursor = 0;
      const tree = expand(Screen());
      for (const effect of effects.splice(0)) {
        effect();
      }
      return tree;
    },
    form: () => {
      // The iOS screen calls this hook before any field-local hooks.
      cursor = 0;
      form = useConnectForm();
      return form;
    },
  };
}

function label(node) {
  return node.props.modifiers?.find((mod) => mod.name === 'accessibilityLabel')?.args[0];
}
const field = (tree, name) =>
  nodes(tree).find(
    (node) => ['SwiftTextField', 'SwiftSecureField'].includes(node.type) && label(node) === name,
  );
const button = (tree, name) =>
  nodes(tree).find(
    (node) => node.type === 'SwiftButton' && (node.props.label === name || label(node) === name),
  );
const blocked = (node) =>
  node.props.modifiers?.some((mod) => mod.name === 'disabled' && mod.args[0]);
function fill(env) {
  let tree = env.render();
  field(tree, '계정').props.onTextChange('fixture-user');
  tree = env.render();
  field(tree, '비밀번호').props.onTextChange('fixture-secret');
  return env.render();
}

async function main() {
  const env = runtime();
  let tree = env.render();
  assert.equal(tree.type, 'SwiftHost');
  assert(nodes(tree).some((node) => node.type === 'SwiftForm'));
  assert(nodes(tree).some((node) => node.type === 'SwiftNavigationStack'));
  assert(
    !nodes(tree).some((node) =>
      ['LegacyGradient', 'LegacyKeyboardScroll', 'LegacyInput'].includes(node.type),
    ),
  );
  assert.equal(field(tree, 'NAS 주소').props.text.get(), 'https://nas.example.test:5001');
  assert.equal(field(tree, '비밀번호').type, 'SwiftSecureField');
  assert(blocked(button(tree, '로그인')));
  assert(!nodes(tree).some((node) => node.type === 'SwiftToggle'));
  assert(!field(tree, '2단계 인증 코드'));
  assert.equal(tree.props.seedColor, '#FF5588');
  tree = fill(env);
  assert(!blocked(button(tree, '로그인')));
  let finish;
  env.setLogin(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = env.form().submit();
  await env.form().submit();
  tree = env.render();
  assert(blocked(button(tree, '로그인')));
  assert(blocked(button(tree, '연결 테스트')));
  assert(blocked(button(tree, '취소')));
  assert(nodes(tree).some((node) => node.type === 'SwiftProgressView'));
  env.form().cancel();
  assert.equal(env.calls.filter((call) => call[0] === 'route').length, 0);
  assert.equal(
    env.calls.filter((call) => call[0] === 'login').length,
    1,
    'Repeated taps issue one login request',
  );
  finish();
  await pending;
  tree = env.render();
  assert.equal(
    field(tree, '비밀번호').props.text.get(),
    '',
    'Successful login clears native secret state',
  );
  assert.deepEqual(env.calls.at(-1), ['route', '/(tabs)/(library)']);

  for (const code of [403, 406]) {
    const otp = runtime();
    fill(otp);
    otp.setLogin(async () => {
      throw new otp.SynologyError(code);
    });
    await otp.form().submit();
    tree = otp.render();
    const codeField = field(tree, '2단계 인증 코드');
    assert(codeField);
    assert(
      codeField.props.modifiers.some(
        (mod) => mod.name === 'keyboardType' && mod.args[0] === 'numeric',
      ),
    );
    assert(
      codeField.props.modifiers.some(
        (mod) => mod.name === 'textContentType' && mod.args[0] === 'oneTimeCode',
      ),
    );
    assert(blocked(button(tree, '로그인')));
    codeField.props.onTextChange('123456');
    otp.render();
    otp.setLogin(async () => {});
    await otp.form().submit();
    assert.equal(otp.calls.filter((call) => call[0] === 'login').at(-1)[4], '123456');
    assert.equal(field(otp.render(), '2단계 인증 코드').props.text.get(), '');
  }

  const http = runtime();
  tree = fill(http);
  field(tree, 'NAS 주소').props.onTextChange('http://nas.example.test:5000');
  tree = http.render();
  assert(blocked(button(tree, '로그인')));
  await http.form().submit();
  await http.form().testAddress();
  assert.equal(http.calls.length, 0, 'HTTP requires explicit consent before any request');
  nodes(tree)
    .find((node) => node.type === 'SwiftToggle')
    .props.onIsOnChange(true);
  tree = http.render();
  assert(!blocked(button(tree, '로그인')));
  await http.form().testAddress();
  assert(http.form().testResult.includes('확인 완료'));
  field(http.render(), 'NAS 주소').props.onTextChange('https://other.example.test');
  http.render();
  assert.equal(http.form().testResult, null);
  http.setLogin(async () => {
    throw Error('인증 실패');
  });
  await http.form().submit();
  assert.equal(http.form().error, '인증 실패');
  http.setDiscover(async () => {
    throw Error('연결 실패');
  });
  await http.form().testAddress();
  assert.equal(http.form().error, '연결 실패');

  const navigation = runtime();
  button(navigation.render(), '취소').props.onPress();
  assert.deepEqual(navigation.calls.at(-1), ['route', '/(tabs)/(library)']);
  button(navigation.render(), '데모 둘러보기').props.onPress();
  assert.deepEqual(navigation.calls.slice(-2), [['demo'], ['route', '/(tabs)/(library)']]);
  const android = runtime('android');
  const legacy = android.render();
  assert(nodes(legacy).some((node) => node.type === 'LegacyGradient'));
  assert(nodes(legacy).some((node) => node.type === 'LegacyKeyboardScroll'));
  assert(!nodes(legacy).some((node) => node.type === 'SwiftForm'));
  console.log(
    'PASS: native login form, saved address, secure fields, accent, validation, single requests, busy states, HTTP consent, OTP challenges/autofill/secret clearing, failures, cancel/demo and Android presentation. Native rendering/network are mocked.',
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
