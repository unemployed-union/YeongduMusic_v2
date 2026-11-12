import { AnimatedSwitch } from '@/components/animated-switch';
import { Text } from '@/components/text';
import {
  settingsMenuStyles,
  useSettingsMenuIconStyle,
} from '@/features/settings/settings-menu-layout';
import { useFavoriteDisplayPreferences } from '@/stores/favorite-display-preferences';
import { useColors } from '@/theme/tokens';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { FAVORITE_DISPLAY_OPTIONS as options } from './display-options';

export function FavoriteDisplaySettings() {
  const colors = useColors();
  const state = useFavoriteDisplayPreferences();
  const load = state.load;
  const iconStyle = useSettingsMenuIconStyle(colors.tint);
  useEffect(() => {
    void load();
  }, [load]);
  const disabled = !state.ready || state.loading || state.loadError;
  return (
    <View>
      {options.map((option) => (
        <View
          key={option.key}
          style={[
            settingsMenuStyles.row,
            option.key !== 'enabled' && {
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: colors.separator,
            },
          ]}
        >
          <View style={iconStyle}>
            <Ionicons name={option.icon} size={23} color={colors.tint} />
          </View>
          <View style={styles.copy}>
            <Text style={[styles.title, { color: colors.text }]}>{option.title}</Text>
            <Text style={[styles.hint, { color: colors.muted }]}>{option.hint}</Text>
          </View>
          <AnimatedSwitch
            accessibilityLabel={
              option.key === 'enabled' ? option.title : `${option.title} 좋아요 버튼 표시`
            }
            value={state.preferences[option.key]}
            disabled={disabled}
            busy={state.saving}
            trackColor={{ false: colors.separator, true: colors.tint }}
            onValueChange={(value) => {
              void state.setOption(option.key, value).catch(() => {});
            }}
          />
        </View>
      ))}
      {state.loading && <ActivityIndicator color={colors.tint} style={styles.feedback} />}
      {state.error && (
        <View style={styles.feedback}>
          <Text accessibilityRole="alert" style={{ color: colors.tint }}>
            {state.error}
          </Text>
          {state.loadError && (
            <Pressable
              accessibilityRole="button"
              disabled={state.loading || state.saving}
              onPress={() => void load(true)}
              style={styles.retry}
            >
              <Text style={{ color: colors.tint }}>다시 불러오기</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  copy: { flex: 1 },
  title: { fontSize: 16, fontWeight: '600' },
  hint: { fontSize: 12, lineHeight: 18, marginTop: 6 },
  feedback: { padding: 15 },
  retry: { minHeight: 44, justifyContent: 'center' },
});
