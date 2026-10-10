import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Artwork } from './artwork';
import { enqueue } from '@/services/playback/controller';
import { useColors } from '@/theme/tokens';
import type { Song } from '@/types/music';

export function SongRow({ song, onPress, index }: { song: Song; onPress: () => void; index?: number }) {
  const colors = useColors();
  return <Pressable onPress={onPress} style={[styles.row, { borderBottomColor: colors.separator }]}>
    {index === undefined ? <Artwork item={song} size={48} radius={7} /> : <Text style={[styles.index, { color: colors.muted }]}>{index + 1}</Text>}
    <View style={styles.text}><Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>{song.title}</Text><Text numberOfLines={1} style={[styles.subtitle, { color: colors.muted }]}>{song.artist} · {song.album}</Text></View>
    <Pressable accessibilityLabel={`${song.title} 대기열에 추가`} hitSlop={10} onPress={() => void enqueue(song)}><Ionicons name="add-circle-outline" size={21} color={colors.muted} /></Pressable>
  </Pressable>;
}
const styles = StyleSheet.create({ row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 7 }, index: { width: 42, textAlign: 'center', fontSize: 15 }, text: { flex: 1, gap: 3 }, title: { fontSize: 16, fontWeight: '600' }, subtitle: { fontSize: 13 } });
