import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { router } from 'expo-router';
import { Text } from './text';
import { Artwork } from './artwork';
import { PlaybackGlyph } from './playback-glyph';
import { MarqueeText } from './marquee-text';
import { next, togglePlayback } from '@/services/playback/controller';
import { usePlaybackStore } from '@/stores/playback';
import { usePlayerBackgroundStore } from '@/stores/player-background';
import { playHaptic } from '@/services/haptics';
import type { Song } from '@/types/music';
import type { useMiniPlayerColors } from '@/theme/use-player-colors';

export type MiniPlayerContentProps = {
  song: Song;
  playing: boolean;
  buffering: boolean;
  active: boolean;
  colors: ReturnType<typeof useMiniPlayerColors>;
  glassSupported: boolean;
  glassEnabled: boolean;
  embedded?: boolean;
  compact?: boolean;
  largeText?: boolean;
};

function openPlayer() {
  const state = usePlaybackStore.getState();
  const song = state.queue[state.index];
  if (!song) {
    return;
  }
  playHaptic('menu');
  usePlayerBackgroundStore.getState().selectArtwork(song, { immediate: true });
  router.push('/player');
}

/** Presentation and user actions only: no engine, timers, or playback subscriptions. */
export function MiniPlayerContent({
  song,
  playing,
  buffering,
  active,
  colors,
  glassSupported,
  glassEnabled,
  embedded = false,
  compact = false,
  largeText = false,
}: MiniPlayerContentProps) {
  let artworkSize = 45;
  if (compact) {
    artworkSize = 30;
  } else if (embedded) {
    artworkSize = 36;
  }
  const swipeUp = Gesture.Pan()
    .enabled(active)
    .activeOffsetY(-12)
    .failOffsetY(12)
    .failOffsetX([-24, 24])
    .runOnJS(true)
    .onEnd((event, success) => {
      if (
        success &&
        (event.translationY <= -40 || (event.translationY < -12 && event.velocityY < -650))
      ) {
        openPlayer();
      }
    });
  return (
    <GestureDetector gesture={swipeUp}>
      <View style={[styles.body, glassSupported && styles.glassBody, compact && styles.inlineBody]}>
        <Pressable
          style={styles.identity}
          accessibilityRole="button"
          accessibilityLabel={`${song.title}, ${song.artist}`}
          accessibilityHint="누르거나 위로 스와이프하면 전체 재생 화면이 열립니다"
          onPress={openPlayer}
        >
          <Artwork item={song} size={artworkSize} radius={glassSupported ? 10 : 7} />
          <View style={styles.text}>
            {embedded ? (
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={1.4}
                style={[styles.title, { color: colors.text }]}
              >
                {song.title}
              </Text>
            ) : (
              <MarqueeText
                key={song.id + song.title}
                text={song.title}
                active={active}
                style={[styles.title, { color: colors.text }]}
              />
            )}
            {!compact && !(embedded && largeText) && (
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={embedded ? 1.3 : undefined}
                style={[
                  styles.artist,
                  { color: glassSupported ? colors.muted : colors.chromeMuted },
                ]}
              >
                {song.artist}
              </Text>
            )}
          </View>
        </Pressable>
        <Pressable
          hitSlop={embedded ? undefined : 12}
          accessibilityRole="button"
          accessibilityLabel={playing ? '일시정지' : '재생'}
          accessibilityState={{ busy: buffering }}
          onPress={() => {
            playHaptic('playback');
            togglePlayback();
          }}
          style={[
            styles.control,
            { backgroundColor: glassEnabled ? colors.tint + '18' : colors.miniControl },
            glassSupported && styles.glassControl,
            embedded && styles.embeddedControl,
          ]}
        >
          {buffering ? (
            <ActivityIndicator color={embedded ? colors.text : colors.tint} />
          ) : (
            <PlaybackGlyph
              playing={playing}
              color={embedded ? colors.text : colors.tint}
              size={embedded ? 22 : 21}
            />
          )}
        </Pressable>
        {embedded && !compact && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="다음 곡"
            onPress={() => {
              playHaptic('playback');
              void next();
            }}
            style={[styles.control, styles.embeddedControl]}
          >
            <Ionicons name="play-skip-forward" size={22} color={colors.text} />
          </Pressable>
        )}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
    paddingRight: 13,
    gap: 10,
  },
  glassBody: { paddingLeft: 10, paddingRight: 10 },
  inlineBody: { paddingLeft: 6, paddingRight: 4, gap: 4 },
  identity: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'stretch',
  },
  text: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 14, fontWeight: '700' },
  artist: { fontSize: 12 },
  control: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassControl: { width: 44, height: 44, borderRadius: 22 },
  // UIKit fixes the accessory height. Keep each action 44pt wide without overflow.
  embeddedControl: {
    width: 44,
    height: 44,
    maxHeight: '100%',
    flexShrink: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
  },
});
