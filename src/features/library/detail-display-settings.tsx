import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '@/components/text';
import { AnimatedSwitch } from '@/components/animated-switch';
import { useLibraryDetailPreferences } from '@/stores/library-detail-preferences';
import { settingsMenuStyles } from '@/features/settings/settings-menu-layout';
import { useColors } from '@/theme/tokens';

export function DetailDisplaySettings() {
  const colors = useColors(), state = useLibraryDetailPreferences(), load = state.load;
  useEffect(() => { void load(); }, [load]);
  const disabled = !state.ready || state.loading || state.loadError;
  return <View>
    <View style={settingsMenuStyles.row}>
      <View style={settingsMenuStyles.icon}><Ionicons name="person-circle-outline" size={23} color={colors.tint} /></View>
      <View style={styles.copy}><Text style={[styles.title, { color: colors.text }]}>아티스트 사진 가져오기</Text><Text style={[styles.hint, { color: colors.muted }]}>아티스트 상세 화면을 열면 MusicBrainz·Wikidata·Wikimedia Commons와 연결된 공개 이미지에서 이름·별칭이 일치하는 사진을 찾습니다. 검색할 아티스트 이름이 전송됩니다. 사진이 없으면 기본 아이콘을 표시합니다.</Text></View>
      <AnimatedSwitch accessibilityLabel="아티스트 사진 가져오기" value={state.preferences.artistPhotos} disabled={disabled} busy={state.saving}
        onValueChange={value => { void state.setOption('artistPhotos', value).catch(() => {}); }} trackColor={{ false: colors.separator, true: colors.tint }} />
    </View>
    <View style={settingsMenuStyles.row}>
      <View style={settingsMenuStyles.icon}><Ionicons name="color-palette-outline" size={23} color={colors.tint} /></View>
      <View style={styles.copy}><Text style={[styles.title, { color: colors.text }]}>앨범아트 색상으로 상단 꾸미기</Text><Text style={[styles.hint, { color: colors.muted }]}>앨범 상세 화면의 전체 재생 버튼 위쪽을 표지 색상으로 꾸밉니다. 곡 목록을 위로 스크롤하면 상단을 덮습니다. 앨범아트를 숨기면 색상도 표시하지 않습니다.</Text></View>
      <AnimatedSwitch accessibilityLabel="앨범아트 색상으로 상단 꾸미기" value={state.preferences.albumColors} disabled={disabled} busy={state.saving}
        onValueChange={value => { void state.setOption('albumColors', value).catch(() => {}); }} trackColor={{ false: colors.separator, true: colors.tint }} />
    </View>
    {state.loading && <ActivityIndicator color={colors.tint} style={styles.feedback} />}
    {state.error && <View style={styles.feedback}><Text accessibilityRole="alert" style={{ color: colors.tint }}>{state.error}</Text>
      <Pressable accessibilityRole="button" disabled={state.loading || state.saving} onPress={() => void load(true)} style={styles.retry}><Text style={{ color: colors.tint }}>다시 불러오기</Text></Pressable>
    </View>}
  </View>;
}
const styles = StyleSheet.create({ copy: { flex: 1 }, title: { fontSize: 16, fontWeight: '600' }, hint: { fontSize: 12, lineHeight: 18, marginTop: 6 }, feedback: { padding: 15 }, retry: { minHeight: 44, justifyContent: 'center' } });
