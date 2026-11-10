import type { MusicProvider } from './contracts';
import type { Song } from '@/types/music';

export function createDeletionTracker() {
  let previous: readonly Song[] = [];
  const missing = new Map<string, number>();
  return {
    baseline(songs: readonly Song[]) {
      previous = songs;
    },
    compare(songs: readonly Song[]): Set<string> {
      const ids = new Set(songs.map((song) => song.id));
      for (const song of previous) {
        if (!ids.has(song.id) && !missing.has(song.id)) {
          missing.set(song.id, 0);
        }
      }
      const deleted = new Set<string>();
      for (const [id, count] of missing) {
        if (ids.has(id)) {
          missing.delete(id);
        } else {
          missing.set(id, count + 1);
          if (count >= 1) {
            deleted.add(id);
          }
        }
      }
      previous = songs;
      return deleted;
    },
  };
}

export async function removeDeletedFutureSongs(provider: MusicProvider, ids: ReadonlySet<string>): Promise<void> {
  if (!ids.size) {
    return;
  }
  const { usePlaybackStore } = await import('@/stores/playback');
  const scope = provider.getState().scope;
  usePlaybackStore.setState((state) => {
    const queue = state.queue.filter((song, index) => index <= state.index ||
      (song.source === 'drive' && !!song.drive.documentUri) ||
      (song.source ?? 'nas') !== provider.id ||
      (song.ref && song.ref.accountScope !== scope) || !ids.has(song.id));
    return queue.length === state.queue.length ? state : { queue };
  });
}
