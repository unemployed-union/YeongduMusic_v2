import { useCallback } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PresetManager } from '@/features/hidden-music/preset-manager';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import { useColors } from '@/theme/tokens';

export default function HiddenMusicScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { scope, profile, unlocked, busy, error, unlock, lock } = useHiddenMusicStore();
  useFocusEffect(useCallback(() => () => lock(), [lock]));
  if (!scope) return <View style={[styles.gate, { backgroundColor: colors.background }]}><Text style={[styles.title, { color: colors.text }]}>NAS 계정을 확인해 주세요</Text><Text style={[styles.note, { color: colors.muted }]}>계정별로 숨김 목록을 저장하려면 설정에서 연결을 해제하고 다시 로그인해 주세요.</Text></View>;
  if (profile.biometricLock && !unlocked) return <View style={[styles.gate, { backgroundColor: colors.background }]}>
    <Ionicons name="finger-print" size={64} color={colors.tint} />
    <Text style={[styles.title, { color: colors.text }]}>숨김 설정이 잠겨 있습니다</Text>
    <Text style={[styles.note, { color: colors.muted }]}>지문 또는 휴대전화에 설정된 PIN·암호·패턴으로 열어 주세요. 지문이 인식되지 않으면 시스템 인증 창에서 기기 암호를 사용할 수 있습니다. 음악 숨김은 계속 적용됩니다.</Text>
    {error && <Text style={[styles.note, { color: colors.tint }]}>{error}</Text>}
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void unlock()} style={[styles.button, { backgroundColor: colors.tint }]}>{busy ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>지문 · 기기 암호로 열기</Text>}</Pressable>
  </View>;
  return <KeyboardAvoidingView behavior="padding" style={[styles.screen, { backgroundColor: colors.background, paddingBottom: insets.bottom }]}><PresetManager /></KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, gate: { flex: 1, padding: 30, justifyContent: 'center', alignItems: 'center', gap: 18 },
  title: { fontSize: 23, fontWeight: '800', textAlign: 'center' }, note: { fontSize: 14, lineHeight: 22, textAlign: 'center' },
  button: { height: 50, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 13 }, buttonText: { color: 'white', fontSize: 15, fontWeight: '700' },
});
