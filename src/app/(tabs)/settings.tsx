import { ScrollEdgeFade } from '@/components/scroll-edge-fade';
import { useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView, useKeyboardState } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { ScreenHeader } from '@/components/screen-header';
import { StreamingQualitySettings } from '@/features/playback/streaming-quality-settings';
import { discover, normalizeAddress } from '@/services/synology/api';
import { clearLibraryCache } from '@/services/synology/cache';
import { stopPlayback } from '@/services/playback/controller';
import { useAuthStore } from '@/stores/auth';
import { useColors } from '@/theme/tokens';

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const mode = useAuthStore((state) => state.mode);
  const session = useAuthStore((state) => state.session);
  const disconnect = useAuthStore((state) => state.disconnect);
  const [address, setAddress] = useState(session?.baseUrl ?? '');
  const [allowHttp, setAllowHttp] = useState(session?.baseUrl.startsWith('http://') ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const isHttp = address.trim().toLowerCase().startsWith('http://');
  const validInput = !!address.trim() && (!isHttp || allowHttp);

  const testAddress = async (): Promise<string | null> => {
    setBusy(true); setError(null); setTestResult(null);
    try {
      const normalized = normalizeAddress(address, allowHttp);
      const apis = await discover(normalized);
      setTestResult(`연결 확인 완료 · Audio Station API ${Object.keys(apis).filter((name) => name.startsWith('SYNO.AudioStation.')).length}개 발견`);
      return normalized;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'NAS 연결을 확인할 수 없습니다.');
      return null;
    } finally { setBusy(false); }
  };

  const changeAddress = async () => {
    const normalized = await testAddress();
    if (!normalized) return;
    if (normalized === session?.baseUrl) { Keyboard.dismiss(); return; }
    setBusy(true);
    try {
      stopPlayback();
      await disconnect(normalized);
      await clearLibraryCache();
      router.replace('/connect');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '접속 주소를 변경하지 못했습니다.'); }
    finally { setBusy(false); }
  };

  const leave = () => Alert.alert(mode === 'mock' ? '데모 종료' : 'NAS 연결 해제', '재생을 멈추고 연결 화면으로 돌아갑니다.', [
    { text: '취소', style: 'cancel' },
    { text: '계속', onPress: () => { void (async () => { setBusy(true); setError(null); try { stopPlayback(); await disconnect(); await clearLibraryCache(); router.replace('/connect'); } catch (cause) { setError(cause instanceof Error ? cause.message : '연결을 해제하지 못했습니다.'); } finally { setBusy(false); } })(); } },
  ]);

  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <ScreenHeader title="설정" />
    <ScrollEdgeFade><KeyboardAwareScrollView style={{ flex: 1 }} bottomOffset={16} contentContainerStyle={[styles.screen, { paddingBottom: keyboardVisible ? 24 : 170 + insets.bottom }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
    <Text style={[styles.section, { color: colors.muted, marginTop: 9 }]}>연결</Text>
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.separator }]}><View style={[styles.icon, { backgroundColor: colors.tint }]}><Ionicons name="server-outline" size={23} color="white" /></View><View style={{ flex: 1 }}><Text style={[styles.name, { color: colors.text }]}>{mode === 'mock' ? '데모 라이브러리' : 'Synology NAS'}</Text><Text numberOfLines={1} style={[styles.detail, { color: colors.muted }]}>{session?.baseUrl ?? '연결 없이 UI 둘러보기'}</Text></View><Ionicons name="checkmark-circle" size={22} color={colors.tint} /></View>

    <Text style={[styles.label, { color: colors.text }]}>접속 주소</Text>
    <TextInput autoCapitalize="none" autoCorrect={false} keyboardType="url" returnKeyType="done" onSubmitEditing={Keyboard.dismiss} value={address} onChangeText={(value) => { setAddress(value); setTestResult(null); }} placeholder="https://nas.example.com" placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.separator, color: colors.text }]} />
    {isHttp && <Pressable onPress={() => setAllowHttp(!allowHttp)} style={styles.httpRow}><Ionicons name={allowHttp ? 'checkbox' : 'square-outline'} size={22} color={colors.tint} /><Text style={[styles.httpText, { color: colors.muted }]}>HTTP 연결 허용 · 비밀번호와 음악 데이터가 암호화되지 않습니다.</Text></Pressable>}
    {error && <Text style={styles.error}>{error}</Text>}
    {testResult && <Text style={[styles.feedback, { color: colors.tint }]}>{testResult}</Text>}
    <Pressable disabled={busy || !validInput} onPress={() => void testAddress()} style={[styles.testButton, { borderColor: colors.separator, opacity: busy || !validInput ? 0.5 : 1 }]}><Text style={[styles.testText, { color: colors.tint }]}>연결 테스트</Text></Pressable>
    <Pressable disabled={busy || !validInput} onPress={() => void changeAddress()} style={[styles.changeButton, { backgroundColor: colors.tint, opacity: busy || !validInput ? 0.5 : 1 }]}>{busy ? <ActivityIndicator color="white" /> : <Text style={styles.changeText}>주소 변경 후 다시 로그인</Text>}</Pressable>
    <Text style={[styles.helper, { color: colors.muted }]}>주소를 바꾸면 현재 세션을 종료하고 새 주소에서 Synology 계정으로 다시 로그인합니다.</Text>

    <Pressable disabled={busy} style={[styles.action, { borderBottomColor: colors.separator }]} onPress={leave}><Text style={[styles.actionText, { color: colors.tint }]}>{mode === 'mock' ? '데모 종료' : 'NAS 연결 해제'}</Text><Ionicons name="chevron-forward" size={19} color={colors.muted} /></Pressable>
    <StreamingQualitySettings />
    <Text style={[styles.section, { color: colors.muted, marginTop: 34 }]}>보관함</Text>
    <Pressable accessibilityRole="button" onPress={() => router.push('/hidden-music')} style={[styles.action, { borderBottomColor: colors.separator, marginTop: 0 }]}><Ionicons name="eye-off-outline" size={23} color={colors.tint} /><Text style={[styles.actionText, { color: colors.text, flex: 1, marginLeft: 12 }]}>음악 숨기기</Text><Ionicons name="chevron-forward" size={19} color={colors.muted} /></Pressable>
    <Text style={[styles.helper, { color: colors.muted }]}>폴더·곡 선택 프리셋과 지문·기기 암호 잠금</Text>
    <Text style={[styles.section, { color: colors.muted, marginTop: 34 }]}>정보</Text>
    <Text style={[styles.note, { color: colors.muted }]}>보관함은 공용 music과 로그인한 계정의 개인 home/music을 함께 조회합니다. 음악은 선택한 NAS 주소에서 직접 스트리밍됩니다. 메타데이터는 최근 조회 목록을 기기에 저장합니다. HTTPS 인증서가 유효해야 연결할 수 있습니다.</Text>
    </KeyboardAwareScrollView></ScrollEdgeFade>
  </View>;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 22, paddingTop: 28 },
  section: { fontSize: 12, textTransform: 'uppercase', fontWeight: '800', letterSpacing: 1.2, marginTop: 31, marginBottom: 12 },
  card: { borderWidth: 1, borderRadius: 15, padding: 14, flexDirection: 'row', gap: 13, alignItems: 'center' },
  icon: { width: 45, height: 45, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 16, fontWeight: '700' },
  detail: { fontSize: 12, marginTop: 3 },
  label: { fontSize: 14, fontWeight: '700', marginTop: 22, marginBottom: 8 },
  input: { height: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 15, fontSize: 15 },
  httpRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingTop: 10 },
  httpText: { flex: 1, fontSize: 12, lineHeight: 18 },
  error: { color: '#DF3658', fontSize: 13, lineHeight: 19, marginTop: 10 },
  feedback: { fontSize: 13, lineHeight: 19, marginTop: 10 },
  testButton: { height: 44, marginTop: 14, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  testText: { fontSize: 14, fontWeight: '700' },
  changeButton: { height: 50, marginTop: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  changeText: { color: 'white', fontSize: 15, fontWeight: '700' },
  helper: { fontSize: 12, lineHeight: 18, marginTop: 10 },
  action: { height: 57, marginTop: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth },
  actionText: { fontSize: 16, fontWeight: '600' },
  note: { fontSize: 14, lineHeight: 22 },
});
