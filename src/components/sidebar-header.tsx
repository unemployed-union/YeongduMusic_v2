import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/theme/tokens';
import { playHaptic } from '@/services/haptics';

export function SidebarHeader() {
  const colors = useColors(), insets = useSafeAreaInsets();
  return <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
    <Pressable accessibilityRole="button" accessibilityLabel="뒤로 가기" onPress={() => {
      playHaptic('menu');
      if (router.canGoBack()) router.back();
      else router.navigate('/(tabs)/(library)');
    }} style={styles.back}><Ionicons name="chevron-back" size={25} color={colors.tint} /></Pressable>
  </View>;
}
const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 8, paddingBottom: 18 },
  back: { width: 40, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
