import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useStreamingPreferences } from '@/stores/streaming-preferences';
import { useAuthStore } from '@/stores/auth';
import { useColors } from '@/theme/tokens';
import type { StreamingQuality } from '@/types/music';

const options: { value: StreamingQuality; title: string; description: string }[] = [
  {
    value: 'original',
    title: '원본 · 무손실 유지',
    description:
      'NAS에 저장된 파일을 변환 없이 재생합니다. FLAC·ALAC 등 무손실 음원의 품질을 유지하며, MP3는 원본 MP3로 재생합니다.',
  },
  {
    value: 'mp3',
    title: 'MP3 변환',
    description:
      'NAS에서 MP3로 변환합니다. 큰 무손실 파일의 데이터 사용량을 줄일 수 있으며, 변환 음질은 NAS의 기본값을 사용합니다.',
  },
];
export function StreamingQualitySettings() {
  const colors = useColors();
  const preferences = useStreamingPreferences();
  const mode = useAuthStore((state) => state.mode);
  const load = preferences.load;
  useEffect(() => {
    void load();
  }, [load]);
  const disabled = !preferences.ready || preferences.loading || preferences.saving;
  return (
    <View>
      <Text style={[styles.section, { color: colors.muted }]}>스트리밍 음질</Text>
      <View
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.separator }]}
        accessibilityRole="radiogroup"
      >
        {options.map((option, index) => (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: preferences.quality === option.value, disabled }}
            disabled={disabled}
            onPress={() => {
              if (preferences.quality !== option.value) {
                void preferences.setQuality(option.value).catch(() => {});
              }
            }}
            style={[
              styles.option,
              index > 0 && {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: colors.separator,
              },
              { opacity: !preferences.ready || preferences.loading ? 0.6 : 1 },
            ]}
          >
            <View style={styles.copy}>
              <Text style={[styles.title, { color: disabled ? colors.muted : colors.text }]}>
                {option.title}
              </Text>
              <Text style={[styles.description, { color: colors.muted }]}>
                {option.description}
              </Text>
            </View>
            <Ionicons
              name={preferences.quality === option.value ? 'radio-button-on' : 'radio-button-off'}
              size={24}
              color={!disabled && preferences.quality === option.value ? colors.tint : colors.muted}
            />
          </Pressable>
        ))}
      </View>
      {preferences.loading && !preferences.ready && (
        <ActivityIndicator
          style={styles.progress}
          color={colors.tint}
          accessibilityLabel="음질 설정 불러오는 중"
        />
      )}
      {preferences.error && (
        <View style={styles.feedback}>
          <Text style={{ color: colors.tint }}>{preferences.error}</Text>
          <Pressable accessibilityRole="button" disabled={disabled} onPress={() => void load()}>
            <Text style={[styles.retry, { color: disabled ? colors.muted : colors.tint }]}>
              다시 불러오기
            </Text>
          </Pressable>
        </View>
      )}
      <Text style={[styles.helper, { color: colors.muted }]}>
        변경한 음질은 다음 곡을 불러올 때 적용됩니다. MP3 변환에는 NAS의 변환 지원이 필요하며,
        원본보다 음질이 높아지지는 않습니다. 변환 재생이 안 되면 원본으로 바꿔 주세요.
      </Text>
      {mode === 'mock' && (
        <Text style={[styles.helper, { color: colors.muted }]}>
          데모 음원에는 음질 변환이 적용되지 않습니다.
        </Text>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  section: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2, marginTop: 0, marginBottom: 12 },
  card: { borderWidth: 1, borderRadius: 15, overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', padding: 15, gap: 14, minHeight: 70 },
  copy: { flex: 1 },
  title: { fontSize: 16, fontWeight: '600' },
  description: { fontSize: 12, lineHeight: 18, marginTop: 6 },
  helper: { fontSize: 12, lineHeight: 18, marginTop: 10 },
  progress: { marginTop: 10 },
  feedback: { gap: 8, marginTop: 10 },
  retry: { fontWeight: '600', paddingVertical: 4 },
});
