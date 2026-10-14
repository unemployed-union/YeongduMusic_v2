import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { View, type FlatList, type FlatListProps, type LayoutChangeEvent } from 'react-native';
import { scrollTo, useAnimatedRef, useAnimatedScrollHandler, useReducedMotion, useSharedValue } from 'react-native-reanimated';
import { scheduleOnUI } from 'react-native-worklets';
import type { LyricLine } from '@/types/lyrics';

type CellProps = ComponentProps<NonNullable<FlatListProps<LyricLine>['CellRendererComponent']>>;
type CellLayout = { y: number; height: number };

/** Issue one native smooth-scroll command per measured destination. */
export function useLyricScroll(active: number, synced: boolean, layoutKey: unknown) {
  const list = useAnimatedRef<FlatList<LyricLine>>();
  const actual = useSharedValue(0), destination = useSharedValue(0);
  const moving = useSharedValue(false), allowed = useSharedValue(true);
  const reduceMotion = useReducedMotion();
  const cells = useRef(new Map<number, CellLayout>());
  const viewport = useRef(0), contentHeight = useRef(0);
  const target = useRef<number | null>(null), requested = useRef<number | null>(null);
  const frame = useRef<number | null>(null), retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempts = useRef(0);
  const [following, setFollowing] = useState(true);

  const cancelScroll = useCallback(() => {
    scheduleOnUI(() => {
      'worklet';
      if (moving.get()) scrollTo(list, 0, actual.get(), false);
      moving.set(false);
    });
  }, [actual, list, moving]);
  const moveTo = useCallback((offset: number, animated = true) => {
    scheduleOnUI((next: number, animate: boolean) => {
      'worklet';
      if (!allowed.get()) return;
      destination.set(next);
      moving.set(animate && Math.abs(next - actual.get()) > 0.5);
      // Let the platform animate, rather than dispatching a new instantaneous
      // scroll command every frame while text highlighting also animates.
      scrollTo(list, 0, next, animate);
    }, offset, animated && !reduceMotion);
  }, [actual, allowed, destination, list, moving, reduceMotion]);
  const onScroll = useAnimatedScrollHandler({
    onScroll: event => {
      actual.set(event.contentOffset.y);
      if (moving.get() && Math.abs(event.contentOffset.y - destination.get()) < 0.5) moving.set(false);
    },
    onBeginDrag: () => {
      // Stop before the JS gesture callback arrives; never fight the user's drag.
      // The native scroll view cancels its own animation when a drag begins.
      allowed.set(false); moving.set(false);
    },
    onMomentumEnd: () => { moving.set(false); },
  });
  const clearPending = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    if (retry.current !== null) clearTimeout(retry.current);
    frame.current = null; retry.current = null;
  }, []);
  const align = useCallback(() => {
    const index = target.current;
    if (index === null || viewport.current <= 0 || contentHeight.current <= 0) return;
    const cell = cells.current.get(index);
    if (!cell) {
      // A distant seek must first render the destination. Ordinary line changes
      // use measured cells, so they never pass through an estimated jump.
      if (retry.current === null && attempts.current < 3) {
        attempts.current++;
        cancelScroll();
        list.current?.scrollToIndex({ index, viewPosition: 0.25, animated: false });
      }
      return;
    }
    const offset = Math.min(Math.max(0, contentHeight.current - viewport.current),
      Math.max(0, cell.y - Math.max(0, viewport.current - cell.height) * 0.25));
    if (requested.current !== null && Math.abs(requested.current - offset) < 0.5) return;
    requested.current = offset;
    moveTo(offset);
  }, [cancelScroll, list, moveTo]);
  const queueAlign = useCallback(() => {
    if (target.current === null || frame.current !== null) return;
    frame.current = requestAnimationFrame(() => { frame.current = null; align(); });
  }, [align]);
  const CellRenderer = useCallback(function LyricCell({ index, children, style, onLayout, onFocusCapture }: CellProps) {
    return <View {...{ onFocusCapture }} style={style} onLayout={event => {
      onLayout?.(event); // Preserve FlatList's own measurements and virtualization.
      const { y, height } = event.nativeEvent.layout;
      const previous = cells.current.get(index);
      if (previous?.y === y && previous.height === height) return;
      cells.current.set(index, { y, height });
      queueAlign();
    }}>{children}</View>;
  }, [queueAlign]);
  const stopFollowing = useCallback(() => {
    target.current = null; requested.current = null;
    clearPending(); cancelScroll(); setFollowing(false);
  }, [cancelScroll, clearPending]);
  const resume = useCallback(() => setFollowing(true), []);
  useEffect(() => {
    scheduleOnUI((enabled: boolean) => {
      'worklet';
      allowed.set(enabled);
      if (!enabled && moving.get()) { scrollTo(list, 0, actual.get(), false); moving.set(false); }
    }, following);
  }, [actual, allowed, following, list, moving]);
  useEffect(() => {
    clearPending(); attempts.current = 0;
    target.current = synced && following && active >= 0 ? active : null;
    if (target.current !== null) queueAlign();
    else cancelScroll();
    return clearPending;
  }, [active, cancelScroll, clearPending, following, layoutKey, queueAlign, synced]);
  useEffect(() => () => { clearPending(); cancelScroll(); }, [cancelScroll, clearPending]);

  const onLayout = useCallback((event: LayoutChangeEvent) => { viewport.current = event.nativeEvent.layout.height; queueAlign(); }, [queueAlign]);
  const onContentSizeChange = useCallback((_width: number, height: number) => { contentHeight.current = height; queueAlign(); }, [queueAlign]);
  const onScrollToIndexFailed = useCallback(({ index, averageItemLength }: { index: number; averageItemLength: number }) => {
    if (target.current !== index || attempts.current >= 3) return;
    moveTo(Math.max(0, averageItemLength * index), false);
    if (retry.current !== null) clearTimeout(retry.current);
    retry.current = setTimeout(() => { retry.current = null; queueAlign(); }, 150);
  }, [moveTo, queueAlign]);
  return {
    listRef: list, following, resume, CellRenderer, onScroll, onScrollBeginDrag: stopFollowing,
    onLayout, onContentSizeChange, onScrollToIndexFailed,
  };
}
