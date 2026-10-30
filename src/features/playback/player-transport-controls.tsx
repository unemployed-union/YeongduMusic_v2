import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '@/components/text';
import { PlaybackGlyph } from '@/components/playback-glyph';
import { GlassBackdrop } from '@/components/glass-backdrop';
import { next, previous, togglePlayback } from '@/services/playback/controller';
import { playHaptic } from '@/services/haptics';
import type { RepeatMode } from '@/stores/playback';
interface Props {
  playing: boolean;
  buffering: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  colors: { accent: string; onAccent: string };
  glass: { enabled: boolean };
  onToggleShuffle(): void;
  onCycleRepeat(): void;
}
export function PlayerTransportControls({
  playing,
  buffering,
  shuffle,
  repeat,
  colors,
  glass,
  onToggleShuffle,
  onCycleRepeat,
}: Props) {
  const ios = Platform.OS === 'ios';
  let playbackIndicator: React.ReactNode;
  if (buffering) {
    playbackIndicator = (
      <ActivityIndicator color={ios || glass.enabled ? 'white' : colors.onAccent} />
    );
  } else if (ios) {
    playbackIndicator = <PlaybackGlyph playing={playing} color="white" size={40} />;
  } else {
    playbackIndicator = (
      <Ionicons
        name={playing ? 'pause' : 'play'}
        size={32}
        color={glass.enabled ? 'white' : colors.onAccent}
        style={[styles.playIcon, !playing && styles.playIconTriangle]}
      />
    );
  }
  return (
    <View style={styles.controls}>
      <Pressable
        accessibilityLabel="셔플"
        onPress={() => {
          playHaptic('selection');
          onToggleShuffle();
        }}
      >
        <Ionicons name="shuffle" size={24} color={shuffle ? colors.accent : '#FFFFFF88'} />
      </Pressable>
      <Pressable
        accessibilityLabel="이전 곡"
        onPress={() => {
          playHaptic('playback');
          void previous();
        }}
      >
        <Ionicons name="play-skip-back" size={30} color="white" />
      </Pressable>
      <Pressable
        accessibilityLabel={playing ? '일시정지' : '재생'}
        onPress={() => {
          playHaptic('playback');
          togglePlayback();
        }}
        style={[
          styles.playControl,
          { backgroundColor: ios || glass.enabled ? 'transparent' : colors.accent },
        ]}
      >
        {!ios && glass.enabled && (
          <GlassBackdrop
            dark
            interactive
            tintColor={colors.accent + '38'}
            style={{ borderRadius: 34 }}
          />
        )}
        {playbackIndicator}
      </Pressable>
      <Pressable
        accessibilityLabel="다음 곡"
        onPress={() => {
          playHaptic('playback');
          void next();
        }}
      >
        <Ionicons name="play-skip-forward" size={30} color="white" />
      </Pressable>
      <Pressable
        accessibilityLabel={`반복 ${repeat}`}
        onPress={() => {
          playHaptic('selection');
          onCycleRepeat();
        }}
      >
        <Ionicons
          name={repeat === 'one' ? 'repeat-outline' : 'repeat'}
          size={24}
          color={repeat === 'off' ? '#FFFFFF88' : colors.accent}
        />
        {repeat === 'one' && <Text style={[styles.repeatOne, { color: colors.accent }]}>1</Text>}
      </Pressable>
    </View>
  );
}
export const styles = StyleSheet.create({
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 30,
    paddingHorizontal: 4,
  },
  playControl: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    width: 36,
    height: 36,
    lineHeight: 36,
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  playIconTriangle: { transform: [{ translateX: 2 }] },
  repeatOne: {
    position: 'absolute',
    right: -3,
    bottom: -7,
    color: 'white',
    fontSize: 11,
    fontWeight: '900',
  },
});
