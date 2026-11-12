import { useState } from 'react';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import { usePlaylistStore } from '@/stores/playlists';

export function useHiddenPlaylistManager() {
  const privacy = useHiddenMusicStore();
  const store = usePlaylistStore();
  const [error, setError] = useState<string | null>(null);
  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '변경하지 못했습니다. 다시 시도해 주세요.');
    }
  }
  return { privacy, store, error, run };
}
