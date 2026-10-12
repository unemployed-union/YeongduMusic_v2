import { Keyboard, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@/theme/tokens';

export function SettingsButton() {
  const colors = useColors();
  return <Pressable accessibilityRole="button" accessibilityLabel="설정 열기" onPress={() => { Keyboard.dismiss(); router.push('/settings'); }} style={({ pressed }) => [styles.button, { opacity: pressed ? 0.55 : 1 }]}>
    <Ionicons name="settings-outline" size={25} color={colors.tint} />
  </Pressable>;
}
// Align the visible 25px icon with the header inset, retaining a 44px target.
const styles = StyleSheet.create({ button: { width: 44, height: 44, marginRight: -(44 - 25) / 2, alignItems: 'center', justifyContent: 'center' } });
