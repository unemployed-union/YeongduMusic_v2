import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useHiddenFeatureAccess } from '@/stores/hidden-feature-access';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import { useColors } from '@/theme/tokens';
import { SETTINGS_MENU_ICON_INSET, settingsMenuStyles } from './settings-menu-layout';
import { CreatorDialog } from './creator-dialog';

export function VersionSettings({ onToast }: { onToast: (message: string) => void }) {
  const colors = useColors();
  const { ready, busy, error, load, tapVersion, resetTaps } = useHiddenFeatureAccess();
  const [creatorOpen, setCreatorOpen] = useState(false);
  const creatorTaps = useRef({ count: 0, lastTap: 0 });
  useEffect(() => { void load(); }, [load]);
  useFocusEffect(useCallback(() => () => { resetTaps(); creatorTaps.current = { count: 0, lastTap: 0 }; setCreatorOpen(false); }, [resetTaps]));
  const configuredVersion: unknown = Constants.expoConfig?.extra?.buildVersion;
  const version = typeof configuredVersion === 'string' ? configuredVersion : Constants.expoConfig?.version ?? '알 수 없음';
  async function onPress() {
    const enabled = await tapVersion();
    if (enabled === null) return;
    if (!enabled) useHiddenMusicStore.getState().lock();
    onToast(enabled ? '숨김 설정 열림' : '숨김 설정 닫힘');
  }
  function tapCreator() {
    if (creatorOpen) return;
    const now = Date.now(), previous = creatorTaps.current;
    const count = now - previous.lastTap > 3000 ? 1 : previous.count + 1;
    creatorTaps.current = { count, lastTap: now };
    if (count === 7) { creatorTaps.current = { count: 0, lastTap: 0 }; setCreatorOpen(true); }
  }
  function closeCreator() { creatorTaps.current = { count: 0, lastTap: 0 }; setCreatorOpen(false); }
  return <View>
    <Pressable accessible={false} onPress={tapCreator} style={styles.row}>
      {/* Keep the icon's responder active while busy so its taps cannot reach the creator area. */}
      <Pressable accessibilityRole="button" accessibilityLabel={`버전 ${version} 아이콘`} accessibilityState={{ disabled: !ready || busy }} onPress={event => { event.stopPropagation(); if (ready && !busy) void onPress(); }} style={styles.icon}>
        <Ionicons name="information-circle-outline" size={23} color={!ready || busy ? colors.muted : colors.tint} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`버전 ${version}`} onPress={event => { event.stopPropagation(); tapCreator(); }} style={styles.copy}>
        <Text style={[styles.label, { color: !ready || busy ? colors.muted : colors.text }]}>버전</Text>
        <Text style={[styles.version, { color: colors.muted }]}>{version}</Text>
      </Pressable>
    </Pressable>
    {error && <Text accessibilityRole="alert" style={[styles.error, { color: colors.tint }]}>{error}</Text>}
    {creatorOpen && <CreatorDialog onClose={closeCreator} />}
  </View>;
}
const styles = StyleSheet.create({
  // Match the visible icon's inset (a 23px glyph centered in a 28px slot).
  row: { ...settingsMenuStyles.row, paddingRight: SETTINGS_MENU_ICON_INSET },
  icon: settingsMenuStyles.icon,
  copy: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 18, minHeight: 38 },
  label: { flex: 1, fontSize: 16, fontWeight: '600' }, version: { fontSize: 14, flexShrink: 1 }, error: { fontSize: 12, lineHeight: 18, paddingHorizontal: 15, paddingBottom: 15 },
});
