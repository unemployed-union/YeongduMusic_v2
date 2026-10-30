import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { restorePlayback } from '@/services/playback/controller';
import { readRestoredPlayback, startPlaybackPersistence } from '@/services/playback/persistence';
import { usePlaybackStore } from '@/stores/playback';

type RecoveryReadiness = {
  ready: boolean;
  privacyReady: boolean;
  privacyScope: string | null;
  scope: string | null;
  localReady: boolean;
  driveReady: boolean;
  driveAccountId?: string;
  s3Ready: boolean;
  myboxReady?: boolean;
};

export function usePlaybackRecovery({
  ready,
  privacyReady,
  privacyScope,
  scope,
  localReady,
  driveReady,
  driveAccountId,
  s3Ready,
  myboxReady = true,
}: RecoveryReadiness) {
  const recoveryAttempted = useRef(false);
  useEffect(() => {
    if (
      !ready ||
      !privacyReady ||
      privacyScope !== scope ||
      !localReady ||
      !driveReady ||
      !s3Ready ||
      !myboxReady ||
      recoveryAttempted.current
    ) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const playback = usePlaybackStore.getState();
        if (playback.queue[playback.index]) {
          router.navigate(playback.playing ? '/player' : '/(tabs)/(library)');
          return;
        }
        const saved = await readRestoredPlayback();
        if (cancelled || !saved || usePlaybackStore.getState().queue.length) {
          return;
        }
        // A disk snapshot describes a past session, not a currently running player.
        // Restore the last song at zero without loading audio until the user presses play.
        const restored = await restorePlayback(
          saved.queue,
          saved.index,
          0,
          false,
          saved.shuffle,
          saved.repeat,
          saved.playbackRate,
          saved.preservePitch,
        );
        if (restored && !cancelled) {
          router.navigate(usePlaybackStore.getState().playing ? '/player' : '/(tabs)/(library)');
        }
      } catch {
        /* Playback recovery must not block the library. */
      } finally {
        if (!cancelled) {
          recoveryAttempted.current = true;
          // Activity removal can unmount this screen while audio keeps playing.
          // The idempotent recorder belongs to the playback runtime, not React.
          startPlaybackPersistence();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    ready,
    privacyReady,
    privacyScope,
    scope,
    localReady,
    driveReady,
    driveAccountId,
    s3Ready,
    myboxReady,
  ]);
}
