import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AnimatedSwitch } from '@/components/animated-switch';
import { useLibraryPreferences } from '@/stores/library-preferences';
import { useColors } from '@/theme/tokens';
import {
  settingsMenuStyles,
  useSettingsMenuIconStyle,
} from '@/features/settings/settings-menu-layout';

export function AlbumDisplaySettings() {
  const colors = useColors();
  const iconStyle = useSettingsMenuIconStyle(colors.tint);
  const preferences = useLibraryPreferences();
  const busy = !preferences.ready || preferences.loading || preferences.saving;
  const unavailable = !preferences.ready || preferences.loading;
  return (
    <View>
      <View
        style={[
          styles.row,
          { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
        ]}
      >
        <View style={iconStyle}>
          <Ionicons
            name="layers-outline"
            size={23}
            color={unavailable ? colors.muted : colors.tint}
          />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: unavailable ? colors.muted : colors.text }]}>
            앨범 제목만으로 묶기
          </Text>
          <Text style={[styles.hint, { color: colors.muted }]}>
            아티스트가 달라도 앨범 제목이 같으면 하나의 앨범으로 표시합니다. 끄면 제목과 아티스트를
            함께 구분합니다.
          </Text>
        </View>
        <AnimatedSwitch
          accessibilityLabel="앨범 제목만으로 묶기"
          value={preferences.groupAlbumsByTitle}
          disabled={unavailable}
          busy={preferences.saving}
          onValueChange={(enabled) => void preferences.setGroupAlbumsByTitle(enabled)}
          trackColor={{ false: colors.separator, true: colors.tint }}
        />
      </View>
      <View style={styles.row}>
        <View style={iconStyle}>
          <Ionicons
            name="albums-outline"
            size={23}
            color={unavailable ? colors.muted : colors.tint}
          />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: unavailable ? colors.muted : colors.text }]}>
            폴더를 앨범으로 표시
          </Text>
          <Text style={[styles.hint, { color: colors.muted }]}>
            NAS·Google Drive·로컬 음악의 앨범 태그가 없는 곡도 폴더명이나 기본 이름으로 표시합니다.
            끄면 앨범 태그가 확인된 곡만 앨범 목록에 표시하며, 모든 곡은 노래 목록에서 계속 볼 수
            있습니다.
          </Text>
          <Text style={[styles.hint, { color: colors.muted }]}>
            기존 NAS 목록은 보관함을 새로고침하면 앨범 태그를 정확하게 구분할 수 있습니다.
          </Text>
        </View>
        <AnimatedSwitch
          accessibilityLabel="폴더를 앨범으로 표시"
          value={preferences.includeFolderAlbums}
          disabled={unavailable}
          busy={preferences.saving}
          onValueChange={(include) => void preferences.setIncludeFolderAlbums(include)}
          trackColor={{ false: colors.separator, true: colors.tint }}
        />
      </View>
      {preferences.loading && (
        <ActivityIndicator
          color={colors.tint}
          accessibilityLabel="앨범 표시 설정 불러오는 중"
          style={styles.feedback}
        />
      )}
      {preferences.error && (
        <View style={styles.feedback}>
          <Text accessibilityRole="alert" style={{ color: colors.tint }}>
            {preferences.error}
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void preferences.load(true)}
            style={styles.retry}
          >
            <Text style={{ color: busy ? colors.muted : colors.tint, fontWeight: '700' }}>
              다시 불러오기
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  row: settingsMenuStyles.row,
  copy: { flex: 1 },
  title: { fontSize: 16, fontWeight: '600' },
  hint: { fontSize: 12, lineHeight: 18, marginTop: 6 },
  feedback: { paddingHorizontal: 15, paddingBottom: 15 },
  retry: { minHeight: 44, justifyContent: 'center' },
});
