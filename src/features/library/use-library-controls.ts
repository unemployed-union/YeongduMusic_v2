import { useCallback, useEffect, useRef, useState } from 'react';
import type { GestureResponderEvent, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { LibraryTab } from './library-page';

/** Keep per-page offsets so a restored page does not immediately hide its controls. */
export function useLibraryControls() {
  const active = useRef<LibraryTab>('albums');
  const offsets = useRef<Record<LibraryTab, number>>({ albums: 0, songs: 0, artists: 0 });
  const viewports = useRef<Record<LibraryTab, number>>({ albums: 0, songs: 0, artists: 0 });
  const distance = useRef(0);
  const collapsed = useRef(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const revealingGesture = useRef(false);
  const [hidden, setHidden] = useState(false);
  const progress = useSharedValue(0);
  const height = useSharedValue(0);
  useEffect(() => () => cancelAnimation(progress), [progress]);

  const show = useCallback(() => {
    distance.current = 0;
    if (!collapsed.current) return;
    collapsed.current = false;
    setHidden(false);
    progress.set(withTiming(0, { duration: 220 }));
  }, [progress]);
  const showForGesture = useCallback(() => {
    revealingGesture.current = true;
    show();
  }, [show]);
  const onTouchStart = useCallback((event: GestureResponderEvent) => {
    touchStart.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
    revealingGesture.current = false;
    distance.current = 0;
  }, []);
  const onTouchMove = useCallback((event: GestureResponderEvent) => {
    const start = touchStart.current;
    if (!start) return;
    const dx = event.nativeEvent.pageX - start.x, dy = event.nativeEvent.pageY - start.y;
    if ((Math.abs(dx) >= 18 && Math.abs(dx) > Math.abs(dy) * 1.5) || dy >= 12) showForGesture();
  }, [showForGesture]);
  const selectPage = useCallback((page: LibraryTab) => {
    active.current = page;
    show();
  }, [show]);
  const onScroll = useCallback((page: LibraryTab, event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement, contentInset } = event.nativeEvent;
    const range = Math.max(0, contentSize.height + (contentInset?.top ?? 0) + (contentInset?.bottom ?? 0) - layoutMeasurement.height);
    const offset = Math.min(range, Math.max(0, contentOffset.y + (contentInset?.top ?? 0)));
    const delta = offset - offsets.current[page];
    const resized = viewports.current[page] > 0 && viewports.current[page] !== layoutMeasurement.height;
    offsets.current[page] = offset;
    viewports.current[page] = layoutMeasurement.height;
    if (active.current !== page) return;
    if (offset <= 1 || range <= 1) { show(); return; }
    // Collapsing the header can clamp the list offset at the bottom. It is not an upward gesture.
    if (resized) { distance.current = 0; return; }
    if (revealingGesture.current) return;
    if (delta > 0) distance.current = Math.max(0, distance.current) + delta;
    else if (delta < 0) distance.current = Math.min(0, distance.current) + delta;
    if (collapsed.current && distance.current <= -12) { show(); return; }
    if (!collapsed.current && distance.current >= 24) {
      collapsed.current = true;
      setHidden(true);
      progress.set(withTiming(1, { duration: 200 }));
    }
  }, [progress, show]);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const measured = event.nativeEvent.layout.height;
    // Transient zero-sized native layouts must not erase the expansion height.
    if (measured > 0) height.set(measured);
  }, [height]);
  const frameStyle = useAnimatedStyle(() => ({
    height: height.get() * (1 - progress.get()),
  }));
  const contentStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.get(),
    transform: [{ translateY: -height.get() * progress.get() }],
  }));
  return { hidden, show: showForGesture, selectPage, onTouchStart, onTouchMove, onScroll, onLayout, frameStyle, contentStyle };
}
