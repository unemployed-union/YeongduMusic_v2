import type { RefObject } from 'react';
import { StyleSheet, View, type ViewInstance } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown, SlideInDown, useReducedMotion } from 'react-native-reanimated';
import { MiniPlayerContent } from './mini-player-content';
import { usePlaybackStore } from '@/stores/playback';
import { useAppColorScheme } from '@/theme/tokens';
import { useMiniPlayerColors } from '@/theme/use-player-colors';
import { useBlurIntensity } from '@/stores/blur-preferences';
import { usePlaybackVisibility } from '@/features/playback/use-playback-visibility';
import { useLiquidGlass } from '@/theme/liquid-glass';
import { GlassBackdrop } from './glass-backdrop';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const MINI_PLAYER_INSET = 8;

/** Standalone shell for Android, older iOS and the expanded iPad workspace. */
export function MiniPlayer({ blurTarget }: { blurTarget: RefObject<ViewInstance | null> }) {
  const song = usePlaybackStore((state) => state.queue[state.index]);
  const playing = usePlaybackStore((state) => state.playing);
  const buffering = usePlaybackStore((state) => state.buffering);
  const reduceMotion = useReducedMotion();
  const visible = usePlaybackVisibility();
  const colors = useMiniPlayerColors();
  const isDark = useAppColorScheme() === 'dark';
  const glass = useLiquidGlass('miniPlayer');
  const insets = useSafeAreaInsets();
  const blurIntensity = useBlurIntensity('miniPlayer');
  const blurEnabled = blurIntensity > 0 && !glass.reduceTransparency;
  if (!song) {
    return null;
  }
  let enteringAnimation: React.ComponentProps<typeof Animated.View>['entering'];
  if (reduceMotion) {
    enteringAnimation = undefined;
  } else if (glass.enabled) {
    enteringAnimation = SlideInDown.duration(250);
  } else {
    enteringAnimation = FadeInDown.duration(250);
  }
  let backgroundLayer: React.ReactNode;
  if (glass.enabled) {
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
    <Animated.View
      entering={enteringAnimation}
      style={[
        styles.shell,
        glass.supported && [glassShell, { left: insets.left + 12, right: insets.right + 12 }],
      ]}
    >
      {backgroundLayer}
      <MiniPlayerContent
        song={song}
        playing={playing}
        buffering={buffering}
        active={visible}
        colors={colors}
        glassSupported={glass.supported}
        glassEnabled={glass.enabled}
      />
      {/* Draw above the clipped background so the rounded stroke stays visible. */}
      {!glass.enabled && (
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
  );
}
const glassShell = { borderRadius: 24, borderWidth: 0 };

const styles = StyleSheet.create({
  shell: {
    position: 'absolute',
    bottom: 0,
    left: MINI_PLAYER_INSET,
    right: MINI_PLAYER_INSET,
    height: 64,
    borderRadius: 14,
    overflow: 'hidden',
  },
});
