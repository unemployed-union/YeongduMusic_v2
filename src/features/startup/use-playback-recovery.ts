import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { restorePlayback } from '@/services/playback/controller';
import { readRestoredPlayback, startPlaybackPersistence } from '@/services/playback/persistence';
import { usePlaybackStore } from '@/stores/playback';

type RecoveryReadiness = {
  ready: boolean; privacyReady: boolean; privacyScope: string | null; scope: string | null;
  localReady: boolean; driveReady: boolean; driveAccountId?: string; s3Ready: boolean;
};

export function usePlaybackRecovery({ ready, privacyReady, privacyScope, scope, localReady, driveReady, driveAccountId, s3Ready }: RecoveryReadiness) {
  const persistenceStop = useRef<(() => void) | null>(null);
  const recoveryAttempted = useRef(false);
  useEffect(() => {
    if (!ready || !privacyReady || privacyScope !== scope || !localReady || !driveReady || !s3Ready || recoveryAttempted.current) return;
    let cancelled = false;
    void (async () => {
      try {
        const playback = usePlaybackStore.getState();
        if (playback.queue[playback.index]) {
          router.navigate(playback.playing ? '/player' : '/(tabs)/(library)');
          return;
        }
        const saved = await readRestoredPlayback();
        if (cancelled || !saved || usePlaybackStore.getState().queue.length) return;
        const restored = await restorePlayback(saved.queue, saved.index, saved.position, saved.playing, saved.shuffle, saved.repeat);
        if (restored && !cancelled) router.navigate(usePlaybackStore.getState().playing ? '/player' : '/(tabs)/(library)');
      } catch { /* Playback recovery must not block the library. */ }
      finally {
        if (!cancelled) {
          recoveryAttempted.current = true;
          if (!persistenceStop.current) persistenceStop.current = startPlaybackPersistence();
        }
      }
    })();
    return () => { cancelled = true; };
  }, [ready, privacyReady, privacyScope, scope, localReady, driveReady, driveAccountId, s3Ready]);
  useEffect(() => () => { persistenceStop.current?.(); persistenceStop.current = null; }, []);
}
