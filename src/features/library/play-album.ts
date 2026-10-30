import { playQueue } from '@/services/playback/controller';
import type { Song } from '@/types/music';

// Use the same complete, sorted album selection that the screen displays.
export async function playAlbum(songs: Song[], index = 0): Promise<void> {
  if (!songs.length) {
    throw new Error('재생할 곡이 없습니다.');
  }
  await playQueue(songs, index);
}
