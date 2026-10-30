import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { cachedArtworkColors, readArtworkColors } from '@/services/artwork/palette';
import {
  createArtworkGradient,
  DEFAULT_PLAYER_COLORS,
  type GradientColors,
} from '@/features/playback/artwork-colors';

export function useAlbumColors(
  uri: string | undefined,
  palette: readonly [string, string] | undefined,
  enabled: boolean,
) {
  const primary = palette?.[0];
  const secondary = palette?.[1];
  const [result, setResult] = useState<{ uri: string; colors: GradientColors | null } | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!enabled || !uri || cachedArtworkColors(uri) !== undefined) {
        return;
      }
      const controller = new AbortController();
      void readArtworkColors(uri, controller.signal).then(
        (colors) => {
          if (!controller.signal.aborted) {
            setResult({ uri, colors });
          }
        },
        () => {
          if (!controller.signal.aborted) {
            setResult({ uri, colors: null });
          }
        },
      );
      return () => controller.abort();
    }, [enabled, uri]),
  );
  const fallback =
    primary && secondary ? createArtworkGradient(primary, secondary) : DEFAULT_PLAYER_COLORS;
  const resolved =
    enabled && uri
      ? (cachedArtworkColors(uri) ?? (result?.uri === uri ? result.colors : undefined))
      : undefined;
  const ready = !enabled || !uri || cachedArtworkColors(uri) !== undefined || result?.uri === uri;
  return { colors: resolved ?? fallback, ready };
}
