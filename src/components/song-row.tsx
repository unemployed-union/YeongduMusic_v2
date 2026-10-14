import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Artwork } from './artwork';
import { AddToPlaylistDialog } from '@/features/playlists/dialogs';
import { useColors } from '@/theme/tokens';
import type { Song } from '@/types/music';

export function SongRow({ song, onPress, index }: { song: Song; onPress: () => void; index?: number }) {
  const colors = useColors();
  const [adding, setAdding] = useState(false);
  return <View style={[styles.row, { borderBottomColor: colors.separator }]}><Pressable accessibilityRole="button" onPress={onPress} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
    {index === undefined ? <Artwork item={song} size={48} radius={7} /> : <Text style={[styles.index, { color: colors.muted }]}>{index + 1}</Text>}
    <View style={styles.text}><Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>{song.title}</Text><Text numberOfLines={1} style={[styles.subtitle, { color: colors.muted }]}>{song.artist} · {song.album}</Text></View>
    </Pressable><Pressable accessibilityRole="button" accessibilityLabel={`${song.title} 메뉴`} style={{ padding: 10 }} onPress={() => setAdding(true)}><Ionicons name="ellipsis-horizontal" size={21} color={colors.muted} /></Pressable>
    {adding && <AddToPlaylistDialog songs={[song]} allowEnqueue onClose={() => setAdding(false)} />}
  </View>;
}
const styles = StyleSheet.create({ row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 7 }, index: { width: 42, textAlign: 'center', fontSize: 15 }, text: { flex: 1, gap: 3 }, title: { fontSize: 16, fontWeight: '600' }, subtitle: { fontSize: 13 } });
