import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useLiquidGlass } from '@/theme/liquid-glass';

const ROW_PADDING = 15;
const ICON_SLOT_SIZE = 28;
const ICON_SIZE = 23;

export const SETTINGS_MENU_ICON_INSET = ROW_PADDING + (ICON_SLOT_SIZE - ICON_SIZE) / 2;
/** Match the main Settings menu's icon slot, label gap and row padding. */
export const settingsMenuStyles = StyleSheet.create({
  row: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 18, padding: ROW_PADDING },
  icon: {
    width: ICON_SLOT_SIZE,
    height: ICON_SLOT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTile: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/** Keep all settings icons consistent while preserving their older-platform layout. */
export function useSettingsMenuIconStyle(
  tintColor: string,
  legacyStyle: StyleProp<ViewStyle> = settingsMenuStyles.icon,
): StyleProp<ViewStyle> {
  const { supported } = useLiquidGlass();
  return supported
    ? [legacyStyle, settingsMenuStyles.iconTile, { backgroundColor: tintColor + '14' }]
    : legacyStyle;
}
