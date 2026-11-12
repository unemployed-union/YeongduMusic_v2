import { Text } from '@/components/text';
import { TextInput } from '@/components/text-input';
import { useColors } from '@/theme/tokens';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { useSynologySettings } from './use-synology-settings';

export function SynologySettings() {
  const colors = useColors();
  const {
    mode,
    session,
    address,
    setAddress,
    allowHttp,
    setAllowHttp,
    busy,
    error,
    testResult,
    setTestResult,
    isHttp,
    validInput,
    testAddress,
    changeAddress,
    leave,
  } = useSynologySettings();
  return (
    <>
      <Text style={[styles.section, { color: colors.muted, marginTop: 0 }]}>연결</Text>
      <View
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.separator }]}
      >
        <View style={[styles.icon, { backgroundColor: colors.tint }]}>
          <Ionicons name="server-outline" size={23} color="white" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: colors.text }]}>
            {mode === 'mock' ? '데모 라이브러리' : 'Synology NAS'}
          </Text>
          <Text numberOfLines={1} style={[styles.detail, { color: colors.muted }]}>
            {session?.baseUrl ?? '연결 없이 UI 둘러보기'}
          </Text>
        </View>
        <Ionicons name="checkmark-circle" size={22} color={colors.tint} />
      </View>

      <Text style={[styles.label, { color: colors.text }]}>접속 주소</Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="done"
        onSubmitEditing={Keyboard.dismiss}
        value={address}
        onChangeText={(value) => {
          setAddress(value);
          setTestResult(null);
        }}
        placeholder="https://nas.example.com"
        placeholderTextColor={colors.muted}
        style={[
          styles.input,
          { backgroundColor: colors.surface, borderColor: colors.separator, color: colors.text },
        ]}
      />
      {isHttp && (
        <Pressable onPress={() => setAllowHttp(!allowHttp)} style={styles.httpRow}>
          <Ionicons
            name={allowHttp ? 'checkbox' : 'square-outline'}
            size={22}
            color={colors.tint}
          />
          <Text style={[styles.httpText, { color: colors.muted }]}>
            HTTP 연결 허용 · 비밀번호와 음악 데이터가 암호화되지 않습니다.
          </Text>
        </Pressable>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
      {testResult && <Text style={[styles.feedback, { color: colors.tint }]}>{testResult}</Text>}
      <Pressable
        disabled={busy || !validInput}
        onPress={() => void testAddress()}
        style={[
          styles.testButton,
          { borderColor: colors.separator, opacity: busy || !validInput ? 0.5 : 1 },
        ]}
      >
        <Text
          style={[styles.testText, { color: busy || !validInput ? colors.muted : colors.tint }]}
        >
          연결 테스트
        </Text>
      </Pressable>
      <Pressable
        disabled={busy || !validInput}
        onPress={() => void changeAddress()}
        style={[
          styles.changeButton,
          { backgroundColor: busy || !validInput ? colors.separator : colors.tint },
        ]}
      >
        {busy ? (
          <ActivityIndicator color={colors.muted} />
        ) : (
          <Text style={[styles.changeText, !validInput && { color: colors.muted }]}>
            주소 변경 후 다시 로그인
          </Text>
        )}
      </Pressable>
      <Text style={[styles.helper, { color: colors.muted }]}>
        주소를 바꾸면 현재 세션을 종료하고 새 주소에서 Synology 계정으로 다시 로그인합니다.
      </Text>

      <Pressable
        disabled={busy}
        style={[styles.action, { borderBottomColor: colors.separator }]}
        onPress={leave}
      >
        <Text style={[styles.actionText, { color: busy ? colors.muted : colors.tint }]}>
          {mode === 'mock' ? '데모 종료' : 'NAS 연결 해제'}
        </Text>
        <Ionicons name="chevron-forward" size={19} color={colors.muted} />
      </Pressable>
      <Text style={[styles.note, { color: colors.muted, marginTop: 24 }]}>
        보관함은 공용 music과 로그인한 계정의 개인 home/music을 함께 조회합니다. 음악은 선택한 NAS
        주소에서 직접 스트리밍됩니다. 메타데이터는 최근 조회 목록을 기기에 저장합니다. HTTPS
        인증서가 유효해야 연결할 수 있습니다.
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    fontSize: 12,
    textTransform: 'uppercase',
    fontWeight: '800',
    letterSpacing: 1.2,
    marginTop: 31,
    marginBottom: 12,
  },
  card: {
    borderWidth: 1,
    borderRadius: 15,
    padding: 14,
    flexDirection: 'row',
    gap: 13,
    alignItems: 'center',
  },
  icon: { width: 45, height: 45, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 16, fontWeight: '700' },
  detail: { fontSize: 12, marginTop: 3 },
  label: { fontSize: 14, fontWeight: '700', marginTop: 22, marginBottom: 8 },
  input: { height: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 15, fontSize: 15 },
  httpRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingTop: 10 },
  httpText: { flex: 1, fontSize: 12, lineHeight: 18 },
  error: { color: '#DF3658', fontSize: 13, lineHeight: 19, marginTop: 10 },
  feedback: { fontSize: 13, lineHeight: 19, marginTop: 10 },
  testButton: {
    height: 44,
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testText: { fontSize: 14, fontWeight: '700' },
  changeButton: {
    height: 50,
    marginTop: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeText: { color: 'white', fontSize: 15, fontWeight: '700' },
  helper: { fontSize: 12, lineHeight: 18, marginTop: 10 },
  action: {
    height: 57,
    marginTop: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionText: { fontSize: 16, fontWeight: '600' },
  note: { fontSize: 14, lineHeight: 22 },
});
