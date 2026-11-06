import { useEffect } from 'react';
import { musicProviders } from '@/services/music-providers/registry';
import { useProviderStates } from '@/features/library/use-source-libraries';
import { reconcilePlaybackVisibility } from '@/services/playback/controller';

export function useMusicSourceBootstrap() {
  const states = useProviderStates();
  useEffect(() => {
    for (const provider of musicProviders) {
      void provider.bootstrap().catch(() => {});
    }
  }, []);
  useEffect(() => {
    reconcilePlaybackVisibility((song) => {
      const provider = musicProviders.find((item) => item.id === (song.source ?? 'nas'));
      return (
        !!provider && provider.id !== 'nas' && provider.getState().ready && !provider.restore(song)
      );
    });
  }, [states]);
  const state = (id: string) => states[musicProviders.findIndex((provider) => provider.id === id)];
  return {
    localReady: state('local').ready,
    driveReady: state('drive').ready,
    driveAccountId: state('drive').connected ? state('drive').scope : undefined,
    s3Ready: state('s3').ready,
    myboxReady: state('mybox').ready,
    jellyfinReady: state('jellyfin').ready,
  };
}
