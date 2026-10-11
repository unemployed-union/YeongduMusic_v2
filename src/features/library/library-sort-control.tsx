import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PlaylistSheet } from '@/features/playlists/dialogs';
import { useColors } from '@/theme/tokens';
import type { LibraryTab } from './library-page';
import type { LibrarySortOrder } from './sort-library';

const labels: Record<LibrarySortOrder, string> = { default: '기본', ascending: '오름차순', descending: '내림차순' };
const tabLabels: Record<LibraryTab, string> = { songs: '노래', albums: '앨범', artists: '아티스트' };
const orders: LibrarySortOrder[] = ['default', 'ascending', 'descending'];

export function LibrarySortControl({ tab, order, onChange }: { tab: LibraryTab; order: LibrarySortOrder; onChange: (order: LibrarySortOrder) => void }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={tabLabels[tab] + ' 정렬: ' + labels[order]} onPress={() => setOpen(true)} style={styles.trigger}>
      <Ionicons name="swap-vertical-outline" size={18} color={colors.tint} /><Text style={{ color: colors.tint, fontWeight: '700' }}>{labels[order]}</Text>
    </Pressable>
    <PlaylistSheet title={tabLabels[tab] + ' 정렬'} visible={open} onClose={() => setOpen(false)}>
      <View style={styles.body}>
        <Text style={{ color: colors.muted }}>{tab === 'artists' ? '아티스트 이름' : tab === 'albums' ? '앨범 제목' : '노래 제목'} 기준으로 정렬합니다.</Text>
        {orders.map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: order === value }} onPress={() => { onChange(value); setOpen(false); }} style={styles.option}>
          <Text style={{ flex: 1, color: colors.text, fontWeight: '600' }}>{labels[value]}</Text>{order === value && <Ionicons name="checkmark" size={22} color={colors.tint} />}
        </Pressable>)}
      </View>
    </PlaylistSheet>
  </>;
}
const styles = StyleSheet.create({ trigger: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40 }, body: { padding: 22, gap: 10 }, option: { minHeight: 48, flexDirection: 'row', alignItems: 'center' } });
