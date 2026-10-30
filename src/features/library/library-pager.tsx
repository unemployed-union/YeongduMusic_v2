import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { usePlaybackVisibility } from '@/features/playback/use-playback-visibility';

type Props = {
  children: ReactNode;
  width: number;
  pageCount: number;
  pageIndex: number;
  layoutKey: string;
  onPageChange: (index: number) => void;
  onSwipeStart: () => void;
  onTouchStart?: ViewProps['onTouchStart'];
  onTouchMove?: ViewProps['onTouchMove'];
};

/** Only a deliberate horizontal pan can move the row; vertical lists scroll natively. */
export function LibraryPager({
  children,
  width,
  pageCount,
  pageIndex,
  layoutKey,
  onPageChange,
  onSwipeStart,
  onTouchStart,
  onTouchMove,
}: Props) {
  const visible = usePlaybackVisibility();
  const offset = useSharedValue(pageIndex * width);
  const start = useSharedValue(pageIndex * width);
  const committed = useSharedValue(pageIndex);
  const revision = useSharedValue(0);
  const gestureRevision = useSharedValue(0);
  const ended = useSharedValue(false);
  const geometry = useRef({ width, layoutKey });
  const mounted = useSharedValue(true);
  const publishPage = useCallback(
    (index: number) => {
      if (mounted.get()) {
        onPageChange(index);
      }
    },
    [mounted, onPageChange],
  );
  const publishStart = useCallback(() => {
    if (mounted.get()) {
      onSwipeStart();
    }
  }, [mounted, onSwipeStart]);
  useEffect(() => {
    const resized = geometry.current.width !== width || geometry.current.layoutKey !== layoutKey;
    geometry.current = { width, layoutKey };
    revision.set(revision.get() + 1);
    committed.set(pageIndex);
    cancelAnimation(offset);
    offset.set(
      resized || !visible ? pageIndex * width : withTiming(pageIndex * width, { duration: 180 }),
    );
  }, [visible, width, pageIndex, layoutKey, offset, committed, revision]);
  useEffect(() => {
    mounted.set(true);
    return () => {
      mounted.set(false);
      revision.set(revision.get() + 1);
      cancelAnimation(offset);
    };
  }, [offset, revision, mounted]);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(visible && pageCount > 1)
        .maxPointers(1)
        // Small sideways drift must not win before vertical list scrolling starts.
        .activeOffsetX([-18, 18])
        .failOffsetY([-8, 8])
        .onStart(() => {
          cancelAnimation(offset);
          start.set(offset.get());
          gestureRevision.set(revision.get());
          ended.set(false);
          scheduleOnRN(publishStart);
        })
        .onUpdate((event) => {
          if (gestureRevision.get() !== revision.get()) {
            return;
          }
          offset.set(
            Math.max(0, Math.min((pageCount - 1) * width, start.get() - event.translationX)),
          );
        })
        .onEnd((event, success) => {
          if (gestureRevision.get() !== revision.get()) {
            return;
          }
          ended.set(true);
          const distance = Math.abs(event.translationX);
          const flick =
            distance > 18 &&
            Math.abs(event.velocityX) > 700 &&
            event.translationX * event.velocityX > 0;
          const advance = success && (distance >= Math.min(100, width * 0.25) || flick);
          const base = success ? Math.round(start.get() / width) : committed.get();
          let pageDelta: number;
          if (advance) {
            if (event.translationX < 0) {
              pageDelta = 1;
            } else {
              pageDelta = -1;
            }
          } else {
            pageDelta = 0;
          }
          const next = Math.max(0, Math.min(pageCount - 1, base + pageDelta));
          const currentRevision = revision.get();
          offset.set(
            withTiming(next * width, { duration: 180 }, (finished) => {
              if (finished && currentRevision === revision.get()) {
                scheduleOnRN(publishPage, next);
              }
            }),
          );
        })
        .onFinalize(() => {
          if (!ended.get() && gestureRevision.get() === revision.get()) {
            offset.set(withTiming(committed.get() * width, { duration: 180 }));
          }
        }),
    [
      visible,
      pageCount,
      width,
      offset,
      start,
      committed,
      revision,
      gestureRevision,
      ended,
      publishStart,
      publishPage,
    ],
  );
  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -offset.get() }] }));

  return (
    <GestureDetector gesture={gesture}>
      <View
        collapsable={false}
        style={styles.viewport}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
      >
        <Animated.View style={[styles.row, { width: width * pageCount }, rowStyle]}>
          {children}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1, overflow: 'hidden' },
  row: { flex: 1, flexDirection: 'row', alignItems: 'stretch' },
});
