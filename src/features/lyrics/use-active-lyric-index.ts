import { useEffect, useState } from 'react';
import { activeLyricIndex } from '@/services/lyrics/parse-lyrics';
import { getPlaybackPosition } from '@/services/playback/controller';
import { usePlaybackStore } from '@/stores/playback';
import type { LyricLine } from '@/types/lyrics';

export function useActiveLyricIndex(lines: LyricLine[], synced: boolean): number {
  const position = usePlaybackStore((state) => state.position);
  const playing = usePlaybackStore((state) => state.playing);
  const buffering = usePlaybackStore((state) => state.buffering);
  const [active, setActive] = useState(() => synced ? activeLyricIndex(lines, position) : -1);

  useEffect(() => {
    const update = () => setActive(synced ? activeLyricIndex(lines, buffering ? position : getPlaybackPosition()) : -1);
    update();
    if (!synced || !playing || buffering) return;
    // Only mounted synchronized lyrics poll. Same-index updates bail out, so
    // the list renders at line boundaries rather than on every clock sample.
    const timer = setInterval(update, 100);
    return () => clearInterval(timer);
  }, [lines, synced, position, playing, buffering]);

  return active;
}
