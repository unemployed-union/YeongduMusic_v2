import { useState } from 'react';
import { StyleSheet, View, useColorScheme, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import type { ScrollEdgeFadeProps } from './scroll-edge-fade';
import { useScrollEdges } from './use-scroll-edges';
import { ScrollEdgeChild } from './scroll-edge-child';

type WebMaskStyle = ViewStyle & { maskImage: string; WebkitMaskImage: string };
const maskStyle = (image: string): WebMaskStyle => ({ maskImage: image, WebkitMaskImage: image });
const start = 'rgba(0,0,0,0) 0%, rgba(0,0,0,.125) 20%, rgba(0,0,0,.5) 50%, rgba(0,0,0,.85) 80%, #000 100%';
const end = '#000 0%, rgba(0,0,0,.85) 20%, rgba(0,0,0,.5) 50%, rgba(0,0,0,.125) 80%, rgba(0,0,0,0) 100%';

// CSS alpha masks keep the web preview working without native MaskedView or
// its optional DOM screenshot dependency. Native platforms use the sibling file.
export function ScrollEdgeFade({ children, style, fadeHeight = 28, tint, fill = true }: ScrollEdgeFadeProps) {
  const { child, scrollProps, top, bottom } = useScrollEdges(children);
  const [height, setHeight] = useState<number | null>(null);
  const scheme = useColorScheme();
  const edge = Math.min(Math.max(0, fadeHeight), height === null ? fadeHeight : height / 3);
  const layout = fill ? styles.fill : styles.shrink;
  const viewport = maskStyle('linear-gradient(to bottom, ' + (top ? 'transparent' : '#000') + ' 0px, #000 ' + edge + 'px, #000 calc(100% - ' + edge + 'px), ' + (bottom ? 'transparent' : '#000') + ' 100%)');
  return <View style={[styles.frame, layout, style]} onLayout={(event) => setHeight(event.nativeEvent.layout.height)}>
    <View style={[layout, viewport]}>
      <ScrollEdgeChild element={child} scrollProps={scrollProps} />
      {top && edge > 0 && <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.edge, { top: 0, height: edge }, maskStyle('linear-gradient(to bottom, ' + end + ')')]}>
        <BlurView intensity={60} tint={tint ?? (scheme === 'dark' ? 'dark' : 'light')} style={StyleSheet.absoluteFill} />
      </View>}
      {bottom && edge > 0 && <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.edge, { bottom: 0, height: edge }, maskStyle('linear-gradient(to bottom, ' + start + ')')]}>
        <BlurView intensity={60} tint={tint ?? (scheme === 'dark' ? 'dark' : 'light')} style={StyleSheet.absoluteFill} />
      </View>}
    </View>
  </View>;
}
const styles = StyleSheet.create({ fill: { flex: 1, minHeight: 0 }, shrink: { flexShrink: 1, minHeight: 0 }, frame: { overflow: 'hidden' }, edge: { position: 'absolute', left: 0, right: 0 } });
