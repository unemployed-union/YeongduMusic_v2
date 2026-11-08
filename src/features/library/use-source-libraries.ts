import { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  musicProviders,
  providerSnapshots,
  subscribeProviders,
} from '@/services/music-providers/registry';
import { useLocalMusicStore } from '@/stores/local-music';
import { createSourceLibrarySelection } from './source-library-selection';
import type { MusicSourceFilter } from '@/types/music';
import { acquireProviderLibraries } from '@/services/music-providers/library-tasks';

export function useProviderStates() {
  return useSyncExternalStore(subscribeProviders, providerSnapshots, providerSnapshots);
}

export function useSourceLibraries(enabled = true, sourceOverride?: MusicSourceFilter) {
  const preferredSource = useLocalMusicStore((state) => state.source);
  const states = useProviderStates();
  const source = sourceOverride ?? preferredSource;
  const connectionKey = JSON.stringify(
    states.map((state) => [state.ready, state.connected, state.scope, state.generation]),
  );
  useEffect(() => {
    if (enabled) {
      return acquireProviderLibraries(source);
    }
  }, [enabled, source, connectionKey]);
  const selectLibraries = useMemo(() => createSourceLibrarySelection(musicProviders), []);
  const libraries = selectLibraries(states, source);
  const selected = states.filter(
    (state, index) =>
      musicProviders[index].catalog === 'stored' &&
      (source === 'all' || source === musicProviders[index].id),
  );
  return {
    preferredSource,
    libraries,
    ready: states.some(
      (state, index) => (source === 'all' || source === musicProviders[index].id) && state.ready,
    ),
    error: selected
      .map((state) => state.error)
      .filter(Boolean)
      .join('\n'),
    loading: selected.some((state) => state.loading),
    stale: selected.some((state) => state.connected && state.stale),
    pending: selected.some((state) => state.connected && state.loading && !state.songs.length),
  };
}
