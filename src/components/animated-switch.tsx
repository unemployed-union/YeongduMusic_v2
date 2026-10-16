import { useEffect } from 'react';
import { Pressable, StyleSheet, type SwitchProps } from 'react-native';
import Animated, { interpolateColor, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useColors } from '@/theme/tokens';
import { playHaptic } from '@/services/haptics';

type Props = Pick<SwitchProps, 'value' | 'disabled' | 'onValueChange' | 'accessibilityLabel'> & {
  trackColor?: { false?: string; true?: string };
  thumbColor?: string;
  ios_backgroundColor?: string;
  haptics?: boolean;
  /** Temporarily block repeated input while preserving the enabled appearance. */
  busy?: boolean;
};

export function AnimatedSwitch({ value = false, disabled = false, busy = false, onValueChange, accessibilityLabel, trackColor, thumbColor, ios_backgroundColor, haptics = true }: Props) {
  const colors = useColors();
  const progress = useSharedValue(value ? 1 : 0);
  const off = disabled ? colors.separator : trackColor?.false ?? ios_backgroundColor ?? colors.separator;
  const on = disabled ? colors.muted : trackColor?.true ?? colors.tint;
  const offThumb = disabled ? colors.switchThumbDisabled : thumbColor ?? colors.switchThumbOff;
  const onThumb = disabled ? colors.switchThumbDisabled : thumbColor ?? colors.switchThumbOn;
  const blocked = disabled || busy;
  useEffect(() => {
    progress.value = withTiming(value ? 1 : 0, { duration: 180, reduceMotion: ReduceMotion.System });
  }, [value, progress]);
  const track = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(progress.value, [0, 1], [off, on]) }));
  const thumb = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(progress.value, [0, 1], [offThumb, onThumb]), transform: [{ translateX: progress.value * 22 }] }));
  return <Pressable accessibilityRole="switch" accessibilityLabel={accessibilityLabel}
    accessibilityState={{ checked: value, disabled: blocked, ...(busy && { busy: true }) }} disabled={blocked}
    onPress={() => { if (!blocked && onValueChange) { if (haptics) playHaptic('selection'); onValueChange(!value); } }} style={styles.touch}>
    <Animated.View style={[styles.track, track]} pointerEvents="none">
      <Animated.View style={[styles.thumb, thumb]} />
    </Animated.View>
  </Pressable>;
}

const styles = StyleSheet.create({
  touch: { width: 52, minHeight: 44, justifyContent: 'center', flexShrink: 0 },
  track: { width: 52, height: 30, borderRadius: 15 },
  thumb: { position: 'absolute', left: 3, top: 3, width: 24, height: 24, borderRadius: 12,
    shadowColor: '#000000', shadowOpacity: 0.16, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
});
