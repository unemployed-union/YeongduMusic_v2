import type { Song } from '@/types/music';

/** Keep the selected occurrence stable even when the queue contains duplicate IDs. */
export function filterPlaybackQueue(
  queue: Song[],
  index: number,
  include: (song: Song) => boolean,
) {
  const current = queue[index];
  return {
    queue: queue.filter(include),
    index: current ? queue.slice(0, index).filter(include).length : -1,
  };
}
