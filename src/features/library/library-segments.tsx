import type { ReactNode } from 'react';
import type { LibraryTab } from './library-page';

export type LibrarySegmentsProps = {
  tabs: LibraryTab[];
  selected: LibraryTab;
  onSelect: (tab: LibraryTab) => void;
  fallback: ReactNode;
};

export function LibrarySegments({ fallback }: LibrarySegmentsProps) {
  return fallback;
}
