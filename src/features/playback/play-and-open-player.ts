import { router } from 'expo-router';
import { playQueue } from '@/services/playback/controller';
import { usePlaybackStore } from '@/stores/playback';
import { playHaptic } from '@/services/haptics';
import type { Song } from '@/types/music';

// Queue selection stays in the playback controller; navigation belongs to this UI action.
export async function playAndOpenPlayer(songs: Song[], index = 0): Promise<void> {
  const selected = songs[index];
  if (!selected) return;
  playHaptic('playback');
  await playQueue(songs, index);
  const state = usePlaybackStore.getState();
  // Hidden tracks, logout or a newer selection may cancel the requested playback.
  if (state.queue[state.index]?.id === selected.id) router.navigate('/player');
}
