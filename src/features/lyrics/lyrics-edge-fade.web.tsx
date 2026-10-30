import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

// CSS keeps the web preview independent of the native mask implementation.
const image =
  'linear-gradient(to bottom, transparent 0%, #000 min(28px, 33%), #000 calc(100% - min(28px, 33%)), transparent 100%)';
const mask: ViewStyle & { maskImage: string; WebkitMaskImage: string } = {
  maskImage: image,
  WebkitMaskImage: image,
};
const styles = StyleSheet.create({ viewport: { flex: 1, minHeight: 0, overflow: 'hidden' } });

export function LyricsEdgeFade({ children }: { children: ReactNode }) {
  return <View style={[styles.viewport, mask]}>{children}</View>;
}
