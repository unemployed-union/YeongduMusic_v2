import { FlatList, Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Artwork } from '@/components/artwork';
import { ScrollEdgeFade } from '@/components/scroll-edge-fade';
import { Text } from '@/components/text';
import type { Song } from '@/types/music';
import { playerScreenStyles as styles } from './player-screen-styles';

type Props = {
  queue: Song[];
  index: number;
  controlColors: { selected: string; accent: string };
  onSelect(index: number): void;
};
export function PlayerQueue({ queue, index, controlColors, onSelect }: Props) {
  return (
    <View style={styles.queue}>
      <Text style={styles.queueHeading}>다음 재생 · {queue.length}곡</Text>
      <ScrollEdgeFade tint="dark">
        <FlatList
          contentContainerStyle={styles.queueContent}
          data={queue}
          keyExtractor={(item, itemIndex) => `${item.id}-${itemIndex}`}
          renderItem={({ item, index: row }) => (
            <Pressable onPress={() => onSelect(row)} style={styles.queueRow}>
              <Artwork item={item} size={42} radius={6} />
              <View style={{ flex: 1 }}>
                <Text
                  numberOfLines={1}
                  style={[styles.queueTitle, row === index && { color: controlColors.selected }]}
                >
                  {item.title}
                </Text>
                <Text numberOfLines={1} style={styles.queueArtist}>
                  {item.artist}
                </Text>
              </View>
              {row === index && (
                <Ionicons name="volume-high" color={controlColors.accent} size={20} />
              )}
            </Pressable>
          )}
        />
      </ScrollEdgeFade>
    </View>
  );
}
