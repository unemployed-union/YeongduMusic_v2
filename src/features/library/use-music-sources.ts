import { useMemo } from 'react';
import { musicProviders } from '@/services/music-providers/registry';
import { useProviderStates } from './use-source-libraries';
import type { MusicSourceFilter } from '@/types/music';

// A saved connection remains selectable when its library is empty or offline.
export function useMusicSources(): MusicSourceFilter[] {
  const states = useProviderStates();
  return useMemo(
    () => [
      'all',
      ...musicProviders
        .filter((provider, index) => states[index].connected && states[index].selectable !== false)
        .map((provider) => provider.id),
    ],
    [states],
  );
}
