import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { useColors } from '@/theme/tokens';
import { useThemePreferences } from '@/stores/theme-preferences';
import type { ThemeMode } from '@/theme/mode';

const choices: { mode: ThemeMode; label: string }[] = [
  { mode: 'dark', label: '다크' }, { mode: 'light', label: '화이트' }, { mode: 'auto', label: '자동' },
];
export function ThemeSettings() {
  const colors = useColors(), preferences = useThemePreferences(), load = preferences.load;
  useEffect(() => { void load(); }, [load]);
  const disabled = !preferences.ready || preferences.loading || preferences.saving || preferences.loadError;
  return <View style={styles.body}>
    <View style={styles.choices}>{choices.map(({ mode, label }) => <Pressable key={mode} accessibilityRole="radio"
      accessibilityLabel={`${label} 화면 모드`} accessibilityState={{ checked: preferences.mode === mode, disabled }} disabled={disabled}
      onPress={() => void preferences.setMode(mode).catch(() => {})}
      style={[styles.choice, { backgroundColor: preferences.mode === mode ? colors.tint : colors.background,
        borderColor: preferences.mode === mode ? colors.tint : colors.separator, opacity: disabled ? 0.5 : 1 }]}>
      <Text style={{ color: preferences.mode === mode ? 'white' : colors.text, fontWeight: '700' }}>{label}</Text>
    </Pressable>)}</View>
    <Text style={[styles.note, { color: colors.muted }]}>자동은 기기의 화면 모드를 따릅니다. 다크·화이트는 앱에 고정 적용되며, 선택은 앱을 다시 열어도 유지됩니다.</Text>
    {preferences.saving && <ActivityIndicator color={colors.tint} accessibilityLabel="화면 모드 저장 중" />}
    {preferences.error && <Text accessibilityRole="alert" style={[styles.note, { color: colors.tint }]}>{preferences.error}</Text>}
    {preferences.loadError && <Pressable accessibilityRole="button" disabled={preferences.loading || preferences.saving} onPress={() => void load(true)} style={styles.retry}>
      <Text style={{ color: colors.tint }}>화면 모드 다시 불러오기</Text>
    </Pressable>}
  </View>;
}
const styles = StyleSheet.create({ body: { padding: 15, gap: 12 }, choices: { flexDirection: 'row', gap: 8 },
  choice: { flex: 1, minHeight: 36, borderRadius: 18, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  note: { fontSize: 12, lineHeight: 19 }, retry: { minHeight: 44, justifyContent: 'center' } });
