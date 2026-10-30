import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Text } from '@/components/text';
import type { LyricsSource } from '@/types/lyrics';

const sources: { value: LyricsSource; label: string }[] = [
  { value: 'auto', label: '자동' },
  { value: 'nas', label: 'NAS' },
  { value: 'online', label: '온라인' },
];
type SegmentLayout = { x: number; width: number };

export function LyricsSourceControl({
  source,
  onChange,
}: {
  source: LyricsSource;
  onChange: (source: LyricsSource) => void;
}) {
  const [layouts, setLayouts] = useState<Partial<Record<LyricsSource, SegmentLayout>>>({});
  const selectedLayout = layouts[source];
  const positioned = useRef(false);
  const frame = useSharedValue<SegmentLayout>({ x: 0, width: 0 });
  useEffect(() => {
    if (!selectedLayout) {
      return;
    }
    frame.set(positioned.current ? withTiming(selectedLayout, { duration: 180 }) : selectedLayout);
    positioned.current = true;
  }, [selectedLayout, frame]);
  const indicatorStyle = useAnimatedStyle(() => ({
    width: frame.get().width,
    transform: [{ translateX: frame.get().x }],
  }));

  return (
    <View style={styles.track}>
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.indicator, indicatorStyle]}
      />
      {sources.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="button"
          accessibilityLabel={`가사 출처 ${option.label}`}
          accessibilityState={{ selected: source === option.value }}
          hitSlop={{ top: 4, bottom: 4 }}
          onLayout={(event) => {
            const { x, width } = event.nativeEvent.layout;
            setLayouts((previous) =>
              previous[option.value]?.x === x && previous[option.value]?.width === width
                ? previous
                : { ...previous, [option.value]: { x, width } },
            );
          }}
          onPress={() => onChange(option.value)}
          style={styles.segment}
        >
          <Text style={[styles.label, source === option.value && styles.selectedLabel]}>
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    minHeight: 36,
    padding: 3,
    borderRadius: 18,
    backgroundColor: '#FFFFFF14',
    overflow: 'hidden',
  },
  indicator: {
    position: 'absolute',
    left: 0,
    top: 3,
    bottom: 3,
    borderRadius: 15,
    backgroundColor: '#FFFFFF24',
  },
  segment: {
    minHeight: 30,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { color: '#FFFFFF99', fontSize: 12, fontWeight: '600' },
  selectedLabel: { color: 'white' },
});
