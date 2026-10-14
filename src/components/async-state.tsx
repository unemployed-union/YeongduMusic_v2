import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { useColors } from '@/theme/tokens';

export function AsyncState({ loading, error, retry, empty, children }: { loading?: boolean; error?: string | null; retry?: () => void; empty?: boolean; children: React.ReactNode }) {
  const colors = useColors();
  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.tint} /><Text style={[styles.message, { color: colors.muted }]}>가져오는 중...</Text></View>;
  if (error) return <View style={styles.center}><Text style={[styles.message, { color: colors.text }]}>{error}</Text><Pressable onPress={retry} style={[styles.retry, { backgroundColor: colors.tint }]}><Text style={styles.retryText}>다시 시도</Text></Pressable></View>;
  if (empty) return <View style={styles.center}><Text style={[styles.message, { color: colors.muted }]}>표시할 음악이 없습니다.</Text></View>;
  return <>{children}</>;
}
const styles = StyleSheet.create({ center: { flex: 1, minHeight: 220, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 }, message: { fontSize: 15, textAlign: 'center' }, retry: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12 }, retryText: { color: 'white', fontWeight: '700' } });
