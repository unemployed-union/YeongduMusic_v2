import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useColors } from '@/theme/tokens';

export function ProgressBar({ percent, label }: { percent: number | null; label: string }) {
  const colors = useColors();
  const reducedMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const [position] = useState(() => new Animated.Value(0));
  const indeterminate = percent === null;
  useEffect(() => {
    if (!indeterminate || reducedMotion || !width) {
      return;
    }
    position.setValue(0);
    const animation = Animated.loop(Animated.timing(position, {
      toValue: 1,
      duration: 1200,
      easing: Easing.linear,
      useNativeDriver: true,
      isInteraction: false,
    }));
    animation.start();
    return () => animation.stop();
  }, [indeterminate, reducedMotion, width, position]);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      accessibilityValue={percent === null ? { text: '진행 중' } : { min: 0, max: 100, now: percent }}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[styles.track, { backgroundColor: colors.separator }]}
    >
      {percent === null ? (
        <Animated.View
          style={[
            styles.fill,
            {
              backgroundColor: colors.tint,
              width: '30%',
              transform: [{
                translateX: reducedMotion
                  ? width * 0.35
                  : position.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-width * 0.3, width],
                    }),
              }],
            },
          ]}
        />
      ) : (
        <View style={[styles.fill, { backgroundColor: colors.tint, width: `${percent}%` }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 4, borderRadius: 2, overflow: 'hidden', width: '100%' },
  fill: { height: '100%', borderRadius: 2 },
});
