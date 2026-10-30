import { isValidElement, useCallback, useRef, useState, type ReactNode } from 'react';
import type { ScrollViewProps } from 'react-native';

type Metrics = {
  content: number;
  viewport: number;
  offset: number;
  insetTop: number;
  insetBottom: number;
};
export function scrollEdgeVisibility({
  content,
  viewport,
  offset,
  insetTop,
  insetBottom,
}: Metrics) {
  const remaining = content + insetTop + insetBottom - viewport;
  const position = offset + insetTop;
  // Do not tint empty/short lists, initial position or pull-to-refresh overscroll.
  const top = viewport > 0 && remaining > 1 && position > 1;
  return { top, bottom: top && position < remaining - 1 };
}

/** Observe a single vertical scroll child without replacing its ref or existing handlers. */
export function useScrollEdges(children: ReactNode) {
  const metrics = useRef<Metrics>({
    content: 0,
    viewport: 0,
    offset: 0,
    insetTop: 0,
    insetBottom: 0,
  });
  const current = useRef({ top: false, bottom: false });
  const [edges, setEdges] = useState({ top: false, bottom: false });
  const update = useCallback(() => {
    const next = scrollEdgeVisibility(metrics.current);
    if (next.top !== current.current.top || next.bottom !== current.current.bottom) {
      current.current = next;
      setEdges(next);
    }
  }, []);
  const props = isValidElement<ScrollViewProps>(children) ? children.props : undefined;
  const {
    onLayout: originalLayout,
    onContentSizeChange: originalContentSize,
    onScroll: originalScroll,
  } = props ?? {};
  const onLayout = useCallback<NonNullable<ScrollViewProps['onLayout']>>(
    (event) => {
      metrics.current.viewport = event.nativeEvent.layout.height;
      update();
      originalLayout?.(event);
    },
    [originalLayout, update],
  );
  const onContentSizeChange = useCallback<NonNullable<ScrollViewProps['onContentSizeChange']>>(
    (width, height) => {
      metrics.current.content = height;
      update();
      originalContentSize?.(width, height);
    },
    [originalContentSize, update],
  );
  const onScroll = useCallback<NonNullable<ScrollViewProps['onScroll']>>(
    (event) => {
      const { contentOffset, contentSize, layoutMeasurement, contentInset } = event.nativeEvent;
      metrics.current = {
        content: contentSize.height,
        viewport: layoutMeasurement.height,
        offset: contentOffset.y,
        insetTop: contentInset?.top ?? 0,
        insetBottom: contentInset?.bottom ?? 0,
      };
      update();
      originalScroll?.(event);
    },
    [originalScroll, update],
  );
  if (!isValidElement<ScrollViewProps>(children) || props?.horizontal) {
    return { child: children, scrollProps: undefined, top: false, bottom: false };
  }
  const scrollProps: ScrollViewProps = {
    scrollEventThrottle: props?.scrollEventThrottle ?? 16,
    onLayout,
    onContentSizeChange,
    onScroll,
  };
  return { child: children, scrollProps, ...edges };
}
