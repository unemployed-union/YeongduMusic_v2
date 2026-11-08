import type { MusicProvider, ProviderState } from '@/services/music-providers/contracts';
import type { MusicSourceFilter, Song } from '@/types/music';
import type { DeviceLibraries } from './song-library';

const EMPTY_SONGS: readonly Song[] = [];

/** Keep catalog inputs stable when only request status or an unrelated source changes. */
export function createSourceLibrarySelection(
  providers: readonly Pick<MusicProvider, 'id' | 'catalog'>[],
) {
  let previous: DeviceLibraries | undefined;
  let previousStates: readonly ProviderState[] = [];
  let previousSource: MusicSourceFilter | undefined;

  return (states: readonly ProviderState[], source: MusicSourceFilter): DeviceLibraries => {
    const libraries: DeviceLibraries = {};
    let unchanged = previous !== undefined && source === previousSource;

    providers.forEach((provider, index) => {
      if (provider.catalog !== 'stored') {
        return;
      }

      const state = states[index];
      const selected = source === 'all' || source === provider.id;
      const songs = selected && state.connected ? state.songs : EMPTY_SONGS;
      const id = provider.id as keyof DeviceLibraries;
      libraries[id] = songs;

      const previousState = previousStates[index];
      const accountChanged =
        selected &&
        (state.connected !== previousState?.connected ||
          state.scope !== previousState?.scope ||
          state.generation !== previousState?.generation);

      if (previous?.[id] !== songs || accountChanged) {
        unchanged = false;
      }
    });

    previousStates = states;
    previousSource = source;
    if (unchanged && previous) {
      return previous;
    }

    previous = libraries;
    return libraries;
  };
}
