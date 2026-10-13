import { useCallback, useEffect, useRef } from 'react';
import { Alert, Keyboard, Pressable, StyleSheet } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@/theme/tokens';
import { useHiddenFeatureAccess } from '@/stores/hidden-feature-access';
import { quickHide } from '@/features/hidden-music/quick-hide';

export const SETTINGS_TAP_GAP_MS = 400;

export function SettingsButton() {
  const colors = useColors();
  const access = useHiddenFeatureAccess();
  const load = access.load;
  const sequence = useRef({ taps: 0, timer: null as ReturnType<typeof setTimeout> | null, hiding: false });
  useEffect(() => { void load(); }, [load]);
  const reset = useCallback(() => {
    if (sequence.current.timer !== null) clearTimeout(sequence.current.timer);
    sequence.current.timer = null;
    sequence.current.taps = 0;
  }, []);
  useFocusEffect(useCallback(() => reset, [reset]));
  function onPress() {
    if (sequence.current.hiding) return;
    Keyboard.dismiss();
    if (!access.ready || !access.enabled || !access.quickHideEnabled) {
      reset(); router.push('/settings'); return;
    }
    if (sequence.current.timer !== null) clearTimeout(sequence.current.timer);
    sequence.current.taps++;
    if (sequence.current.taps >= 5) {
      reset(); sequence.current.hiding = true;
      void quickHide().catch((error: unknown) => {
        Alert.alert('설정', error instanceof Error ? error.message : '숨김 설정을 적용하지 못했습니다. 다시 시도해 주세요.');
      }).finally(() => { sequence.current.hiding = false; });
    } else {
      sequence.current.timer = setTimeout(() => { reset(); router.push('/settings'); }, SETTINGS_TAP_GAP_MS);
    }
  }
  return <Pressable accessibilityRole="button" accessibilityLabel="설정 열기" onPress={onPress} style={({ pressed }) => [styles.button, { opacity: pressed ? 0.55 : 1 }]}>
    <Ionicons name="settings-outline" size={25} color={colors.tint} />
  </Pressable>;
}
// Align the visible 25px icon with the header inset, retaining a 44px target.
const styles = StyleSheet.create({ button: { width: 44, height: 44, marginRight: -(44 - 25) / 2, alignItems: 'center', justifyContent: 'center' } });
