import { memo, useEffect, useState } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { usePlaybackVisibility } from '@/features/playback/use-playback-visibility';
import { Text } from '@/components/text';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';

/** Loop overflowing titles to the left using two identical, evenly spaced copies. */
export const MarqueeText = memo(function MarqueeText({ text, style, active = true, fadeEdges = false }: { text: string; style: StyleProp<TextStyle>; active?: boolean; fadeEdges?: boolean }) {
  const [viewportWidth, setViewportWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);
  const foreground = usePlaybackVisibility();
  const { fontScale } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const offset = useSharedValue(0);
  const overflow = Math.max(0, textWidth - viewportWidth);
  const cycleWidth = textWidth + 48;
  const scrolling = viewportWidth > 0 && overflow > 2 && !reducedMotion;

  useEffect(() => {
    cancelAnimation(offset);
    offset.set(0);
    if (!scrolling || !foreground || !active) return;
    // At one full cycle the right copy occupies the original copy's position,
    // so resetting the offset is invisible and never reverses the direction.
    offset.set(withDelay(1600, withRepeat(withTiming(-cycleWidth, {
      duration: Math.max(1800, cycleWidth / 22 * 1000), easing: Easing.linear,
    }), -1, false)));
    return () => cancelAnimation(offset);
  }, [active, cycleWidth, fontScale, foreground, offset, scrolling, text, viewportWidth]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.get() }] }));
  const content = <Animated.View style={animatedStyle}>
      <Text accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" numberOfLines={1} style={[style, { width: Math.max(viewportWidth, textWidth) }]}>{text}</Text>
      {scrolling && <Text accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" numberOfLines={1} style={[style, styles.copy, { left: cycleWidth, width: textWidth }]}>{text}</Text>}
    </Animated.View>;
  const fading = fadeEdges && scrolling && foreground && active;
  const edge = Math.min(0.25, 18 / Math.max(1, viewportWidth));
  const webMask = `linear-gradient(to right, transparent, black ${edge * 100}%, black ${(1 - edge) * 100}%, transparent)`;
  // A static alpha mask keeps the artwork visible and needs no per-frame JS or mask animation.
  const fadedContent = !fading ? content : Platform.OS === 'web'
    ? <View style={{ maskImage: webMask, WebkitMaskImage: webMask } as ViewStyle}>{content}</View>
    : <MaskedView androidRenderingMode="hardware" maskElement={<LinearGradient colors={['#FFFFFF00', '#FFFFFF', '#FFFFFF', '#FFFFFF00']} locations={[0, edge, 1 - edge, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} dither={false} style={styles.mask} />}>{content}</MaskedView>;
  return <View accessible accessibilityRole="text" accessibilityLabel={text} style={styles.viewport} onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}>
    <Text key={fontScale} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" numberOfLines={1} style={[style, styles.measurement]} onTextLayout={(event) => setTextWidth(Math.ceil(event.nativeEvent.lines[0]?.width ?? 0) + 2)}>{text}</Text>
    {fadedContent}
  </View>;
});

const styles = StyleSheet.create({
  viewport: { overflow: 'hidden' },
  mask: { flex: 1 },
  copy: { position: 'absolute', top: 0 },
  // Measure without truncation; this invisible node never participates in layout.
  measurement: { position: 'absolute', top: 0, left: 0, width: 100000, opacity: 0 },
});
