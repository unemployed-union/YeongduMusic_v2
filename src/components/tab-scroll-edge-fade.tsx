import {
  cloneElement,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactElement,
} from 'react';
import { Platform, StyleSheet, View, type ScrollViewProps } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useColors } from '@/theme/tokens';
import { ScrollEdgeFade, type ScrollEdgeFadeProps } from './scroll-edge-fade';
import { TabBarInsetContext } from './tab-bar-inset';

/** Keep scroll content behind the glass tab bar, but its indicator above it. */
export function TabScrollEdgeFade({ children, ...props }: ScrollEdgeFadeProps) {
  const bottomInset = useContext(TabBarInsetContext);
  if (
    !isValidElement<ScrollViewProps>(children) ||
    children.props.horizontal ||
    children.props.showsVerticalScrollIndicator === false
  ) {
    return <ScrollEdgeFade {...props}>{children}</ScrollEdgeFade>;
  }
  if (Platform.OS === 'ios') {
    const insets = children.props.scrollIndicatorInsets;
    return (
      <ScrollEdgeFade {...props}>
        {cloneElement(children, {
          automaticallyAdjustsScrollIndicatorInsets: false,
          scrollIndicatorInsets: { ...insets, bottom: Math.max(insets?.bottom ?? 0, bottomInset) },
        })}
      </ScrollEdgeFade>
    );
  }
  if (Platform.OS !== 'android') {
    return <ScrollEdgeFade {...props}>{children}</ScrollEdgeFade>;
  }
  // Android does not support scrollIndicatorInsets. Draw only the indicator;
  // the native list keeps its viewport, virtualization, gestures and refresh control.
  return (
    <AndroidScrollEdgeFade {...props} bottomInset={bottomInset}>
      {children}
    </AndroidScrollEdgeFade>
  );
}

type Metrics = {
  content: number;
  viewport: number;
  offset: number;
  insetTop: number;
  insetBottom: number;
};
const INITIAL_METRICS: Metrics = {
  content: 0,
  viewport: 0,
  offset: 0,
  insetTop: 0,
  insetBottom: 0,
};
function ObservedScrollEdgeFade({
  children,
  scrollProps,
  ...props
}: Omit<ScrollEdgeFadeProps, 'children'> & {
  children: ReactElement<ScrollViewProps>;
  scrollProps: ScrollViewProps;
}) {
  return <ScrollEdgeFade {...props}>{cloneElement(children, scrollProps)}</ScrollEdgeFade>;
}
function AndroidScrollEdgeFade({
  children,
  bottomInset,
  style,
  fill = true,
  ...props
}: Omit<ScrollEdgeFadeProps, 'children'> & {
  children: ReactElement<ScrollViewProps>;
  bottomInset: number;
}) {
  const colors = useColors();
  const trackTop = Math.max(3, (children.props.scrollIndicatorInsets?.top ?? 0) + 3);
  const metrics = useRef<Metrics>(INITIAL_METRICS);
  const position = useSharedValue(INITIAL_METRICS);
  const opacity = useSharedValue(0);
  useEffect(
    () => () => {
      cancelAnimation(opacity);
    },
    [opacity],
  );
  const {
    onLayout: originalLayout,
    onContentSizeChange: originalContentSize,
    onScroll: originalScroll,
  } = children.props;
  const onLayout = useCallback<NonNullable<ScrollViewProps['onLayout']>>(
    (event) => {
      metrics.current = { ...metrics.current, viewport: event.nativeEvent.layout.height };
      position.set(metrics.current);
      originalLayout?.(event);
    },
    [originalLayout, position],
  );
  const onContentSizeChange = useCallback<NonNullable<ScrollViewProps['onContentSizeChange']>>(
    (width, height) => {
      metrics.current = { ...metrics.current, content: height };
      position.set(metrics.current);
      originalContentSize?.(width, height);
    },
    [originalContentSize, position],
  );
  const onScroll = useCallback<NonNullable<ScrollViewProps['onScroll']>>(
    (event) => {
      const { contentSize, layoutMeasurement, contentOffset, contentInset } = event.nativeEvent;
      metrics.current = {
        content: contentSize.height,
        viewport: layoutMeasurement.height,
        offset: contentOffset.y,
        insetTop: contentInset?.top ?? 0,
        insetBottom: contentInset?.bottom ?? 0,
      };
      position.set(metrics.current);
      opacity.set(0.5);
      opacity.set(withDelay(700, withTiming(0, { duration: 250 })));
      originalScroll?.(event);
    },
    [originalScroll, position, opacity],
  );
  const indicatorStyle = useAnimatedStyle(() => {
    const { content, viewport, offset, insetTop, insetBottom } = position.get();
    const total = content + insetTop + insetBottom;
    const range = total - viewport;
    const track = Math.max(0, viewport - bottomInset - trackTop - 3);
    const height = total > 0 ? Math.min(track, Math.max(24, (track * viewport) / total)) : 0;
    const progress = range > 0 ? Math.max(0, Math.min(1, (offset + insetTop) / range)) : 0;
    return {
      height,
      opacity: range > 1 && track > 0 ? opacity.get() : 0,
      transform: [{ translateY: progress * (track - height) }],
    };
  });
  return (
    <View style={[styles.frame, fill ? styles.fill : styles.shrink, style]}>
      <ObservedScrollEdgeFade
        {...props}
        fill={fill}
        scrollProps={{
          showsVerticalScrollIndicator: false,
          scrollEventThrottle: children.props.scrollEventThrottle ?? 16,
          onLayout,
          onContentSizeChange,
          onScroll,
        }}
      >
        {children}
      </ObservedScrollEdgeFade>
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.indicator, { top: trackTop, backgroundColor: colors.text }, indicatorStyle]}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  frame: { overflow: 'hidden' },
  fill: { flex: 1, minHeight: 0 },
  shrink: { flexShrink: 1, minHeight: 0 },
  indicator: { position: 'absolute', top: 3, right: 3, width: 3, borderRadius: 2 },
});
