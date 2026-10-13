import { Children, forwardRef, isValidElement, useMemo, type ReactNode } from 'react';
import { Platform, Text as NativeText, type TextProps, type TextStyle } from 'react-native';
import { characterWrap } from './character-wrap';

const webWrap = { wordBreak: 'break-all', overflowWrap: 'anywhere' } as TextStyle;

function plainText(children: ReactNode): string {
  if (typeof children === 'string' || typeof children === 'number') return String(children).replace(/\u200B/g, '');
  if (Array.isArray(children)) return children.map(plainText).join('');
  if (isValidElement<{ children?: ReactNode }>(children)) return plainText(children.props.children);
  return '';
}

/** App-wide character wrapping with native refs, truncation and original spoken labels. */
export const Text = forwardRef<NativeText, TextProps>(function Text({ children, style, accessibilityLabel, numberOfLines, ...props }, ref) {
  const content = useMemo(() => Platform.OS === 'web' || numberOfLines === 1 ? children : Children.map(children, child =>
    typeof child === 'string' || typeof child === 'number' ? characterWrap(String(child)) : child), [children, numberOfLines]);
  const label = useMemo(() => accessibilityLabel ?? (plainText(children) || undefined), [accessibilityLabel, children]);
  return <NativeText {...props} ref={ref} numberOfLines={numberOfLines} accessibilityLabel={label}
    textBreakStrategy="simple" lineBreakStrategyIOS="none" android_hyphenationFrequency="none"
    style={Platform.OS === 'web' ? [style, webWrap] : style}>{content}</NativeText>;
});
