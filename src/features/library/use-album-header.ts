import { useCallback, useEffect, useState } from 'react';
import type { ScrollViewProps } from 'react-native';
import { useAnimatedReaction, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

/** Fade shortly before the song surface reaches the bottom of the floating header. */
export function albumHeaderProgress(offset: number, heroHeight: number, headerHeight: number) {
  'worklet';
  const start = Math.max(0, heroHeight - headerHeight - 56);
  return Math.max(0, Math.min(1, (offset - start) / 56));
}

export function useAlbumHeader(albumId: string, heroHeight: number, headerHeight: number) {
  const offset = useSharedValue(0);
  const [overSongs, setOverSongs] = useState(false);
  useEffect(() => {
    offset.set(0);
  }, [albumId, offset]);
  useAnimatedReaction(
    () => albumHeaderProgress(offset.get(), heroHeight, headerHeight) >= 0.5,
    (next, previous) => {
      if (next !== previous) {
        scheduleOnRN(setOverSongs, next);
      }
    },
  );
  const onScroll = useCallback<NonNullable<ScrollViewProps['onScroll']>>(
    (event) => {
      const position = Math.max(
        0,
        event.nativeEvent.contentOffset.y + (event.nativeEvent.contentInset?.top ?? 0),
      );
      offset.set(position);
    },
    [offset],
  );
  const gradientStyle = useAnimatedStyle(() => ({
    opacity: albumHeaderProgress(offset.get(), heroHeight, headerHeight),
  }));
  return { onScroll, gradientStyle, overSongs };
}
