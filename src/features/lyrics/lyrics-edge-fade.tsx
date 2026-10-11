import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';

const styles = StyleSheet.create({
  viewport: { flex: 1, minHeight: 0, overflow: 'hidden' },
  mask: { flex: 1 },
  edge: { height: 28, maxHeight: '33%' },
  middle: { flex: 1, backgroundColor: '#FFFFFF' },
});
// Only alpha is applied to the lyrics. The white mask never paints the player.
// Keep it static and mounted so scrolling needs no mask animation or mode switch.
const mask = <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.mask}>
  <LinearGradient colors={['#FFFFFF00', '#FFFFFF']} dither={false} style={styles.edge} />
  <View style={styles.middle} />
  <LinearGradient colors={['#FFFFFF', '#FFFFFF00']} dither={false} style={styles.edge} />
</View>;

export function LyricsEdgeFade({ children }: { children: ReactNode }) {
  return <MaskedView androidRenderingMode="hardware" style={styles.viewport} maskElement={mask}>{children}</MaskedView>;
}
