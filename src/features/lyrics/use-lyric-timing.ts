import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth';
import { privacyScope } from '@/features/hidden-music/rules';
import { metadataKey } from '@/features/metadata/rules';
import { EMPTY_LYRIC_TIMING, useLyricsTimingStore } from '@/stores/lyrics-timing';
import type { Song } from '@/types/music';
import type { LyricsDocument } from '@/types/lyrics';

export function useLyricTiming(song: Song, provider: LyricsDocument['provider'] | undefined) {
  const mode = useAuthStore((state) => state.mode);
  const session = useAuthStore((state) => state.session);
  const songKey = metadataKey(song, privacyScope(mode, session));
  const key = songKey && provider ? JSON.stringify([songKey, provider]) : null;
  const entry = useLyricsTimingStore((state) =>
    key ? (state.entries[key] ?? EMPTY_LYRIC_TIMING) : EMPTY_LYRIC_TIMING,
  );
  const load = useLyricsTimingStore((state) => state.load);
  useEffect(() => {
    if (key) {
      void load(key);
    }
  }, [key, load]);
  return {
    ...entry,
    key,
    offsetMs: entry.ready && !entry.loadError ? entry.offsetMs : 0,
    adjust: (deltaMs: number) =>
      key ? useLyricsTimingStore.getState().adjust(key, deltaMs) : Promise.resolve(),
    reset: () => (key ? useLyricsTimingStore.getState().reset(key) : Promise.resolve()),
    reload: () => (key ? load(key, true) : Promise.resolve()),
  };
}
