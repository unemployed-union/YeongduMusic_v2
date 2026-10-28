import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { MarqueeText } from '@/components/marquee-text';
import { Text } from '@/components/text';
import { FavoriteButton } from '@/components/favorite-button';
import { LosslessBadge } from './lossless-badge';
import type { Song } from '@/types/music';
import { playerScreenStyles as styles } from './player-screen-styles';

type Props = {
  song: Song;
  artist: string;
  highlight: string;
  menu: 'playback' | 'details' | null;
  onOpenMenu(menu: 'playback' | 'details'): void;
};
export function PlayerSongDetails({ song, artist, highlight, menu, onOpenMenu }: Props) {
  return (
    <View style={{ paddingTop: 14, marginBottom: 5 }}>
      <View style={[styles.identity, { marginBottom: 0 }]}>
        <View style={{ flex: 1 }}>
          <MarqueeText
            key={song.id + song.title}
            text={song.title}
            style={styles.title}
            fadeEdges
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={artist + ' 메뉴 열기'}
            accessibilityState={{ expanded: menu === 'details' }}
            hitSlop={{ top: 6, bottom: 6 }}
            onPress={() => onOpenMenu('details')}
            style={styles.artistButton}
          >
            <Text numberOfLines={1} style={styles.artist}>
              {artist}
            </Text>
          </Pressable>
        </View>
        <FavoriteButton key={song.id} song={song} location="player" accentColor={highlight} dark />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="재생 메뉴 열기"
          accessibilityState={{ expanded: menu === 'playback' }}
          onPress={() => onOpenMenu('playback')}
          style={styles.menuButton}
        >
          <Ionicons name="ellipsis-horizontal-circle" size={26} color="#FFFFFFBB" />
        </Pressable>
      </View>
      <LosslessBadge color={styles.title.color} />
    </View>
  );
}
