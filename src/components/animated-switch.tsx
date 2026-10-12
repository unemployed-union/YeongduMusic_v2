import { useEffect } from 'react';
import { Pressable, StyleSheet, type SwitchProps } from 'react-native';
import Animated, { interpolateColor, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

type Props = Pick<SwitchProps, 'value' | 'disabled' | 'onValueChange' | 'accessibilityLabel'> & {
  trackColor?: { false?: string; true?: string };
  thumbColor?: string;
  ios_backgroundColor?: string;
};

export function AnimatedSwitch({ value = false, disabled = false, onValueChange, accessibilityLabel, trackColor, thumbColor = '#FFFFFF', ios_backgroundColor }: Props) {
  const progress = useSharedValue(value ? 1 : 0);
  const off = trackColor?.false ?? ios_backgroundColor ?? '#E1E1E6';
  const on = trackColor?.true ?? '#FA5376';
  useEffect(() => {
    progress.value = withTiming(value ? 1 : 0, { duration: 180, reduceMotion: ReduceMotion.System });
  }, [value, progress]);
  const track = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(progress.value, [0, 1], [off, on]) }));
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: progress.value * 22 }] }));
  return <Pressable accessibilityRole="switch" accessibilityLabel={accessibilityLabel}
    accessibilityState={{ checked: value, disabled }} disabled={disabled}
    onPress={() => onValueChange?.(!value)} style={styles.touch}>
    <Animated.View style={[styles.track, track]} pointerEvents="none">
      <Animated.View style={[styles.thumb, { backgroundColor: thumbColor }, thumb]} />
    </Animated.View>
  </Pressable>;
}

const styles = StyleSheet.create({
  touch: { width: 52, minHeight: 44, justifyContent: 'center', flexShrink: 0 },
  track: { width: 52, height: 30, borderRadius: 15 },
  thumb: { position: 'absolute', left: 3, top: 3, width: 24, height: 24, borderRadius: 12,
    shadowColor: '#000000', shadowOpacity: 0.16, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
});
