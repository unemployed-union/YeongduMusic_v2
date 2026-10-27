import type { ReactNode } from 'react';
import type { BlurArea } from '@/features/settings/blur-preferences';

// Metro resolves the native implementation exclusively on iOS.
export function LiquidGlassProvider({ children }: { children: ReactNode }) {
  return children;
}

export function useLiquidGlass(_area?: BlurArea) {
  return { supported: false, enabled: false, reduceTransparency: false };
}
