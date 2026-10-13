import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { ScrollEdgeFade } from '@/components/scroll-edge-fade';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import { useColors } from '@/theme/tokens';
import { settingsMenuStyles } from './settings-menu-layout';

export function QuickHidePresetSettings() {
  const colors = useColors();
  const privacy = useHiddenMusicStore();
  async function select(id: string) {
    try { await privacy.setQuickHidePreset(id); }
    catch { /* The store exposes the saved error for retry. */ }
  }
  return <ScrollEdgeFade><FlatList style={styles.fill} data={privacy.profile.presets} extraData={privacy.profile.quickHidePresetId}
    keyExtractor={preset => preset.id} contentContainerStyle={styles.list}
    ListHeaderComponent={<View>
      <Text style={[styles.note, { color: colors.muted }]}>설정 버튼을 5번 눌렀을 때 적용할 프리셋을 하나 선택해 주세요. 선택 후 기타 설정에서 ‘특정 프리셋 숨기기’를 켜면 동작합니다. 선택만으로 음악이 숨겨지지는 않습니다.</Text>
      {privacy.error && <Text accessibilityRole="alert" style={[styles.note, { color: colors.tint }]}>{privacy.error}</Text>}
    </View>}
    ListEmptyComponent={<View>
      <Text style={[styles.note, { color: colors.muted }]}>저장된 프리셋이 없습니다. 음악 숨기기에서 프리셋을 먼저 만들어 주세요.</Text>
      <Pressable accessibilityRole="button" onPress={() => router.push('/hidden-music')} style={styles.create}><Text style={{ color: colors.tint }}>음악 숨기기 열기</Text></Pressable>
    </View>}
    renderItem={({ item }) => {
      const selected = privacy.profile.quickHidePresetId === item.id;
      return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected, disabled: privacy.busy }} disabled={privacy.busy}
        onPress={() => void select(item.id)} style={[settingsMenuStyles.row, styles.card, { backgroundColor: colors.surface, borderColor: selected && !privacy.busy ? colors.tint : colors.separator }]}>
        <View style={settingsMenuStyles.icon}><Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={23} color={selected && !privacy.busy ? colors.tint : colors.muted} /></View>
        <View style={styles.fill}><Text style={[styles.title, { color: privacy.busy ? colors.muted : colors.text }]}>{item.name}</Text><Text style={[styles.detail, { color: colors.muted }]}>폴더 {item.folders.length}개 · 곡 {item.songIds.length}개</Text></View>
      </Pressable>;
    }}
  /></ScrollEdgeFade>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 }, list: { flexGrow: 1, padding: 22, paddingTop: 24, paddingBottom: 32 },
  note: { fontSize: 13, lineHeight: 20, marginBottom: 18 }, card: { borderWidth: 1, borderRadius: 15, marginBottom: 12 },
  title: { fontSize: 16, fontWeight: '600' }, detail: { fontSize: 12, lineHeight: 18, marginTop: 5 }, create: { minHeight: 48, justifyContent: 'center' },
});
