import { memo, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { BlurTint } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated from 'react-native-reanimated';
import { palette, useColors } from '@/theme/tokens';
import { ScrollEdgeChild } from './scroll-edge-child';
import { useScrollEdges } from './use-scroll-edges';
import { useScrollEdgeTransition } from './use-scroll-edge-transition';

export type ScrollEdgeFadeProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  fadeHeight?: number;
  /** Preserve explicit dark/light edges in the player. No live blur is captured. */
  tint?: BlurTint;
  /** Opaque #RRGGBB surface color for sheets; defaults to the screen background. */
  backgroundColor?: string;
  /** Use intrinsic/shrink layout for a ScrollView inside a height-limited sheet. */
  fill?: boolean;
};
const LOCATIONS = [0, 0.2, 0.5, 0.8, 1] as const;
type FadeColors = readonly [string, string, string, string, string];
const Edge = memo(function Edge({ colors, height, bottom, animatedStyle }: {
  colors: FadeColors; height: number; bottom?: boolean;
  animatedStyle: ReturnType<typeof useScrollEdgeTransition>['topStyle'];
}) {
  return <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.edge, bottom ? styles.bottom : styles.top, { height }, animatedStyle]}>
    <LinearGradient colors={colors} locations={LOCATIONS} dither={false} style={StyleSheet.absoluteFill} />
  </Animated.View>;
});

/** Two small, pre-mounted gradients; never mask or capture the scroll content. */
export function ScrollEdgeFade({ children, style, fadeHeight = 28, tint, backgroundColor, fill = true }: ScrollEdgeFadeProps) {
  const colors = useColors();
  const color = backgroundColor ?? (tint === 'dark' ? palette.dark.background : tint === 'light' ? palette.light.background : colors.background);
  const gradients = useMemo(() => {
    const top = [color, color + 'D9', color + '80', color + '20', color + '00'] as const;
    return { top, bottom: [...top].reverse() as [string, string, string, string, string] };
  }, [color]);
  const { child, scrollProps, top, bottom } = useScrollEdges(children);
  const transition = useScrollEdgeTransition(top, bottom);
  const [height, setHeight] = useState<number | null>(null);
  const edge = Math.min(Math.max(0, fadeHeight), height === null ? fadeHeight : height / 3);
  const layout = fill ? styles.fill : styles.shrink;
  return <View style={[styles.frame, layout, style]} onLayout={(event) => setHeight(event.nativeEvent.layout.height)}>
    <ScrollEdgeChild element={child} scrollProps={scrollProps} />
    <Edge colors={gradients.top} height={edge} animatedStyle={transition.topStyle} />
    <Edge colors={gradients.bottom} height={edge} bottom animatedStyle={transition.bottomStyle} />
  </View>;
}
const styles = StyleSheet.create({
  fill: { flex: 1, minHeight: 0 }, shrink: { flexShrink: 1, minHeight: 0 }, frame: { overflow: 'hidden' },
  edge: { position: 'absolute', left: 0, right: 0 }, top: { top: 0 }, bottom: { bottom: 0 },
});
