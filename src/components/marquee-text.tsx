import { memo, useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type TextStyle } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';

/** Loop overflowing titles to the left using two identical, evenly spaced copies. */
export const MarqueeText = memo(function MarqueeText({ text, style }: { text: string; style: StyleProp<TextStyle> }) {
  const [viewportWidth, setViewportWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const { fontScale } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const offset = useSharedValue(0);
  const overflow = Math.max(0, textWidth - viewportWidth);
  const cycleWidth = textWidth + 48;
  const scrolling = viewportWidth > 0 && overflow > 2 && !reducedMotion;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    cancelAnimation(offset);
    offset.set(0);
    if (!scrolling || !foreground) return;
    // At one full cycle the right copy occupies the original copy's position,
    // so resetting the offset is invisible and never reverses the direction.
    offset.set(withDelay(1600, withRepeat(withTiming(-cycleWidth, {
      duration: Math.max(1800, cycleWidth / 22 * 1000), easing: Easing.linear,
    }), -1, false)));
    return () => cancelAnimation(offset);
  }, [cycleWidth, fontScale, foreground, offset, scrolling, text, viewportWidth]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.get() }] }));
  return <View accessible accessibilityRole="text" accessibilityLabel={text} style={styles.viewport} onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}>
    <Text key={fontScale} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" numberOfLines={1} style={[style, styles.measurement]} onTextLayout={(event) => setTextWidth(Math.ceil(event.nativeEvent.lines[0]?.width ?? 0) + 2)}>{text}</Text>
    <Animated.View style={animatedStyle}>
      <Text accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" numberOfLines={1} style={[style, { width: Math.max(viewportWidth, textWidth) }]}>{text}</Text>
      {scrolling && <Text accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" numberOfLines={1} style={[style, styles.copy, { left: cycleWidth, width: textWidth }]}>{text}</Text>}
    </Animated.View>
  </View>;
});

const styles = StyleSheet.create({
  viewport: { overflow: 'hidden' },
  copy: { position: 'absolute', top: 0 },
  // Measure without truncation; this invisible node never participates in layout.
  measurement: { position: 'absolute', top: 0, left: 0, width: 100000, opacity: 0 },
});
