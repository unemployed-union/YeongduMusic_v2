import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { AnimatedSwitch as Switch } from '@/components/animated-switch';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useDisplayPreferences } from '@/stores/display-preferences';
import { openSystemEqualizer } from '@/services/playback/equalizer';
import { useColors } from '@/theme/tokens';
import {
  settingsMenuStyles,
  useSettingsMenuIconStyle,
} from '@/features/settings/settings-menu-layout';

export function PlaybackOptionsSettings() {
  const colors = useColors();
  const iconStyle = useSettingsMenuIconStyle(colors.tint);
  const preferences = useDisplayPreferences();
  const disabled = !preferences.ready || preferences.loading;
  const equalizerDisabled = Platform.OS !== 'android';
  return (
    <View>
      <Text style={[styles.section, { color: colors.muted }]}>화면 및 오디오</Text>
      <View
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.separator }]}
      >
        <View style={settingsMenuStyles.row}>
          <View style={iconStyle}>
            <Ionicons
              name="image-outline"
              size={23}
              color={disabled ? colors.muted : colors.tint}
            />
          </View>
          <View style={styles.copy}>
            <Text style={[styles.title, { color: disabled ? colors.muted : colors.text }]}>
              앨범아트 숨기기
            </Text>
            <Text style={[styles.hint, { color: colors.muted }]}>
              앱의 이미지를 기본 그래픽으로 바꾸고 배경 색상을 고정합니다.
            </Text>
          </View>
          <Switch
            accessibilityLabel="앨범아트 숨기기"
            value={preferences.hideArtwork}
            disabled={disabled}
            busy={preferences.saving}
            onValueChange={(hidden) => void preferences.setHideArtwork(hidden)}
            trackColor={{ false: colors.separator, true: colors.tint }}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: equalizerDisabled }}
          disabled={equalizerDisabled}
          onPress={() => void openSystemEqualizer()}
          style={[
            settingsMenuStyles.row,
            { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
          ]}
        >
          <View style={iconStyle}>
            <Ionicons
              name="options-outline"
              size={23}
              color={equalizerDisabled ? colors.muted : colors.tint}
            />
          </View>
          <View style={styles.copy}>
            <Text style={[styles.title, { color: equalizerDisabled ? colors.muted : colors.text }]}>
              시스템 이퀄라이저
            </Text>
            <Text style={[styles.hint, { color: colors.muted }]}>
              {Platform.OS === 'android'
                ? '기기에서 제공하는 음향 효과 · 음악 재생 중에 열어 주세요.'
                : '이 플랫폼에서는 시스템 이퀄라이저 바로 열기가 지원되지 않습니다.'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={19} color={colors.muted} />
        </Pressable>
      </View>
      {preferences.loading && (
        <ActivityIndicator
          color={colors.tint}
          style={styles.feedback}
          accessibilityLabel="앨범아트 설정 불러오는 중"
        />
      )}
      {preferences.error && (
        <View style={styles.feedback}>
          <Text style={{ color: colors.tint }}>{preferences.error}</Text>
          <Pressable
            disabled={preferences.loading || preferences.saving}
            onPress={() => void preferences.load(true)}
          >
            <Text
              style={{
                color: preferences.loading || preferences.saving ? colors.muted : colors.tint,
                fontWeight: '700',
                marginTop: 8,
              }}
            >
              다시 불러오기
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  section: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2, marginTop: 34, marginBottom: 12 },
  card: { borderWidth: 1, borderRadius: 15, overflow: 'hidden' },
  copy: { flex: 1 },
  title: { fontSize: 16, fontWeight: '600' },
  hint: { fontSize: 12, lineHeight: 18, marginTop: 6 },
  feedback: { marginTop: 10 },
});
