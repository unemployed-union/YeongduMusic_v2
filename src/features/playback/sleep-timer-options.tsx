import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '@/components/text';
import Ionicons from '@expo/vector-icons/Ionicons';
import { cancelSleepTimer, startSleepTimer, stopAfterCurrentTrack } from '@/services/playback/controller';
import { usePlaybackStore, type SleepTimerStopMode } from '@/stores/playback';

const PRESETS = [5, 15, 30, 60, 90, 120] as const;
export function SleepTimerOptions({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  const timer = usePlaybackStore((state) => state.sleepTimer);
  const [minutes, setMinutes] = useState('30');
  const [stopMode, setStopMode] = useState<SleepTimerStopMode>(timer?.mode === 'time' ? timer.stopMode ?? 'immediate' : timer?.afterDeadline ? 'track-end' : 'immediate');
  const [error, setError] = useState<string | null>(null);
  function apply(action: () => void) {
    try { action(); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '타이머를 설정하지 못했습니다.'); }
  }
  function customTimer() {
    if (!/^\d+$/.test(minutes.trim())) { setError('시간을 분 단위 숫자로 입력해 주세요.'); return; }
    apply(() => startSleepTimer(Number(minutes), stopMode));
  }
  return <View>
    <Pressable accessibilityRole="button" accessibilityLabel="재생 메뉴로 돌아가기" onPress={onBack} style={styles.row}><Ionicons name="chevron-back" size={22} color="white" /><Text style={styles.heading}>수면 타이머</Text></Pressable>
    <Text style={styles.description}>종료 방식을 고른 뒤 시간을 선택하세요.</Text>
    <View accessibilityRole="radiogroup">
      {([{ value: 'immediate', label: '시간이 되면 즉시 정지' }, { value: 'track-end', label: '시간이 되면 현재 곡 끝까지' }] as const).map((option) => <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: stopMode === option.value }} onPress={() => setStopMode(option.value)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}><Ionicons name={stopMode === option.value ? 'radio-button-on' : 'radio-button-off'} size={21} color={stopMode === option.value ? '#FF9BAE' : '#FFFFFFA6'} /><Text style={styles.label}>{option.label}</Text></Pressable>)}
    </View>
    <Text style={styles.description}>{stopMode === 'immediate' ? '설정 시간이 지나면 재생을 바로 멈춥니다.' : '시간이 지나면 그때 재생 중인 곡을 마저 듣고 종료합니다. 이후 곡을 직접 넘겨도 다음 곡은 재생하지 않습니다.'}</Text>
    {PRESETS.map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: timer?.mode === 'time' && timer.minutes === value && (timer.stopMode ?? 'immediate') === stopMode }} onPress={() => apply(() => startSleepTimer(value, stopMode))} style={({ pressed }) => [styles.row, pressed && styles.pressed]}><Text style={styles.label}>{value}분 뒤 종료</Text>{timer?.mode === 'time' && timer.minutes === value && (timer.stopMode ?? 'immediate') === stopMode && <Ionicons name="checkmark" size={21} color="#FF9BAE" />}</Pressable>)}
    <View style={styles.custom}><TextInput accessibilityLabel="직접 입력할 타이머 시간 (분)" value={minutes} onChangeText={setMinutes} placeholder="분" placeholderTextColor="#FFFFFF80" keyboardType="number-pad" maxLength={4} onSubmitEditing={customTimer} style={styles.input} /><Text style={styles.unit}>분</Text><Pressable accessibilityRole="button" accessibilityLabel="입력한 시간으로 타이머 설정" onPress={customTimer} style={styles.apply}><Text style={styles.applyText}>설정</Text></Pressable></View>
    {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <Pressable accessibilityRole="button" accessibilityState={{ selected: timer?.mode === 'track' }} onPress={() => apply(stopAfterCurrentTrack)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}><Ionicons name="musical-note-outline" size={22} color="white" /><Text style={styles.label}>현재 곡 끝나면 종료</Text>{timer?.mode === 'track' && <Ionicons name="checkmark" size={21} color="#FF9BAE" />}</Pressable>
    <Text style={styles.description}>다음 곡과 반복 재생을 멈춥니다.{ '\n' }곡을 직접 바꾸면 이 설정은 해제됩니다.</Text>
    {!!timer && <Pressable accessibilityRole="button" onPress={() => apply(cancelSleepTimer)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}><Ionicons name="close-circle-outline" size={22} color="#FF9BAE" /><Text style={[styles.label, styles.cancel]}>타이머 해제</Text></Pressable>}
  </View>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12 },
  pressed: { backgroundColor: '#FFFFFF16' },
  heading: { color: 'white', fontSize: 17, fontWeight: '700' },
  label: { flex: 1, color: 'white', fontSize: 15, fontWeight: '600' },
  description: { color: '#FFFFFFA6', fontSize: 12, lineHeight: 18, paddingHorizontal: 14, marginBottom: 6 },
  custom: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8 },
  input: { flex: 1, minHeight: 44, borderWidth: StyleSheet.hairlineWidth, borderColor: '#FFFFFF55', borderRadius: 10, paddingHorizontal: 12, color: 'white', fontSize: 16 },
  unit: { color: '#FFFFFFB0', fontSize: 14 },
  apply: { minHeight: 44, paddingHorizontal: 16, borderRadius: 10, backgroundColor: '#FF9BAE25', justifyContent: 'center' },
  applyText: { color: '#FF9BAE', fontWeight: '700' },
  error: { color: '#FF9BAE', fontSize: 12, paddingHorizontal: 14, marginBottom: 8 },
  cancel: { color: '#FF9BAE' },
});
