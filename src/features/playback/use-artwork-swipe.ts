import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

export type ArtworkSwipeDirection = 'next' | 'previous';

export function useArtworkSwipe(
  artSize: number,
  ready: SharedValue<boolean>,
  closing: SharedValue<boolean>,
  onSwipe: (direction: ArtworkSwipeDirection) => Promise<void>,
  active = true,
) {
  const translationX = useSharedValue(0);
  const switching = useSharedValue(false);
  const mounted = useRef(true);
  const interactive = useRef(active);
  useEffect(() => {
    interactive.current = active;
    if (!active) {
      cancelAnimation(translationX);
      translationX.set(0);
    }
  }, [active, translationX]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelAnimation(translationX);
    };
  }, [translationX]);

  const changeTrack = useCallback(
    async (direction: ArtworkSwipeDirection) => {
      try {
        if (mounted.current && interactive.current && !closing.get()) {
          await onSwipe(direction);
        }
      } finally {
        switching.set(false);
      }
    },
    [closing, onSwipe, switching],
  );

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(active)
        .activeOffsetX([-12, 12])
        .failOffsetY([-16, 16])
        .onStart(() => {
          if (ready.get() && !closing.get() && !switching.get()) {
            cancelAnimation(translationX);
          }
        })
        .onUpdate((event) => {
          if (ready.get() && !closing.get() && !switching.get()) {
            translationX.set(event.translationX);
          }
        })
        .onEnd((event, success) => {
          if (!success || !active || !ready.get() || closing.get() || switching.get()) {
            return;
          }
          const distance = Math.abs(event.translationX);
          const threshold = Math.min(120, Math.max(60, artSize * 0.25));
          const flick =
            distance > 18 &&
            Math.abs(event.velocityX) > 750 &&
            event.translationX * event.velocityX > 0;
          if (distance >= threshold || flick) {
            switching.set(true);
            scheduleOnRN(changeTrack, event.translationX < 0 ? 'next' : 'previous');
          }
        })
        .onFinalize(() => {
          translationX.set(withTiming(0, { duration: 180 }));
        }),
    [active, artSize, changeTrack, closing, ready, switching, translationX],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translationX.get() }],
  }));
  return { gesture, animatedStyle };
}
