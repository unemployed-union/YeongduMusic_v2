import { useContext, useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from './text';
import { useAppColorScheme, useColors } from '@/theme/tokens';
import { playHaptic } from '@/services/haptics';
import { getActionMenuPosition, type ActionMenuAnchor } from './action-menu-position';
import { ScreenBlurTargetContext } from './screen-blur-target';
import { useBlurIntensity } from '@/stores/blur-preferences';
import { useLiquidGlass } from '@/theme/liquid-glass';
import { GlassBackdrop } from './glass-backdrop';

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

export function ActionMenu<T extends string>({ title, items, anchor, visible, onSelect, onClose, onDismiss, error }: {
  title: string; items: ActionMenuItem<T>[]; anchor: ActionMenuAnchor; visible: boolean; onSelect: (id: T) => void; onClose: () => void; onDismiss: () => void; error?: string | null;
}) {
  const colors = useColors(), insets = useSafeAreaInsets(), viewport = useWindowDimensions();
  const light = useAppColorScheme() === 'light';
  const glass = useLiquidGlass('libraryMenu');
  const blurIntensity = useBlurIntensity('libraryMenu'), blurEnabled = blurIntensity > 0 && !glass.reduceTransparency;
  const blurTarget = useContext(ScreenBlurTargetContext);
  const [cardHeight, setCardHeight] = useState(0);
  const position = getActionMenuPosition(anchor, viewport, insets, cardHeight);
  return <Modal transparent statusBarTranslucent navigationBarTranslucent visible={visible} animationType={glass.enabled ? 'none' : 'fade'} onRequestClose={onClose} onDismiss={onDismiss}>
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
      <Pressable accessibilityRole="button" accessibilityLabel="작업 메뉴 닫기" style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} />
      <View onLayout={event => setCardHeight(event.nativeEvent.layout.height)} pointerEvents={cardHeight ? 'auto' : 'none'}
        style={[styles.card, position, { backgroundColor: glass.enabled ? 'transparent' : blurEnabled ? light ? '#FFFFFF40' : '#00000040' : colors.surface, borderColor: colors.separator }, glass.supported && { borderRadius: 26, borderWidth: 0 }, glass.enabled ? !cardHeight && { transform: [{ translateX: viewport.width * 2 }] } : { opacity: cardHeight ? 1 : 0 }]}>
        {glass.enabled ? <GlassBackdrop style={{ borderRadius: 26 }} /> : <>
          {blurEnabled && <BlurView pointerEvents="none" blurTarget={blurTarget} blurMethod={blurTarget ? 'dimezisBlurView' : 'none'} intensity={blurIntensity} tint={light ? 'light' : 'dark'} style={StyleSheet.absoluteFill} />}
          {blurEnabled && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: light ? '#FFFFFFA6' : '#000000A6' }]} />}
        </>}
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
  card: { position: 'absolute', borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 18, elevation: 12 },
  content: { padding: 6 }, title: { fontSize: 13, fontWeight: '600', paddingHorizontal: 14, paddingVertical: 10 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12 },
  label: { flex: 1, fontSize: 15, fontWeight: '600' }, feedback: { padding: 14, fontSize: 13, lineHeight: 20 },
});
