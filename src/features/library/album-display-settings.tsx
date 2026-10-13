import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AnimatedSwitch } from '@/components/animated-switch';
import { useLibraryPreferences } from '@/stores/library-preferences';
import { useColors } from '@/theme/tokens';
import { settingsMenuStyles } from '@/features/settings/settings-menu-layout';

export function AlbumDisplaySettings() {
  const colors = useColors();
  const preferences = useLibraryPreferences();
  const busy = !preferences.ready || preferences.loading || preferences.saving;
  return <View>
    <View style={styles.row}>
      <View style={styles.icon}><Ionicons name="albums-outline" size={23} color={busy ? colors.muted : colors.tint} /></View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: busy ? colors.muted : colors.text }]}>폴더를 앨범으로 표시</Text>
        <Text style={[styles.hint, { color: colors.muted }]}>NAS·Google Drive·로컬 음악의 앨범 태그가 없는 곡도 폴더명이나 기본 이름으로 표시합니다. 끄면 앨범 태그가 확인된 곡만 앨범 목록에 표시하며, 모든 곡은 노래 목록에서 계속 볼 수 있습니다.</Text>
        <Text style={[styles.hint, { color: colors.muted }]}>기존 NAS 목록은 보관함을 새로고침하면 앨범 태그를 정확하게 구분할 수 있습니다.</Text>
      </View>
      <AnimatedSwitch accessibilityLabel="폴더를 앨범으로 표시" value={preferences.includeFolderAlbums} disabled={busy}
        onValueChange={include => void preferences.setIncludeFolderAlbums(include)} trackColor={{ false: colors.separator, true: colors.tint }} />
    </View>
    {preferences.loading && <ActivityIndicator color={colors.tint} accessibilityLabel="앨범 표시 설정 불러오는 중" style={styles.feedback} />}
    {preferences.error && <View style={styles.feedback}>
      <Text accessibilityRole="alert" style={{ color: colors.tint }}>{preferences.error}</Text>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void preferences.load(true)} style={styles.retry}>
        <Text style={{ color: busy ? colors.muted : colors.tint, fontWeight: '700' }}>다시 불러오기</Text>
      </Pressable>
    </View>}
  </View>;
}
const styles = StyleSheet.create({
  row: settingsMenuStyles.row,
  icon: settingsMenuStyles.icon, copy: { flex: 1 },
  title: { fontSize: 16, fontWeight: '600' }, hint: { fontSize: 12, lineHeight: 18, marginTop: 6 },
  feedback: { paddingHorizontal: 15, paddingBottom: 15 }, retry: { minHeight: 44, justifyContent: 'center' },
});
