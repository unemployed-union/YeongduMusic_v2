import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AnimatedSwitch } from '@/components/animated-switch';
import { Text } from '@/components/text';
import { settingsMenuStyles, useSettingsMenuIconStyle } from '@/features/settings/settings-menu-layout';
import { useFavoriteDisplayPreferences } from '@/stores/favorite-display-preferences';
import { useColors } from '@/theme/tokens';
import type { FavoriteDisplayPreferences } from './display-preferences';

const options = [
  { key: 'enabled', title: '좋아요 버튼 전체 표시', hint: '전체 표시를 꺼도 화면별 선택과 좋아요한 곡은 유지됩니다.', icon: 'heart-outline' },
  { key: 'songs', title: '노래 목록', hint: '노래·아티스트·검색·플레이리스트 등 곡 목록의 좋아요 버튼', icon: 'musical-notes-outline' },
  { key: 'player', title: '재생 화면', hint: '재생 중인 곡 제목 옆의 좋아요 버튼', icon: 'play-circle-outline' },
  { key: 'album', title: '앨범', hint: '앨범 상세의 곡 목록에 있는 좋아요 버튼', icon: 'albums-outline' },
] as const satisfies readonly { key: keyof FavoriteDisplayPreferences; title: string; hint: string; icon: string }[];

export function FavoriteDisplaySettings() {
  const colors = useColors(), state = useFavoriteDisplayPreferences(), load = state.load;
  const iconStyle = useSettingsMenuIconStyle(colors.tint);
  useEffect(() => { void load(); }, [load]);
  const disabled = !state.ready || state.loading || state.loadError;
  return <View>
    {options.map(option => <View key={option.key} style={[settingsMenuStyles.row, option.key !== 'enabled' && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }]}>
      <View style={iconStyle}><Ionicons name={option.icon} size={23} color={colors.tint} /></View>
      <View style={styles.copy}><Text style={[styles.title, { color: colors.text }]}>{option.title}</Text><Text style={[styles.hint, { color: colors.muted }]}>{option.hint}</Text></View>
      <AnimatedSwitch accessibilityLabel={option.key === 'enabled' ? option.title : `${option.title} 좋아요 버튼 표시`} value={state.preferences[option.key]}
        disabled={disabled} busy={state.saving} trackColor={{ false: colors.separator, true: colors.tint }}
        onValueChange={value => { void state.setOption(option.key, value).catch(() => {}); }} />
    </View>)}
    {state.loading && <ActivityIndicator color={colors.tint} style={styles.feedback} />}
    {state.error && <View style={styles.feedback}><Text accessibilityRole="alert" style={{ color: colors.tint }}>{state.error}</Text>
      {state.loadError && <Pressable accessibilityRole="button" disabled={state.loading || state.saving} onPress={() => void load(true)} style={styles.retry}><Text style={{ color: colors.tint }}>다시 불러오기</Text></Pressable>}
    </View>}
  </View>;
}
const styles = StyleSheet.create({ copy: { flex: 1 }, title: { fontSize: 16, fontWeight: '600' }, hint: { fontSize: 12, lineHeight: 18, marginTop: 6 }, feedback: { padding: 15 }, retry: { minHeight: 44, justifyContent: 'center' } });
