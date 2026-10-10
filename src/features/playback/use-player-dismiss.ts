import { useCallback, useEffect } from 'react';
import { BackHandler } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Gesture } from 'react-native-gesture-handler';
import { cancelAnimation, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

export function usePlayerDismiss(height: number, onDismiss: () => void) {
  const translationY = useSharedValue(height);
  const closing = useSharedValue(false);
  const ready = useSharedValue(false);

  useEffect(() => {
    translationY.set(withTiming(0, { duration: 260 }, (finished) => {
      if (finished) ready.set(true);
    }));
    return () => cancelAnimation(translationY);
  }, [ready, translationY]);

  const close = useCallback(() => {
    'worklet';
    if (closing.get()) return;
    closing.set(true);
    translationY.set(withTiming(height, { duration: 230 }, (finished) => {
      if (finished) scheduleOnRN(onDismiss);
    }));
  }, [closing, height, onDismiss, translationY]);

  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => subscription.remove();
  }, [close]));

  const gesture = Gesture.Pan()
    .activeOffsetY(12)
    .failOffsetY(-12)
    .failOffsetX([-24, 24])
    .onUpdate((event) => {
      if (ready.get() && !closing.get()) translationY.set(Math.max(0, event.translationY));
    })
    .onEnd((event) => {
      if (!ready.get() || closing.get()) return;
      if (event.translationY >= Math.min(160, height * 0.2) || (event.translationY > 28 && event.velocityY > 1000)) close();
    })
    .onFinalize(() => {
      if (ready.get() && !closing.get()) translationY.set(withSpring(0, { damping: 24, stiffness: 220 }));
    });

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translationY.get() }] }));
  return { gesture, animatedStyle, close, ready, closing };
}
