import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@/theme/tokens';
import {
  SETTINGS_MENU_ICON_INSET,
  settingsMenuStyles,
  useSettingsMenuIconStyle,
} from './settings-menu-layout';
import { CreatorDialog } from './creator-dialog';
import { useVersionSettings } from './use-version-settings';

export function VersionSettings({ onToast }: { onToast: (message: string) => void }) {
  const colors = useColors();
  const iconStyle = useSettingsMenuIconStyle(colors.tint);
  const { ready, busy, error, version, creatorOpen, activateVersion, tapCreator, closeCreator } =
    useVersionSettings(onToast);
  return (
    <View>
      <Pressable accessible={false} onPress={tapCreator} style={styles.row}>
        {/* Keep the icon's responder active while busy so its taps cannot reach the creator area. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`버전 ${version} 아이콘`}
          accessibilityState={{ disabled: !ready || busy }}
          onPress={(event) => {
            event.stopPropagation();
            if (ready && !busy) {
              void activateVersion();
            }
          }}
          style={iconStyle}
        >
          <Ionicons
            name="information-circle-outline"
            size={23}
            color={!ready || busy ? colors.muted : colors.tint}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`버전 ${version}`}
          onPress={(event) => {
            event.stopPropagation();
            tapCreator();
          }}
          style={styles.copy}
        >
          <Text style={[styles.label, { color: !ready || busy ? colors.muted : colors.text }]}>
            버전
          </Text>
          <Text style={[styles.version, { color: colors.muted }]}>{version}</Text>
        </Pressable>
      </Pressable>
      {error && (
        <Text accessibilityRole="alert" style={[styles.error, { color: colors.tint }]}>
          {error}
        </Text>
      )}
      {creatorOpen && <CreatorDialog onClose={closeCreator} />}
    </View>
  );
}
const styles = StyleSheet.create({
  // Preserve the legacy version value inset independently of the icon tile size.
  row: { ...settingsMenuStyles.row, paddingRight: SETTINGS_MENU_ICON_INSET },
  copy: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 18, minHeight: 38 },
  label: { flex: 1, fontSize: 16, fontWeight: '600' },
  version: { fontSize: 14, flexShrink: 1 },
  error: { fontSize: 12, lineHeight: 18, paddingHorizontal: 15, paddingBottom: 15 },
});
