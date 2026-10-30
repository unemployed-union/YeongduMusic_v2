import { useMusicSourceBootstrap } from './use-music-source-bootstrap';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAuthStore } from '@/stores/auth';
import { useDriveDocumentsStore } from '@/stores/drive-documents';
import { useDisplayPreferences } from '@/stores/display-preferences';
import { usePlaybackPreferences } from '@/stores/playback-preferences';
import { useLibraryPreferences } from '@/stores/library-preferences';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import { usePlaylistStore } from '@/stores/playlists';
import { privacyScope } from '@/features/hidden-music/rules';
import { checkSleepTimer, reconcilePlaybackVisibility } from '@/services/playback/controller';

export function useAppBootstrap() {
  const { ready, mode, session, bootstrap } = useAuthStore();
  const displayReady = useDisplayPreferences((state) => state.ready);
  const loadDisplayPreferences = useDisplayPreferences((state) => state.load);
  useEffect(() => {
    void loadDisplayPreferences();
  }, [loadDisplayPreferences]);
  const loadPlaybackPreferences = usePlaybackPreferences((state) => state.load);
  useEffect(() => {
    void loadPlaybackPreferences();
  }, [loadPlaybackPreferences]);
  const loadLibraryPreferences = useLibraryPreferences((state) => state.load);
  useEffect(() => {
    void loadLibraryPreferences();
  }, [loadLibraryPreferences]);
  const privacy = useHiddenMusicStore();
  const loadPrivacy = privacy.load;
  const loadPlaylists = usePlaylistStore((state) => state.load);
  const scope = privacyScope(mode, session);
  const sources = useMusicSourceBootstrap();
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);
  useEffect(() => {
    if (ready && mode === 'setup') {
      reconcilePlaybackVisibility();
    }
  }, [ready, mode]);
  useEffect(() => {
    const current = useHiddenMusicStore.getState();
    // Android recreates the React tree after dismissing the activity. Reloading
    // the same profile temporarily clears ready and can stop the live player.
    if (ready && !(current.ready && current.scope === scope)) {
      void loadPrivacy(scope);
    }
  }, [ready, scope, loadPrivacy]);
  useEffect(() => {
    if (ready) {
      void loadPlaylists(scope);
    }
  }, [ready, scope, loadPlaylists]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        useHiddenMusicStore.getState().lock();
      }
      if (state === 'active') {
        checkSleepTimer();
        const documents = useDriveDocumentsStore.getState();
        if (documents.ready && !documents.busy && documents.documents.length) {
          void documents.load();
        }
      }
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (privacy.ready && privacy.scope === scope) {
      reconcilePlaybackVisibility();
    }
  }, [privacy.ready, privacy.scope, privacy.profile.presets, scope]);
  return { ready, displayReady, privacy, scope, ...sources };
}
