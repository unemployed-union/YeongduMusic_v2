import type { MusicSourceFilter } from '@/types/music';
import { musicProviders } from './registry';
import { storedLibraryTask } from './stored-library-task';

/** A completed task retains timestamps; only active consumers own timers and requests. */
export function acquireProviderLibraries(source: MusicSourceFilter): () => void {
  const releases = musicProviders.filter((provider) => {
    const state = provider.getState();
    return (source === 'all' || source === provider.id) && provider.catalog === 'stored' &&
      provider.id !== 'local' && state.ready && state.connected;
  }).map((provider) => storedLibraryTask(provider).acquire());
  return () => releases.forEach((release) => release());
}

export { refreshStoredLibrary, markStoredLibraryDirty } from './stored-library-task';
