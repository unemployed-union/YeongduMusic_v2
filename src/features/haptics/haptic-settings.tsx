import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { AnimatedSwitch } from '@/components/animated-switch';
import { SettingsSection } from '@/features/settings/settings-ui';
import { useColors } from '@/theme/tokens';
import { useHapticPreferences } from '@/stores/haptic-preferences';
import { playHaptic } from '@/services/haptics';
import { HAPTIC_EVENTS, HAPTIC_STRENGTHS } from './preferences';

export function HapticSettings() {
  const colors = useColors(), state = useHapticPreferences(), load = state.load;
  useEffect(() => { void load(); }, [load]);
  const disabled = !state.ready || state.loading || state.saving || state.loadError;
  return <>
    <SettingsSection title="햅틱 피드백">
      <View style={styles.body}><View style={styles.row}>
        <View style={styles.copy}><Text style={[styles.title, { color: colors.text }]}>햅틱 피드백 사용</Text><Text style={[styles.note, { color: colors.muted }]}>전체 햅틱을 끄더라도 항목별 설정은 유지됩니다.</Text></View>
        <AnimatedSwitch haptics={false} accessibilityLabel="햅틱 피드백 사용" value={state.preferences.enabled} disabled={disabled} onValueChange={enabled => void state.setEnabled(enabled).catch(() => {})} />
      </View><Text style={[styles.note, { color: colors.muted }]}>강도는 약·중·강 중에서 선택합니다. 실제 느낌은 기기와 시스템 진동 설정에 따라 달라질 수 있습니다.</Text>
      {state.loading && <ActivityIndicator color={colors.tint} />}
      {state.error && <Text accessibilityRole="alert" style={{ color: colors.tint }}>{state.error}</Text>}
      {state.loadError && <Pressable accessibilityRole="button" disabled={state.loading} onPress={() => void load(true)} style={styles.retry}><Text style={{ color: colors.tint }}>햅틱 설정 다시 불러오기</Text></Pressable>}
      </View>
    </SettingsSection>
    {HAPTIC_EVENTS.map(event => {
      const preference = state.preferences.events[event.id], blocked = disabled || !state.preferences.enabled;
      return <SettingsSection key={event.id} title={event.title}><View style={styles.body}>
        <View style={styles.row}><View style={styles.copy}><Text style={[styles.title, { color: colors.text }]}>{event.title}</Text><Text style={[styles.note, { color: colors.muted }]}>{event.description}</Text></View>
          <AnimatedSwitch haptics={false} accessibilityLabel={`${event.title} 햅틱 사용`} value={preference.enabled} disabled={blocked} onValueChange={enabled => void state.setEvent(event.id, { enabled }).catch(() => {})} />
        </View>
        <View accessibilityRole="radiogroup" accessibilityLabel={`${event.title} 햅틱 강도`} style={styles.strengths}>{HAPTIC_STRENGTHS.map(strength => <Pressable key={strength.id} accessibilityRole="radio" accessibilityLabel={`${event.title} 햅틱 강도 ${strength.label}`} accessibilityState={{ checked: preference.strength === strength.id, disabled: blocked || !preference.enabled }} disabled={blocked || !preference.enabled}
          onPress={() => void state.setEvent(event.id, { strength: strength.id }).catch(() => {})} style={[styles.choice, { backgroundColor: preference.strength === strength.id ? colors.tint : colors.separator, opacity: blocked || !preference.enabled ? 0.45 : 1 }]}><Text style={{ color: preference.strength === strength.id ? 'white' : colors.text, fontWeight: '600' }}>{strength.label}</Text></Pressable>)}</View>
        <Pressable accessibilityRole="button" accessibilityLabel={`${event.title} 햅틱 테스트`} disabled={blocked || !preference.enabled} onPress={() => playHaptic(event.id)} style={[styles.test, { borderColor: colors.separator, opacity: blocked || !preference.enabled ? 0.45 : 1 }]}><Text style={{ color: colors.tint, fontWeight: '600' }}>테스트</Text></Pressable>
      </View></SettingsSection>;
    })}
  </>;
}
const styles = StyleSheet.create({
  body: { padding: 15, gap: 12 }, row: { flexDirection: 'row', alignItems: 'center', gap: 14 }, copy: { flex: 1, gap: 6 },
  title: { fontSize: 16, fontWeight: '600' }, note: { fontSize: 12, lineHeight: 19 }, strengths: { flexDirection: 'row', gap: 7 },
  choice: { flex: 1, minHeight: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  test: { alignSelf: 'flex-start', minHeight: 40, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1, justifyContent: 'center' }, retry: { minHeight: 44, justifyContent: 'center' },
});
