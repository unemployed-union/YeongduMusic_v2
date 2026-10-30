import { useEffect } from 'react';
import {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

export const EDGE_TRANSITION_MS = 200;
/** Animate only the two overlay opacities; reversal keeps the current value. */
export function useScrollEdgeTransition(top: boolean, bottom: boolean) {
  const topOpacity = useSharedValue(top ? 1 : 0);
  const bottomOpacity = useSharedValue(bottom ? 1 : 0);
  useEffect(() => {
    const config = { duration: EDGE_TRANSITION_MS, easing: Easing.inOut(Easing.quad) };
    topOpacity.set(withTiming(top ? 1 : 0, config));
    bottomOpacity.set(withTiming(bottom ? 1 : 0, config));
    return () => {
      cancelAnimation(topOpacity);
      cancelAnimation(bottomOpacity);
    };
  }, [top, bottom, topOpacity, bottomOpacity]);
  const topStyle = useAnimatedStyle(() => ({ opacity: topOpacity.get() }));
  const bottomStyle = useAnimatedStyle(() => ({ opacity: bottomOpacity.get() }));
  return { topStyle, bottomStyle };
}
