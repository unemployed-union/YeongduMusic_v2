import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '@/components/text';
import { useColors } from '@/theme/tokens';
import { useLocalMusicStore } from '@/stores/local-music';
import { musicSourceLabels } from '@/services/music-source';
import { playHaptic } from '@/services/haptics';
import { MENU_LABELS } from '@/features/settings/menu-layout';
import type { MusicSourceFilter } from '@/types/music';
import type { LibraryTab } from './library-page';
import { TabletSidebar } from '@/components/tablet-sidebar';

const icons = { albums: 'albums-outline', songs: 'musical-notes-outline', artists: 'person-outline', favorites: 'heart-outline' } as const;
const sourceIcons = { all: 'musical-notes-outline', nas: 'server-outline', local: 'phone-portrait-outline', drive: 'logo-google', s3: 'file-tray-stacked-outline', mybox: 'cloud-outline' } as const;

export function LibrarySidebar({ tabs, selected, width, onSelect }: { tabs: readonly LibraryTab[]; selected: LibraryTab; width: number; onSelect: (tab: LibraryTab) => void }) {
  const colors = useColors();
  const source = useLocalMusicStore(state => state.source), setSource = useLocalMusicStore(state => state.setSource);
  return <TabletSidebar active="library" width={width} showSettings={false}>
    <Text accessibilityRole="header" style={[styles.heading, { color: colors.muted }]}>둘러보기</Text>
    {tabs.map(tab => <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected: selected === tab }} onPress={() => { if (tab !== selected) { playHaptic('selection'); onSelect(tab); } }} style={({ pressed }) => [styles.item, { backgroundColor: selected === tab ? colors.tint + '18' : pressed ? colors.rowPressed : 'transparent' }]}>
      <Ionicons name={icons[tab]} size={22} color={selected === tab ? colors.tint : colors.muted} />
      <Text style={[styles.label, { color: selected === tab ? colors.tint : colors.text }]}>{MENU_LABELS[tab]}</Text>
    </Pressable>)}
    <View style={[styles.divider, { backgroundColor: colors.separator }]} />
    <Text accessibilityRole="header" style={[styles.heading, { color: colors.muted }]}>음악 소스</Text>
    {selected === 'favorites' ? <Text style={[styles.hint, { color: colors.muted }]}>모든 음악 소스의 좋아요한 곡을 표시합니다.</Text> : (Object.keys(musicSourceLabels) as MusicSourceFilter[]).map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: source === value }} onPress={() => { if (source !== value) { playHaptic('selection'); setSource(value); } }} style={({ pressed }) => [styles.item, { backgroundColor: source === value ? colors.rowSelected : pressed ? colors.rowPressed : 'transparent' }]}>
      <Ionicons name={sourceIcons[value]} size={19} color={source === value ? colors.tint : colors.muted} />
      <Text style={[styles.sourceLabel, { color: source === value ? colors.tint : colors.text }]}>{musicSourceLabels[value]}</Text>
    </Pressable>)}
  </TabletSidebar>;
}
const styles = StyleSheet.create({
  sidebar: { flexGrow: 0, flexShrink: 0, borderRightWidth: StyleSheet.hairlineWidth }, content: { paddingHorizontal: 14, paddingTop: 18, paddingBottom: 180 },
  heading: { fontSize: 12, fontWeight: '700', marginBottom: 12, paddingHorizontal: 12 },
  item: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12, marginBottom: 5 },
  label: { flex: 1, fontSize: 16, fontWeight: '700' }, sourceLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 22, marginHorizontal: 12 }, hint: { fontSize: 13, lineHeight: 21, paddingHorizontal: 12 },
});
