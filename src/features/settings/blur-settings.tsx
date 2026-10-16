import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Slider from '@react-native-community/slider';
import { AnimatedSwitch } from '@/components/animated-switch';
import { Text } from '@/components/text';
import { useBlurPreferences } from '@/stores/blur-preferences';
import { useColors } from '@/theme/tokens';
import { settingsMenuStyles } from './settings-menu-layout';
import { BLUR_AREAS, BLUR_LABELS, type BlurArea } from './blur-preferences';

function BlurAreaSettings({ area }: { area: BlurArea }) {
  const colors = useColors(), state = useBlurPreferences(), option = state.areas[area];
  const [draft, setDraft] = useState<number | null>(null);
  const disabled = !state.ready || state.loading || state.loadError;
  const value = draft ?? option.intensity;
  return <View style={[styles.area, { borderTopColor: colors.separator }]}>
    <View style={styles.areaHeader}><Text style={[styles.title, { color: colors.text }]}>{BLUR_LABELS[area]}</Text>
      <AnimatedSwitch accessibilityLabel={`${BLUR_LABELS[area]} 블러`} value={option.enabled} disabled={disabled} busy={state.saving}
        onValueChange={enabled => { void state.setAreaEnabled(area, enabled).catch(() => {}); }} trackColor={{ false: colors.separator, true: colors.tint }} />
    </View>
    {area === 'playerMenu' && <Text style={[styles.hint, { color: colors.muted }]}>다크 모드의 재생 화면 메뉴에 적용됩니다.</Text>}
    <View style={styles.strengthLabel}><Text style={[styles.hint, { color: colors.muted }]}>블러 강도</Text><Text style={[styles.value, { color: colors.text }]}>{value}</Text></View>
    <View pointerEvents={state.saving ? 'none' : 'auto'}>
      <Slider accessibilityLabel={`${BLUR_LABELS[area]} 블러 강도`} accessibilityValue={{ min: 1, max: 100, now: value }}
        accessibilityState={{ disabled: disabled || state.saving }} minimumValue={1} maximumValue={100} step={1} value={value} disabled={disabled}
        minimumTrackTintColor={colors.tint} maximumTrackTintColor={colors.separator} thumbTintColor={colors.tint} style={styles.slider}
        onValueChange={next => { if (!disabled && !state.saving) setDraft(Math.round(next)); }}
        onSlidingComplete={next => {
          if (disabled || state.saving) { setDraft(null); return; }
          void state.setIntensity(area, Math.round(next)).catch(() => {}).finally(() => setDraft(null));
        }} />
    </View>
    <View style={styles.strengthLabel}><Text style={[styles.hint, { color: colors.muted }]}>약하게</Text><Text style={[styles.hint, { color: colors.muted }]}>강하게</Text></View>
  </View>;
}

export function BlurSettings() {
  const colors = useColors(), state = useBlurPreferences(), load = state.load;
  useEffect(() => { void load(); }, [load]);
  return <View>
    <View style={settingsMenuStyles.row}>
      <View style={settingsMenuStyles.icon}><Ionicons name="water-outline" size={23} color={colors.tint} /></View>
      <View style={styles.copy}><Text style={[styles.title, { color: colors.text }]}>블러 효과 전체</Text>
        <Text style={[styles.hint, { color: colors.muted }]}>전체를 꺼도 영역별 선택과 강도를 기억합니다. 꺼진 영역은 단색 배경을 사용합니다.</Text></View>
      <AnimatedSwitch accessibilityLabel="블러 효과 전체" value={state.enabled} disabled={!state.ready || state.loading || state.loadError} busy={state.saving}
        onValueChange={enabled => { void state.setEnabled(enabled).catch(() => {}); }} trackColor={{ false: colors.separator, true: colors.tint }} />
    </View>
    {BLUR_AREAS.map(area => <BlurAreaSettings key={area} area={area} />)}
    {state.loading && <ActivityIndicator color={colors.tint} style={styles.feedback} />}
    {state.error && <View style={styles.feedback}><Text accessibilityRole="alert" style={{ color: colors.tint }}>{state.error}</Text>
      {state.loadError && <Pressable accessibilityRole="button" disabled={state.loading || state.saving} onPress={() => void load(true)} style={styles.retry}><Text style={{ color: colors.tint }}>다시 불러오기</Text></Pressable>}
    </View>}
  </View>;
}
const styles = StyleSheet.create({ copy: { flex: 1 }, title: { fontSize: 16, fontWeight: '600' }, hint: { fontSize: 12, lineHeight: 18, marginTop: 6 },
  area: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, borderTopWidth: StyleSheet.hairlineWidth }, areaHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  strengthLabel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, value: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] }, slider: { height: 44, width: '100%' },
  feedback: { padding: 15 }, retry: { minHeight: 44, justifyContent: 'center' } });
