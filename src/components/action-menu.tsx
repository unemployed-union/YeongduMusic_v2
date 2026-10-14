import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from './text';
import { useColors } from '@/theme/tokens';
import { playHaptic } from '@/services/haptics';

export type ActionMenuItem<T extends string> = { id: T; label: string; icon: keyof typeof Ionicons.glyphMap; disabled?: boolean };

// iOS must finish dismissing this native modal before presenting an editor sheet.
export function useMenuAction<T extends string>() {
  const [pending, setPending] = useState<T | null>(null), [action, setAction] = useState<T | null>(null);
  useEffect(() => {
    if (Platform.OS === 'ios' || pending === null) return;
    const timer = setTimeout(() => setAction(pending), 0);
    return () => clearTimeout(timer);
  }, [pending]);
  return { action, visible: pending === null, select: setPending, onDismiss: () => { if (pending) setAction(pending); } };
}

export function ActionMenu<T extends string>({ title, items, visible, onSelect, onClose, onDismiss, error }: {
  title: string; items: ActionMenuItem<T>[]; visible: boolean; onSelect: (id: T) => void; onClose: () => void; onDismiss: () => void; error?: string | null;
}) {
  const colors = useColors(), insets = useSafeAreaInsets(), { height } = useWindowDimensions();
  return <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose} onDismiss={onDismiss}>
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
      <Pressable accessibilityRole="button" accessibilityLabel="작업 메뉴 닫기" style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} />
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.separator, bottom: Math.max(insets.bottom + 88, 100), maxHeight: Math.max(120, height - insets.top - insets.bottom - 140) }]}>
        <ScrollView bounces={false} contentContainerStyle={styles.content}>
          <Text numberOfLines={2} style={[styles.title, { color: colors.muted }]}>{title}</Text>
          {items.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ disabled: !!item.disabled }} disabled={item.disabled}
            onPress={() => { if (!item.disabled) { playHaptic('selection'); onSelect(item.id); } }} style={({ pressed }) => [styles.item, { opacity: item.disabled ? 0.45 : 1 }, pressed && { backgroundColor: colors.separator }]}>
            <Ionicons name={item.icon} size={23} color={colors.text} /><Text style={[styles.label, { color: colors.text }]}>{item.label}</Text>
          </Pressable>)}
          {!!error && <Text accessibilityRole="alert" style={[styles.feedback, { color: colors.tint }]}>{error}</Text>}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { backgroundColor: '#00000030' },
  card: { position: 'absolute', right: 29, width: 300, maxWidth: '85%', borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 18, elevation: 12 },
  content: { padding: 6 }, title: { fontSize: 13, fontWeight: '600', paddingHorizontal: 14, paddingVertical: 10 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12 },
  label: { flex: 1, fontSize: 15, fontWeight: '600' }, feedback: { padding: 14, fontSize: 13, lineHeight: 20 },
});
