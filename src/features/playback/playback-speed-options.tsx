import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '@/components/text';
import { AnimatedSwitch } from '@/components/animated-switch';
import { usePlaybackStore } from '@/stores/playback';
import { setPlaybackRate, setPreservePitch } from '@/services/playback/controller';
import { PLAYBACK_RATES } from '@/services/playback/playback-rate';

export function PlaybackSpeedOptions({ onBack }: { onBack: () => void }) {
  const rate = usePlaybackStore(state => state.playbackRate);
  const preservePitch = usePlaybackStore(state => state.preservePitch);
  const [error, setError] = useState<string | null>(null);
  function select(value: number) {
    try { setPlaybackRate(value); setError(null); }
    catch { setError('배속을 변경하지 못했습니다. 다시 선택해 주세요.'); }
  }
  function changePitch(preserve: boolean) {
    try { setPreservePitch(preserve); setError(null); }
    catch { setError('음높이 유지 옵션을 변경하지 못했습니다. 다시 시도해 주세요.'); }
  }
  return <View>
    <Pressable accessibilityRole="button" accessibilityLabel="재생 메뉴로 돌아가기" onPress={onBack} style={styles.row}><Ionicons name="chevron-back" size={22} color="white" /><Text style={styles.heading}>배속</Text></Pressable>
    <Text style={styles.description}>선택한 배속은 다음 곡에도 적용됩니다. 1배를 선택하면 원래 속도로 돌아갑니다.</Text>
    <View style={styles.row}>
      <Text style={styles.label}>음높이 유지</Text>
      <AnimatedSwitch accessibilityLabel="배속 변경 시 음높이 유지" value={preservePitch} onValueChange={changePitch} trackColor={{ false: '#FFFFFF33', true: '#FF9BAE' }} />
    </View>
    <Text style={styles.description}>{preservePitch ? '켜면 배속을 바꿔도 원래 음높이를 유지합니다.' : '끄면 빠르게 재생할수록 음높이가 올라가고, 느리게 재생할수록 내려갑니다.'}</Text>
    <View accessibilityRole="radiogroup">
      {PLAYBACK_RATES.map(value => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={`${value}배${value === 1 ? ' · 기본 속도' : ''}`} accessibilityState={{ checked: rate === value }} onPress={() => select(value)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        <Text style={[styles.label, rate === value && styles.selected]}>{value}배{value === 1 ? ' · 기본 속도' : ''}</Text>
        {rate === value && <Ionicons name="checkmark" size={22} color="#FF9BAE" />}
      </Pressable>)}
    </View>
    {error && <Text accessibilityRole="alert" style={[styles.description, styles.selected]}>{error}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12 },
  heading: { color: 'white', fontSize: 17, fontWeight: '700' }, label: { flex: 1, color: 'white', fontSize: 15, fontWeight: '600' },
  description: { color: '#FFFFFFA6', fontSize: 12, lineHeight: 18, paddingHorizontal: 14, marginBottom: 6 },
  selected: { color: '#FF9BAE' }, pressed: { backgroundColor: '#FFFFFF16' },
});
