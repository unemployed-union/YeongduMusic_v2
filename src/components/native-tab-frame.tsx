import type { ReactNode } from 'react';
import type { BottomMenuId } from '@/features/settings/menu-layout';

export type NativeTabFrameProps = { children: ReactNode; active: BottomMenuId; detail?: { name: string; key?: string } };

export function NativeTabFrame({ children }: NativeTabFrameProps) {
  return children;
}
