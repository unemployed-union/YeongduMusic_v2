import { memo, useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type TextStyle } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

/** Reveal the trailing text only when a single-line title exceeds its viewport. */
export const MarqueeText = memo(function MarqueeText({ text, style }: { text: string; style: StyleProp<TextStyle> }) {
  const [viewportWidth, setViewportWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const { fontScale } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const offset = useSharedValue(0);
  const overflow = Math.max(0, textWidth - viewportWidth);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    cancelAnimation(offset);
    offset.set(0);
    if (viewportWidth <= 0 || overflow <= 2 || reducedMotion || !foreground) return;
    const timing = { duration: Math.max(1800, overflow / 22 * 1000), easing: Easing.linear };
    offset.set(withRepeat(withSequence(
      withDelay(1600, withTiming(-overflow, timing)),
      withDelay(1600, withTiming(0, timing)),
    ), -1, false));
    return () => cancelAnimation(offset);
  }, [fontScale, foreground, offset, overflow, reducedMotion, text, viewportWidth]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.get() }] }));
  return <View accessible accessibilityRole="text" accessibilityLabel={text} style={styles.viewport} onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}>
    <Text key={fontScale} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" numberOfLines={1} style={[style, styles.measurement]} onTextLayout={(event) => setTextWidth(Math.ceil(event.nativeEvent.lines[0]?.width ?? 0) + 2)}>{text}</Text>
    <Animated.Text accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" numberOfLines={1} style={[style, { width: Math.max(viewportWidth, textWidth) }, animatedStyle]}>{text}</Animated.Text>
  </View>;
});

const styles = StyleSheet.create({
  viewport: { overflow: 'hidden' },
  // Measure without truncation; this invisible node never participates in layout.
  measurement: { position: 'absolute', top: 0, left: 0, width: 100000, opacity: 0 },
});
