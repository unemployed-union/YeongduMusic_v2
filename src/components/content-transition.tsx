import { useEffect, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { useIsFocused } from 'expo-router';
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

/** Animate only the content pane; keep its state and the adjacent sidebar intact. */
export function ContentTransition({ enabled, transitionKey, children }: { enabled: boolean; transitionKey?: string; children: ReactNode }) {
  const focused = useIsFocused(), reducedMotion = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    cancelAnimation(opacity);
    if (!enabled || !focused || reducedMotion) { opacity.set(1); return; }
    opacity.set(0);
    opacity.set(withTiming(1, { duration: 180 }));
    return () => { cancelAnimation(opacity); opacity.set(1); };
  }, [enabled, focused, reducedMotion, transitionKey, opacity]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.View style={[styles.pane, enabled && animatedStyle]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({ pane: { flex: 1, minWidth: 0 } });
