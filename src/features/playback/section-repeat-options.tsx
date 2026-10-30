import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { TextInput } from '@/components/text-input';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '@/components/text';
import { useColors } from '@/theme/tokens';
import { themedMenuStyles } from './menu-styles';
import { usePlaybackStore } from '@/stores/playback';
import {
  cancelSectionRepeat,
  setSectionRepeatEnd,
  setSectionRepeatStart,
  startSectionRepeat,
  toggleSectionRepeat,
} from '@/services/playback/controller';
import { parseSectionTime, sectionClock } from '@/services/playback/section-repeat';

export function SectionRepeatOptions({ onBack }: { onBack: () => void }) {
  const colors = useColors();
  const styles = themedMenuStyles(baseStyles, colors);
  const repeat = usePlaybackStore((state) => state.sectionRepeat);
  const position = usePlaybackStore((state) => state.position);
  const [startDraft, setStart] = useState<string | null>(null);
  const [endDraft, setEnd] = useState<string | null>(null);
  const start = startDraft ?? sectionClock(repeat?.start ?? 0);
  const end = endDraft ?? (repeat?.end != null ? sectionClock(repeat.end) : '');
  const [error, setError] = useState<string | null>(null);
  function apply(action: () => void) {
    try {
      action();
      setError(null);
      setStart(null);
      setEnd(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '구간을 설정하지 못했습니다.');
    }
  }
  let repeatStatus: string;
  if (repeat?.enabled) {
    repeatStatus = '구간 반복 중';
  } else if (repeat) {
    repeatStatus = '구간 반복 꺼짐';
  } else {
    repeatStatus = '설정한 구간이 없습니다.';
  }
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="재생 메뉴로 돌아가기"
        onPress={onBack}
        style={styles.row}
      >
        <Ionicons name="chevron-back" size={22} color={colors.text} />
        <Text style={styles.heading}>구간 반복</Text>
      </Pressable>
      <Text style={styles.description}>
        현재 위치: {sectionClock(position)}
        {'\n'}A와 B를 찍거나 시간을 입력하세요. B를 설정하면 반복이 시작됩니다.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => apply(() => setSectionRepeatStart())}
        style={styles.row}
      >
        <Text style={styles.label}>현재 위치를 시작점 A로 설정</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => apply(() => setSectionRepeatEnd())}
        style={styles.row}
      >
        <Text style={styles.label}>현재 위치를 종료점 B로 설정</Text>
      </Pressable>
      <View style={styles.fields}>
        <View style={styles.field}>
          <Text style={styles.description}>시작점 A</Text>
          <TextInput
            accessibilityLabel="구간 반복 시작점 A (분:초)"
            value={start}
            onChangeText={setStart}
            placeholder="0:00.0"
            placeholderTextColor={colors.muted}
            autoCorrect={false}
            maxLength={12}
            style={styles.input}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.description}>종료점 B</Text>
          <TextInput
            accessibilityLabel="구간 반복 종료점 B (분:초)"
            value={end}
            onChangeText={setEnd}
            placeholder="0:30.0"
            placeholderTextColor={colors.muted}
            autoCorrect={false}
            maxLength={12}
            style={styles.input}
          />
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          apply(() => startSectionRepeat(parseSectionTime(start), parseSectionTime(end)))
        }
        style={styles.row}
      >
        <Ionicons name="repeat" size={22} color={colors.tint} />
        <Text style={[styles.label, styles.accent]}>입력한 구간 반복</Text>
      </Pressable>
      {repeat?.end != null && (
        <Pressable
          accessibilityRole="button"
          onPress={() => apply(toggleSectionRepeat)}
          style={styles.row}
        >
          <Ionicons
            name={repeat.enabled ? 'pause-circle-outline' : 'play-circle-outline'}
            size={22}
            color={colors.text}
          />
          <Text style={styles.label}>
            {repeat.enabled ? '구간 반복 끄기' : '설정한 구간 반복 켜기'}
          </Text>
        </Pressable>
      )}
      {repeat && (
        <Pressable
          accessibilityRole="button"
          onPress={() => apply(cancelSectionRepeat)}
          style={styles.row}
        >
          <Ionicons name="close-circle-outline" size={22} color={colors.tint} />
          <Text style={[styles.label, styles.accent]}>구간 초기화</Text>
        </Pressable>
      )}
      {error && (
        <Text accessibilityRole="alert" style={[styles.description, styles.accent]}>
          {error}
        </Text>
      )}
      <Text style={styles.description}>
        {repeatStatus}
        {'\n'}곡을 바꾸면 구간이 초기화됩니다. 현재 곡 종료 수면 타이머는 구간 반복을 끄고 곡 끝까지
        재생합니다.
      </Text>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
  },
  heading: { color: 'white', fontSize: 17, fontWeight: '700' },
  label: { flex: 1, color: 'white', fontSize: 15, fontWeight: '600' },
  description: {
    color: '#FFFFFFA6',
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 14,
    marginBottom: 6,
  },
  fields: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 8 },
  field: { flex: 1 },
  input: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FFFFFF55',
    borderRadius: 10,
    paddingHorizontal: 10,
    color: 'white',
    fontSize: 16,
  },
  accent: { color: '#FF9BAE' },
});
