import { cloneElement, isValidElement, type ReactNode } from 'react';
import type { ScrollViewProps } from 'react-native';

/** Store the observers as scroll props; cloning retains the child's key and ref. */
export function ScrollEdgeChild({ element, scrollProps }: { element: ReactNode; scrollProps?: ScrollViewProps }) {
  return scrollProps && isValidElement<ScrollViewProps>(element) ? cloneElement(element, scrollProps) : element;
}
