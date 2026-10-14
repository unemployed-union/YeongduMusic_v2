import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { readArtworkColors } from '@/services/artwork/palette';
import { createArtworkGradient, DEFAULT_PLAYER_COLORS, type GradientColors } from '@/features/playback/artwork-colors';

export function useAlbumColors(uri: string | undefined, palette: readonly [string, string] | undefined, enabled: boolean) {
  const primary = palette?.[0], secondary = palette?.[1];
  const [result, setResult] = useState<{ uri: string; colors: GradientColors } | null>(null);
  useFocusEffect(useCallback(() => {
    if (!enabled || !uri) return;
    const controller = new AbortController();
    void readArtworkColors(uri, controller.signal).then(colors => {
      if (colors && !controller.signal.aborted) setResult({ uri, colors });
    }, () => {});
    return () => controller.abort();
  }, [enabled, uri]));
  const fallback = primary && secondary ? createArtworkGradient(primary, secondary) : DEFAULT_PLAYER_COLORS;
  return enabled && uri && result?.uri === uri ? result.colors : fallback;
}
