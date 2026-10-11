import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

export type PlayerMenuAction = 'lyrics' | 'queue' | 'add-song' | 'save-queue';
interface Props {
  panel: 'artwork' | 'queue' | 'lyrics';
  bottom: number;
  maxHeight: number;
  onClose: () => void;
  onSelect: (action: PlayerMenuAction) => void;
}

/** An inline popover lets playlist dialogs open without stacking native modals. */
export function PlayerMenu({ panel, bottom, maxHeight, onClose, onSelect }: Props) {
  const items: { action: PlayerMenuAction; label: string; icon: keyof typeof Ionicons.glyphMap; selected?: boolean }[] = [
    { action: 'lyrics', label: panel === 'lyrics' ? '가사 닫기' : '가사 보기', icon: 'chatbox-ellipses-outline', selected: panel === 'lyrics' },
    { action: 'queue', label: panel === 'queue' ? '앨범 아트 보기' : '대기열 보기', icon: 'list-outline', selected: panel === 'queue' },
    { action: 'add-song', label: '플레이리스트에 추가', icon: 'add-circle-outline' },
    { action: 'save-queue', label: '대기열을 플레이리스트로 저장', icon: 'save-outline' },
  ];
  return <View style={StyleSheet.absoluteFill} pointerEvents="box-none" accessibilityViewIsModal>
    <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} accessibilityRole="button" accessibilityLabel="재생 메뉴 닫기" onPress={onClose} />
    <View style={[styles.card, { bottom, maxHeight }]}>
      <ScrollView bounces={false} contentContainerStyle={styles.content}>
        {items.map(({ action, label, icon, selected }) => <Pressable key={action} accessibilityRole="button" accessibilityState={{ selected: !!selected }} onPress={() => onSelect(action)} style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
          <Ionicons name={icon} size={23} color={selected ? '#FF9BAE' : 'white'} />
          <Text style={[styles.label, selected && styles.selected]}>{label}</Text>
        </Pressable>)}
      </ScrollView>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: '#00000030' },
  card: { position: 'absolute', right: 29, width: 300, maxWidth: '85%', borderRadius: 18, backgroundColor: '#292431', borderWidth: StyleSheet.hairlineWidth, borderColor: '#FFFFFF30', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 18, elevation: 12 },
  content: { padding: 6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12 },
  pressed: { backgroundColor: '#FFFFFF16' },
  label: { flex: 1, color: 'white', fontSize: 15, fontWeight: '600' },
  selected: { color: '#FF9BAE' },
});
