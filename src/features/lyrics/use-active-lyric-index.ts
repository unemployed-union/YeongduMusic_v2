import { useEffect, useRef, useState } from 'react';
import { activeLyricIndex } from '@/services/lyrics/parse-lyrics';
import { getPlaybackPosition } from '@/services/playback/controller';
import { usePlaybackStore } from '@/stores/playback';
import type { LyricLine } from '@/types/lyrics';
import { usePlaybackVisibility } from '@/features/playback/use-playback-visibility';

export function useActiveLyricIndex(lines: LyricLine[], synced: boolean, offsetMs = 0): number {
  const visible = usePlaybackVisibility();
  const [active, setActive] = useState(() => synced ? activeLyricIndex(lines, usePlaybackStore.getState().position - offsetMs / 1000) : -1);
  const current = useRef(active);

  useEffect(() => {
    if (!visible) return;
    const update = () => {
      const state = usePlaybackStore.getState();
      const next = synced ? activeLyricIndex(lines, (state.buffering ? state.position : getPlaybackPosition()) - offsetMs / 1000) : -1;
      if (next === current.current) return;
      current.current = next; setActive(next);
    };
    update();
    if (!synced) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const manageTimer = () => {
      const state = usePlaybackStore.getState();
      if (state.playing && !state.buffering) {
        if (timer === null) timer = setInterval(update, 100);
      } else if (timer !== null) { clearInterval(timer); timer = null; }
    };
    // Observe engine status without subscribing React to every position update.
    // A seek/pause/buffer event updates the line immediately; ordinary samples
    // do not render the list or restart its polling timer.
    const unsubscribe = usePlaybackStore.subscribe((state, previous) => {
      if (state.position !== previous.position || state.playing !== previous.playing || state.buffering !== previous.buffering) update();
      if (state.playing !== previous.playing || state.buffering !== previous.buffering) manageTimer();
    });
    manageTimer();
    return () => { unsubscribe(); if (timer !== null) clearInterval(timer); };
  }, [lines, synced, offsetMs, visible]);

  return active;
}
