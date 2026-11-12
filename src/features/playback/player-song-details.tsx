import { Platform, Pressable, View, useWindowDimensions } from 'react-native';
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
  const ios = Platform.OS === 'ios';
  const { fontScale } = useWindowDimensions();
  const largeText = ios && fontScale >= 1.3;
  return (
    <View style={{ paddingTop: 14, marginBottom: 5 }}>
      <View style={[styles.identity, { marginBottom: 0 }]}>
        <View style={{ flex: 1 }}>
          {largeText ? (
            <Text numberOfLines={2} style={styles.title}>
              {song.title}
            </Text>
          ) : (
            <MarqueeText
              key={song.id + song.title}
              text={song.title}
              style={styles.title}
              fadeEdges
            />
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={artist + ' 메뉴 열기'}
            accessibilityState={{ expanded: menu === 'details' }}
            hitSlop={{ top: 10, bottom: 10 }}
            onPress={() => onOpenMenu('details')}
            style={[styles.artistButton, ios && { marginTop: 1 }]}
          >
            <Text numberOfLines={largeText ? 2 : 1} style={styles.artist}>
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
          style={[styles.menuButton, ios && styles.iosMenuButton]}
        >
          <Ionicons
            name={ios ? 'ellipsis-horizontal' : 'ellipsis-horizontal-circle'}
            size={26}
            color="#FFFFFFBB"
          />
        </Pressable>
      </View>
      <LosslessBadge color={styles.title.color} />
    </View>
  );
}
