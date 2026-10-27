import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useBlurPreferences } from '@/stores/blur-preferences';
import type { BlurArea } from '@/features/settings/blur-preferences';

const GlassContext = createContext({ supported: false, reduceTransparency: true });

export function LiquidGlassProvider({ children }: { children: ReactNode }) {
  const [supported] = useState(() => Number.parseInt(String(Platform.Version), 10) >= 26
    && isGlassEffectAPIAvailable() && isLiquidGlassAvailable());
  const [reduceTransparency, setReduceTransparency] = useState(true);
  useEffect(() => {
    let active = true, changed = false;
    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', reduceTransparency => {
      changed = true;
      setReduceTransparency(reduceTransparency);
    });
    void AccessibilityInfo.isReduceTransparencyEnabled().then(reduceTransparency => {
      if (active && !changed) setReduceTransparency(reduceTransparency);
    }).catch(() => {}); // Keep opaque surfaces if the accessibility query fails.
    return () => { active = false; subscription.remove(); };
  }, []);
  return <GlassContext.Provider value={{ supported, reduceTransparency }}>{children}</GlassContext.Provider>;
}

export function useLiquidGlass(area?: BlurArea) {
  const state = useContext(GlassContext);
  const allowed = useBlurPreferences(preferences => preferences.ready && !preferences.loadError
    && preferences.enabled && (!area || preferences.areas[area].enabled));
  return { ...state, enabled: state.supported && !state.reduceTransparency && allowed };
}
