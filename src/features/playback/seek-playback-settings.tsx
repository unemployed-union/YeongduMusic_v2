import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '@/components/text';
import { AnimatedSwitch } from '@/components/animated-switch';
import { usePlaybackPreferences } from '@/stores/playback-preferences';
import { useColors } from '@/theme/tokens';
import { settingsMenuStyles, useSettingsMenuIconStyle } from '@/features/settings/settings-menu-layout';

export function SeekPlaybackSettings() {
  const colors = useColors(), iconStyle = useSettingsMenuIconStyle(colors.tint);
  const state = usePlaybackPreferences(), load = state.load;
  useEffect(() => { void load(); }, [load]);
  const disabled = !state.ready || state.loading || state.loadError;
  return <View>
    <View style={settingsMenuStyles.row}>
      <View style={iconStyle}><Ionicons name="play-outline" size={23} color={disabled ? colors.muted : colors.tint} /></View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: disabled ? colors.muted : colors.text }]}>탐색 후 자동 재생</Text>
        <Text style={[styles.hint, { color: colors.muted }]}>일시정지 중 재생 위치 막대를 조절하면 해당 위치에서 재생합니다.</Text>
      </View>
      <AnimatedSwitch accessibilityLabel="탐색 후 자동 재생" value={state.playOnSeek} disabled={disabled} busy={state.saving}
        onValueChange={enabled => { void state.setPlayOnSeek(enabled).catch(() => {}); }} trackColor={{ false: colors.separator, true: colors.tint }} />
    </View>
    {state.error && <View style={styles.feedback}>
      <Text accessibilityRole="alert" style={{ color: colors.tint }}>{state.error}</Text>
      {state.loadError && <Pressable accessibilityRole="button" disabled={state.loading || state.saving} onPress={() => void load(true)} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ color: colors.tint }}>다시 불러오기</Text>
      </Pressable>}
    </View>}
  </View>;
}
const styles = StyleSheet.create({ title: { fontSize: 16, fontWeight: '600' }, hint: { fontSize: 12, lineHeight: 18, marginTop: 6 }, feedback: { paddingHorizontal: 18, paddingBottom: 12 } });
