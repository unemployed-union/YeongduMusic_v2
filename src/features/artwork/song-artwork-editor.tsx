import { ScrollView, StyleSheet } from 'react-native';
import { ScrollEdgeFade } from '@/components/scroll-edge-fade';
import { Text } from '@/components/text';
import { useColors } from '@/theme/tokens';
import { ArtworkEditor } from './artwork-editor';
import type { Song } from '@/types/music';

export function SongArtworkEditor({
  song,
  onBusyChange,
}: {
  song: Song;
  onBusyChange: (busy: boolean) => void;
}) {
  const colors = useColors();
  return (
    <ScrollEdgeFade fill={false} backgroundColor={colors.surface}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.body}
      >
        <Text numberOfLines={2} style={[styles.title, { color: colors.text }]}>
          {song.title}
        </Text>
        <ArtworkEditor
          standalone
          song={song}
          album={song.album}
          artist={song.albumArtist || song.artist}
          disabled={false}
          onBusyChange={onBusyChange}
        />
      </ScrollView>
    </ScrollEdgeFade>
  );
}
const styles = StyleSheet.create({
  body: { padding: 22, paddingBottom: 28, gap: 16 },
  title: { fontSize: 16, fontWeight: '700' },
});
