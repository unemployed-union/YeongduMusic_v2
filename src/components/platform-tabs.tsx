import type { ComponentType } from 'react';

export type PlatformTabsProps = { fallback: ComponentType };

export function PlatformTabs({ fallback: Fallback }: PlatformTabsProps) {
  return <Fallback />;
}
