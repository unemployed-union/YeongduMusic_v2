import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { usePlaybackStore } from '@/stores/playback';

export function LosslessBadge({ color }: { color: string }) {
  const lossless = usePlaybackStore((state) => state.lossless);
  const unavailable = usePlaybackStore((state) => !!state.error || state.buffering);
  const visible = lossless && !unavailable;
  // Keep the same text metrics and space through track changes and buffering.
  return (
    <View
      accessible={visible}
      accessibilityRole="text"
      accessibilityLabel={visible ? '고음질, 무손실 음원' : undefined}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      pointerEvents="none"
      style={[styles.badge, { borderColor: color + '66' }, !visible && styles.hidden]}
    >
      <Text numberOfLines={1} style={[styles.label, { color }]}>
        고음질 · 무손실
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 7,
    backgroundColor: '#FFFFFF0A',
  },
  label: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 0.2 },
  hidden: { opacity: 0 },
});
