import type { RefObject } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown, SlideInDown } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { router } from 'expo-router';
import { Artwork } from './artwork';
import { PlaybackGlyph } from './playback-glyph';
import { MarqueeText } from './marquee-text';
import { togglePlayback } from '@/services/playback/controller';
import { usePlaybackStore } from '@/stores/playback';
import { usePlayerBackgroundStore } from '@/stores/player-background';
import { useAppColorScheme } from '@/theme/tokens';
import { useMiniPlayerColors } from '@/theme/use-player-colors';
import { playHaptic } from '@/services/haptics';
import { useBlurIntensity } from '@/stores/blur-preferences';
import { usePlaybackVisibility } from '@/features/playback/use-playback-visibility';
import { useLiquidGlass } from '@/theme/liquid-glass';
import { GlassBackdrop } from './glass-backdrop';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const MINI_PLAYER_INSET = 8;

function openPlayer() {
  playHaptic('menu');
  const state = usePlaybackStore.getState();
  const song = state.queue[state.index];
  if (song) {
    usePlayerBackgroundStore.getState().selectArtwork(song, { immediate: true });
  }
  router.push('/player');
}

export function MiniPlayer({
  blurTarget,
  embedded = false,
}: {
  blurTarget: RefObject<View | null>;
  embedded?: boolean;
}) {
  const song = usePlaybackStore((state) => state.queue[state.index]);
  const playing = usePlaybackStore((state) => state.playing);
  const visible = usePlaybackVisibility();
  const colors = useMiniPlayerColors();
  const isDark = useAppColorScheme() === 'dark';
  const glass = useLiquidGlass('miniPlayer');
  const insets = useSafeAreaInsets();
  const blurIntensity = useBlurIntensity('miniPlayer');
  const blurEnabled = blurIntensity > 0 && !glass.reduceTransparency;
  const swipeUp = Gesture.Pan()
    .enabled(visible)
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
  if (!song) {
    return null;
  }
  let enteringAnimation: React.ComponentProps<typeof Animated.View>['entering'];
  if (embedded) {
    enteringAnimation = undefined;
  } else if (glass.enabled) {
    enteringAnimation = SlideInDown.duration(250);
  } else {
    enteringAnimation = FadeInDown.duration(250);
  }
  let backgroundLayer: React.ReactNode;
  if (embedded) {
    backgroundLayer = null;
  } else if (glass.enabled) {
    backgroundLayer = <GlassBackdrop style={glassShell} />;
  } else {
    backgroundLayer = (
      <>
        {blurEnabled && (
          <BlurView
            pointerEvents="none"
            blurTarget={blurTarget}
            blurMethod="dimezisBlurView"
            intensity={blurIntensity}
            tint={isDark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
        )}
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: blurEnabled ? colors.mini : colors.surface },
          ]}
        />
      </>
    );
  }
  return (
    <GestureDetector gesture={swipeUp}>
      <Animated.View
        entering={enteringAnimation}
        style={[
          styles.shell,
          glass.supported && [glassShell, { left: insets.left + 12, right: insets.right + 12 }],
          embedded && {
            position: 'relative',
            left: 0,
            right: 0,
            height: '100%',
            borderRadius: 0,
            borderWidth: 0,
            backgroundColor: glass.enabled ? 'transparent' : colors.surface,
          },
        ]}
      >
        {backgroundLayer}
        <Pressable
          style={[styles.body, glass.supported && { paddingLeft: 10, paddingRight: 10 }]}
          onPress={openPlayer}
          accessibilityHint="누르거나 위로 스와이프하면 전체 재생 화면이 열립니다"
        >
          <Artwork item={song} size={embedded ? 36 : 45} radius={glass.supported ? 13 : 7} />
          <View style={styles.text}>
            <MarqueeText
              key={song.id + song.title}
              text={song.title}
              active={visible}
              style={[styles.title, { color: colors.text }]}
            />
            <Text
              numberOfLines={1}
              style={[
                styles.artist,
                { color: glass.supported ? colors.muted : colors.chromeMuted },
              ]}
            >
              {song.artist}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={playing ? '일시정지' : '재생'}
            hitSlop={12}
            onPress={() => {
              playHaptic('playback');
              togglePlayback();
            }}
            style={[
              styles.control,
              { backgroundColor: glass.enabled ? colors.tint + '18' : colors.miniControl },
              glass.supported && { width: 44, height: 44, borderRadius: 22 },
              embedded && styles.embeddedControl,
            ]}
          >
            <PlaybackGlyph
              playing={playing}
              color={embedded ? colors.text : colors.tint}
              size={embedded ? 22 : 21}
            />
          </Pressable>
        </Pressable>
        {/* Draw above the clipped background so the rounded stroke stays visible. */}
        {!embedded && !glass.enabled && (
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                borderRadius: glass.supported ? glassShell.borderRadius : styles.shell.borderRadius,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: colors.chromeBorder,
              },
            ]}
          />
        )}
      </Animated.View>
    </GestureDetector>
  );
}
const glassShell = { borderRadius: 24, borderWidth: 0 };

const styles = StyleSheet.create({
  // The UIKit accessory is shorter than the standalone 64pt player. Keep the
  // plain playback glyph inside it, independent of text scaling and baselines.
  embeddedControl: {
    width: 44,
    height: 40,
    maxHeight: '100%',
    flexShrink: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
  },
  shell: {
    position: 'absolute',
    bottom: 0,
    left: MINI_PLAYER_INSET,
    right: MINI_PLAYER_INSET,
    height: 64,
    borderRadius: 14,
    overflow: 'hidden',
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
    paddingRight: 13,
    gap: 10,
  },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 14, fontWeight: '700' },
  artist: { fontSize: 12 },
  control: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
