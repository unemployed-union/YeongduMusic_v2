import { memo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { StyleSheet, View, useColorScheme, type StyleProp, type ViewStyle } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { BlurTargetView, BlurView, type BlurTint } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useScrollEdges } from './use-scroll-edges';
import { ScrollEdgeChild } from './scroll-edge-child';

export type ScrollEdgeFadeProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  fadeHeight?: number;
  tint?: BlurTint;
  /** Use intrinsic/shrink layout for a ScrollView inside a height-limited sheet. */
  fill?: boolean;
};

const FADE_COLORS = ['#00000000', '#00000020', '#00000080', '#000000D9', '#000000'] as const;
const BLUR_COLORS = [...FADE_COLORS].reverse() as [string, string, string, string, string];
const LOCATIONS = [0, 0.2, 0.5, 0.8, 1] as const;

const EdgeBlur = memo(function EdgeBlur({ target, height, bottom, tint }: {
  target: RefObject<View | null>; height: number; bottom?: boolean; tint: BlurTint;
}) {
  return <MaskedView pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    androidRenderingMode="hardware" style={[styles.edge, { height }, bottom ? styles.bottom : styles.top]}
    maskElement={<LinearGradient colors={bottom ? FADE_COLORS : BLUR_COLORS} locations={LOCATIONS} style={styles.fill} />}>
    <BlurView blurTarget={target} blurMethod="dimezisBlurView" intensity={60} tint={tint} style={StyleSheet.absoluteFill} />
  </MaskedView>;
});

/** Fade and blur the viewport edges; leave the original scroll component/ref/gestures intact. */
export function ScrollEdgeFade({ children, style, fadeHeight = 28, tint, fill = true }: ScrollEdgeFadeProps) {
  const { child, scrollProps, top, bottom } = useScrollEdges(children);
  const target = useRef<View | null>(null);
  const [height, setHeight] = useState<number | null>(null);
  const scheme = useColorScheme();
  const edge = Math.min(Math.max(0, fadeHeight), height === null ? fadeHeight : height / 3);
  const layout = fill ? styles.fill : styles.shrink;
  return <View style={[styles.frame, layout, style]} onLayout={(event) => setHeight(event.nativeEvent.layout.height)}>
    <MaskedView style={layout} androidRenderingMode="hardware" maskElement={<View style={styles.fill}>
      <LinearGradient colors={FADE_COLORS} locations={LOCATIONS} style={{ height: top ? edge : 0 }} />
      <View style={styles.opaque} />
      <LinearGradient colors={BLUR_COLORS} locations={LOCATIONS} style={{ height: bottom ? edge : 0 }} />
    </View>}>
      <BlurTargetView ref={target} collapsable={false} style={layout}><ScrollEdgeChild element={child} scrollProps={scrollProps} /></BlurTargetView>
      {/* Render after dynamic lists and sample only their content, never the blur itself. */}
      {top && edge > 0 && <EdgeBlur target={target} height={edge} tint={tint ?? (scheme === 'dark' ? 'dark' : 'light')} />}
      {bottom && edge > 0 && <EdgeBlur target={target} height={edge} bottom tint={tint ?? (scheme === 'dark' ? 'dark' : 'light')} />}
    </MaskedView>
  </View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1, minHeight: 0 },
  shrink: { flexShrink: 1, minHeight: 0 },
  frame: { overflow: 'hidden' },
  opaque: { flex: 1, backgroundColor: '#000000' },
  edge: { position: 'absolute', left: 0, right: 0 },
  top: { top: 0 },
  bottom: { bottom: 0 },
});
