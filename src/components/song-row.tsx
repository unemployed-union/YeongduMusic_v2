import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Artwork } from './artwork';
import { SongProperties } from '@/features/library/song-properties';
import { useColors } from '@/theme/tokens';
import { playHaptic } from '@/services/haptics';
import type { Song } from '@/types/music';
import type { ActionMenuAnchor } from './action-menu-position';
import { FavoriteButton } from './favorite-button';
import type { FavoriteButtonLocation } from '@/features/favorites/display-preferences';

export function SongRow({ song, onPress, index, favoriteLocation = 'songs' }: { song: Song; onPress: () => void; index?: number; favoriteLocation?: Exclude<FavoriteButtonLocation, 'player'> }) {
  const colors = useColors();
  const [menuAnchor, setMenuAnchor] = useState<ActionMenuAnchor | null>(null);
  const [pressed, setPressed] = useState(false);
  const selected = menuAnchor !== null;
  return <View style={[styles.row, { borderBottomColor: colors.separator, backgroundColor: selected ? colors.rowSelected : pressed ? colors.rowPressed : 'transparent' }]}>
    {selected && <View pointerEvents="none" style={[styles.selectedIndicator, { backgroundColor: colors.tint }]} />}
    <Pressable accessibilityRole="button" accessibilityHint="길게 누르면 곡 작업 메뉴가 열립니다" accessibilityState={{ selected }} onPress={onPress}
      onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)}
      onLongPress={event => { playHaptic('longPress'); setMenuAnchor({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY }); }} delayLongPress={400} style={styles.touch}>
    {index === undefined ? <Artwork item={song} size={48} radius={7} /> : <Text style={[styles.index, { color: colors.muted }]}>{index + 1}</Text>}
    <View style={styles.text}><Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>{song.title}</Text><Text numberOfLines={1} style={[styles.subtitle, { color: colors.muted }]}>{song.artist} · {song.album}</Text></View>
    </Pressable><FavoriteButton song={song} location={favoriteLocation} /><Pressable accessibilityRole="button" accessibilityLabel={`${song.title} 메뉴`} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }} onPress={event => { playHaptic('menu'); setMenuAnchor({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY }); }}><Ionicons name="ellipsis-horizontal" size={21} color={colors.muted} /></Pressable>
    {menuAnchor && <SongProperties song={song} anchor={menuAnchor} onClose={() => { setMenuAnchor(null); setPressed(false); }} />}
  </View>;
}
const styles = StyleSheet.create({ row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 4, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 7, paddingHorizontal: 8, marginHorizontal: -8, borderRadius: 12 }, touch: { flex: 1, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 12 }, selectedIndicator: { position: 'absolute', left: 0, top: 12, bottom: 12, width: 3, borderRadius: 2 }, index: { width: 42, textAlign: 'center', fontSize: 15 }, text: { flex: 1, gap: 3 }, title: { fontSize: 16, fontWeight: '600' }, subtitle: { fontSize: 13 } });
