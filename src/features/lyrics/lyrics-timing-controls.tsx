import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { formatLyricOffset, LYRIC_OFFSET_STEP_MS, MAX_LYRIC_OFFSET_MS } from './timing';
import type { useLyricTiming } from './use-lyric-timing';

export function LyricsTimingControls({ timing }: { timing: ReturnType<typeof useLyricTiming> }) {
  const [expanded, setExpanded] = useState(false);
  const disabled = !timing.key || !timing.ready || timing.loading || timing.saving || timing.loadError;
  return <View style={styles.body}>
    <Pressable accessibilityRole="button" accessibilityLabel="가사 타이밍 조절" accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={[styles.button, styles.toggle]}>
      <Text style={styles.text}>가사 타이밍 · {formatLyricOffset(timing.offsetMs)} {expanded ? '⌃' : '⌄'}</Text>
    </Pressable>
    {expanded && <>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel="가사를 0.1초 앞당기기" disabled={disabled || timing.offsetMs <= -MAX_LYRIC_OFFSET_MS} onPress={() => void timing.adjust(-LYRIC_OFFSET_STEP_MS).catch(() => {})} style={[styles.button, (disabled || timing.offsetMs <= -MAX_LYRIC_OFFSET_MS) && styles.disabled]}><Text style={styles.text}>−0.1초 · 먼저</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="가사를 0.1초 늦추기" disabled={disabled || timing.offsetMs >= MAX_LYRIC_OFFSET_MS} onPress={() => void timing.adjust(LYRIC_OFFSET_STEP_MS).catch(() => {})} style={[styles.button, (disabled || timing.offsetMs >= MAX_LYRIC_OFFSET_MS) && styles.disabled]}><Text style={styles.text}>+0.1초 · 나중에</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="가사 타이밍 초기화" disabled={disabled || timing.offsetMs === 0} onPress={() => void timing.reset().catch(() => {})} style={[styles.button, (disabled || timing.offsetMs === 0) && styles.disabled]}><Text style={styles.text}>초기화</Text></Pressable>
      </View>
      <Text style={styles.notice}>가사가 늦으면 ‘먼저’, 빠르면 ‘나중에’를 누르세요. 곡과 가사 제공처별로 저장됩니다. (±30초)</Text>
      {timing.loading && <Text style={styles.notice}>가사 타이밍을 불러오는 중입니다.</Text>}
      {!timing.key && <Text style={styles.notice}>음악 저장소에 연결하면 타이밍을 저장할 수 있습니다.</Text>}
      {timing.loadError && <Pressable accessibilityRole="button" disabled={timing.loading} onPress={() => void timing.reload()} style={[styles.button, styles.toggle]}><Text style={styles.text}>타이밍 다시 불러오기</Text></Pressable>}
    </>}
    {timing.error && <Text accessibilityRole="alert" style={styles.error}>{timing.error}</Text>}
  </View>;
}
const styles = StyleSheet.create({
  body: { gap: 5, marginBottom: 7 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, toggle: { alignSelf: 'flex-start' },
  button: { minHeight: 36, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF18' },
  disabled: { opacity: 0.45 }, text: { color: 'white', fontSize: 12, fontWeight: '600' },
  notice: { color: '#FFFFFF99', fontSize: 11, lineHeight: 16 }, error: { color: '#FFE2E7', fontSize: 12, lineHeight: 18 },
});
