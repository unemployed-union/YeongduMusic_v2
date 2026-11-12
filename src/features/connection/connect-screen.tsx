import { ScrollEdgeFade } from '@/components/scroll-edge-fade';
import { useRef } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { TextInput, type TextInputHandle } from '@/components/text-input';
import { Text } from '@/components/text';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useConnectForm } from './use-connect-form';
import { useColors } from '@/theme/tokens';

export function ConnectScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const accountInput = useRef<TextInputHandle>(null);
  const passwordInput = useRef<TextInputHandle>(null);
  const otpInput = useRef<TextInputHandle>(null);
  const {
    address,
    setAddress,
    account,
    setAccount,
    password,
    setPassword,
    otp,
    setOtp,
    needsOtp,
    allowHttp,
    setAllowHttp,
    loading,
    error,
    notice,
    testResult,
    setTestResult,
    isHttp,
    disabled,
    submit,
    testAddress,
    cancel,
    enterDemo,
  } = useConnectForm();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollEdgeFade>
        <KeyboardAwareScrollView
          style={{ flex: 1 }}
          bottomOffset={16}
          contentContainerStyle={[
            styles.content,
            { paddingTop: 40 + insets.top, paddingBottom: 32 + insets.bottom },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <LinearGradient colors={['#E65B7C', '#613A80', '#182E5B']} style={styles.hero}>
            <Ionicons name="musical-notes" size={74} color="white" />
          </LinearGradient>
          <Text style={[styles.eyebrow, { color: colors.tint }]}>YOUR MUSIC, YOUR SPACE</Text>
          <Text style={[styles.title, { color: colors.text }]}>내 음악이 있는 곳으로.</Text>
          <Text style={[styles.intro, { color: colors.muted }]}>
            Synology Audio Station에 직접 연결해 언제 어디서나 음악을 들어보세요.
          </Text>
          <View style={styles.form}>
            <Text style={[styles.label, { color: colors.text }]}>NAS 주소</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="next"
              onSubmitEditing={() => accountInput.current?.focus()}
              value={address}
              onChangeText={(value) => {
                setAddress(value);
                setTestResult(null);
              }}
              placeholder="https://nas.example.com:5001"
              placeholderTextColor={colors.muted}
              style={[
                styles.input,
                {
                  color: colors.text,
                  backgroundColor: colors.surface,
                  borderColor: colors.separator,
                },
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
                  HTTP 연결 허용 · 계정과 음악 데이터가 암호화되지 않고 전송됩니다.
                </Text>
              </Pressable>
            )}
            <Text style={[styles.label, { color: colors.text }]}>계정</Text>
            <TextInput
              ref={accountInput}
              autoCapitalize="none"
              returnKeyType="next"
              onSubmitEditing={() => passwordInput.current?.focus()}
              value={account}
              onChangeText={setAccount}
              placeholder="사용자 이름"
              placeholderTextColor={colors.muted}
              style={[
                styles.input,
                {
                  color: colors.text,
                  backgroundColor: colors.surface,
                  borderColor: colors.separator,
                },
              ]}
            />
            <Text style={[styles.label, { color: colors.text }]}>비밀번호</Text>
            <TextInput
              ref={passwordInput}
              secureTextEntry
              returnKeyType={needsOtp ? 'next' : 'done'}
              onSubmitEditing={() => (needsOtp ? otpInput.current?.focus() : Keyboard.dismiss())}
              value={password}
              onChangeText={setPassword}
              placeholder="비밀번호"
              placeholderTextColor={colors.muted}
              style={[
                styles.input,
                {
                  color: colors.text,
                  backgroundColor: colors.surface,
                  borderColor: colors.separator,
                },
              ]}
            />
            {needsOtp && (
              <>
                <Text style={[styles.label, { color: colors.text }]}>2단계 인증 코드</Text>
                <TextInput
                  ref={otpInput}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  value={otp}
                  onChangeText={setOtp}
                  placeholder="인증 앱의 코드"
                  placeholderTextColor={colors.muted}
                  style={[
                    styles.input,
                    {
                      color: colors.text,
                      backgroundColor: colors.surface,
                      borderColor: colors.separator,
                    },
                  ]}
                />
              </>
            )}
            {!!(error || notice) && <Text style={styles.error}>{error || notice}</Text>}
            {!!testResult && (
              <Text style={[styles.feedback, { color: colors.tint }]}>{testResult}</Text>
            )}
            <Pressable
              disabled={loading || !address || (isHttp && !allowHttp)}
              onPress={() => void testAddress()}
              style={[
                styles.testButton,
                { borderColor: colors.separator, opacity: loading || !address ? 0.5 : 1 },
              ]}
            >
              <Text style={[styles.testText, { color: colors.tint }]}>연결 테스트</Text>
            </Pressable>
            <Pressable
              disabled={disabled}
              onPress={submit}
              style={[
                styles.button,
                { backgroundColor: colors.tint, opacity: disabled ? 0.55 : 1 },
              ]}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.buttonText}>NAS 연결</Text>
              )}
            </Pressable>
          </View>
          <Pressable onPress={enterDemo} style={styles.demo}>
            <Text style={[styles.demoText, { color: colors.tint }]}>먼저 데모 둘러보기</Text>
            <Ionicons name="arrow-forward" size={17} color={colors.tint} />
          </Pressable>
          <Pressable accessibilityRole="button" onPress={cancel} style={styles.demo}>
            <Text style={[styles.demoText, { color: colors.tint }]}>이 기기 음악 듣기</Text>
            <Ionicons name="phone-portrait-outline" size={17} color={colors.tint} />
          </Pressable>
          <Text style={[styles.note, { color: colors.muted }]}>
            HTTPS 연결을 권장합니다. 비밀번호는 기기에 저장하지 않습니다.
          </Text>
        </KeyboardAwareScrollView>
      </ScrollEdgeFade>
    </View>
  );
}
const styles = StyleSheet.create({
  content: { paddingHorizontal: 26, alignItems: 'stretch' },
  hero: {
    width: 112,
    height: 112,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 34,
    shadowColor: '#9C486D',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 9 },
  title: { fontSize: 31, fontWeight: '800', letterSpacing: -1.2 },
  intro: { fontSize: 15, lineHeight: 23, marginTop: 10, marginBottom: 29 },
  form: { gap: 8 },
  label: { fontSize: 13, fontWeight: '700', marginTop: 9 },
  input: { height: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 15, fontSize: 15 },
  httpRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingTop: 10 },
  httpText: { flex: 1, fontSize: 12, lineHeight: 18 },
  error: { color: '#DF3658', fontSize: 13, lineHeight: 19, marginTop: 7 },
  feedback: { fontSize: 13, lineHeight: 19, marginTop: 7 },
  testButton: {
    height: 44,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  testText: { fontSize: 14, fontWeight: '700' },
  button: {
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonText: { color: 'white', fontSize: 16, fontWeight: '800' },
  demo: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 6, padding: 19 },
  demoText: { fontSize: 15, fontWeight: '700' },
  note: { textAlign: 'center', fontSize: 12, lineHeight: 18, marginTop: 2 },
});
