import { useHapticPreferences } from '@/stores/haptic-preferences';
import type { HapticKind } from '@/features/haptics/preferences';

let native: Promise<typeof import('expo-haptics') | null> | null = null;
const lastFeedback = new Map<HapticKind, number>();
const moduleReady = () => native ??= import('expo-haptics').catch(() => null);
export function prepareHaptics(): void {
  void useHapticPreferences.getState().load();
  void moduleReady();
}

/** Feedback never delays an interaction or rejects into UI event handlers. */
export function playHaptic(kind: HapticKind): void {
  const state = useHapticPreferences.getState();
  if (!state.ready || state.loading || state.loadError || !state.preferences.enabled || !state.preferences.events[kind].enabled) return;
  const now = Date.now(), last = lastFeedback.get(kind);
  if (last !== undefined && now - last < 80) return;
  lastFeedback.set(kind, now);
  void moduleReady().then(async haptics => {
    const live = useHapticPreferences.getState();
    if (!haptics || !live.ready || live.loading || live.loadError || !live.preferences.enabled || !live.preferences.events[kind].enabled) return;
    const strength = live.preferences.events[kind].strength;
    const style = strength === 'light' ? haptics.ImpactFeedbackStyle.Light : strength === 'medium' ? haptics.ImpactFeedbackStyle.Medium : haptics.ImpactFeedbackStyle.Heavy;
    await haptics.impactAsync(style);
  }).catch(() => {});
}
