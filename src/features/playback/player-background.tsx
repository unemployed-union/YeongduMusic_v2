import { useCallback, useEffect, useReducer } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { GradientColors } from './artwork-colors';
import { backgroundLayers, initialBackgroundLayers, sameGradient, type BackgroundLayer } from './background-layers';

function GradientLayer({ layer, onComplete }: { layer: BackgroundLayer; onComplete: (id: number) => void }) {
  const { id, colors, animate } = layer;
  const opacity = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    if (!animate) return;
    opacity.set(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.cubic) }, (finished) => {
      if (finished) scheduleOnRN(onComplete, id);
    }));
    return () => cancelAnimation(opacity);
  }, [animate, id, onComplete, opacity]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.View style={[StyleSheet.absoluteFill, fadeStyle]}>
    <LinearGradient colors={colors} locations={[0, 0.5, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
  </Animated.View>;
}

export function PlayerBackground({ colors }: { colors: GradientColors }) {
  const [layers, dispatch] = useReducer(backgroundLayers, colors, initialBackgroundLayers);
  if (!sameGradient(layers[layers.length - 1].colors, colors)) {
    // Adjust before commit; never reset a visible native layer's opacity from an effect.
    dispatch({ type: 'target', colors });
  }
  const onComplete = useCallback((id: number) => dispatch({ type: 'complete', id }), []);

  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
    {layers.map((layer) => <GradientLayer key={layer.id} layer={layer} onComplete={onComplete} />)}
  </View>;
}
