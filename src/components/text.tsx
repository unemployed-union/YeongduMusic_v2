import { Children, forwardRef, isValidElement, useMemo, type ReactNode } from 'react';
import {
  Platform,
  Text as NativeText,
  type TextInstance,
  type TextProps,
  type TextStyle,
} from 'react-native';
import { characterWrap } from './character-wrap';

export type AppTextProps = TextProps & { variant?: TextProps['dynamicTypeRamp'] };

const textRoles: Record<string, TextStyle> = {
  largeTitle: { fontSize: 34, fontWeight: '700' },
  title1: { fontSize: 28, fontWeight: '700' },
  title2: { fontSize: 22, fontWeight: '600' },
  title3: { fontSize: 20, fontWeight: '600' },
  headline: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 17 },
  callout: { fontSize: 16 },
  subheadline: { fontSize: 15 },
  footnote: { fontSize: 13 },
  caption1: { fontSize: 12 },
  caption2: { fontSize: 11 },
};

const webWrap = { wordBreak: 'normal', overflowWrap: 'break-word' } as TextStyle;

function plainText(children: ReactNode): string {
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children).replace(/\u200B/g, '');
  }
  if (Array.isArray(children)) {
    return children.map(plainText).join('');
  }
  if (isValidElement<{ children?: ReactNode }>(children)) {
    return plainText(children.props.children);
  }
  return '';
}

/** Word wrapping with character breaks for Hangul, native refs and original spoken labels. */
export const Text = forwardRef<TextInstance, AppTextProps>(function Text(
  { children, style, accessibilityLabel, numberOfLines, variant, dynamicTypeRamp, ...props },
  ref,
) {
  const content = useMemo(
    () =>
      numberOfLines === 1
        ? children
        : Children.map(children, (child) =>
            typeof child === 'string' || typeof child === 'number'
              ? characterWrap(String(child))
              : child,
          ),
    [children, numberOfLines],
  );
  const label = useMemo(
    () => accessibilityLabel ?? (plainText(children) || undefined),
    [accessibilityLabel, children],
  );
  let resolvedStyle = style;
  if (Platform.OS === 'web') {
    resolvedStyle = [style, webWrap];
  } else if (Platform.OS === 'ios' && variant) {
    resolvedStyle = [textRoles[variant], style];
  }
  return (
    <NativeText
      {...props}
      ref={ref}
      numberOfLines={numberOfLines}
      dynamicTypeRamp={Platform.OS === 'ios' ? (dynamicTypeRamp ?? variant) : dynamicTypeRamp}
      accessibilityLabel={label}
      textBreakStrategy="highQuality"
      lineBreakStrategyIOS="standard"
      android_hyphenationFrequency="none"
      style={resolvedStyle}
    >
      {content}
    </NativeText>
  );
});
