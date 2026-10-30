import { applyMetadata, metadataKey, type MetadataPatches } from '@/features/metadata/rules';
import type { Song } from '@/types/music';

export function mergeDriveQueueMetadata(
  queue: Song[],
  updated: Song[],
  patches: MetadataPatches,
): Song[] {
  const metadata = new Map(updated.map((song) => [song.id, song]));
  return queue.map((song) => {
    const latest = metadata.get(song.id);
    if (!latest || song.source !== 'drive') {
      return song;
    }
    const key = metadataKey(latest, null);
    return applyMetadata(
      { ...latest, duration: latest.duration || song.duration },
      key ? patches[key] : undefined,
    );
  });
}
