import { useEffect, useMemo } from 'react';
import { AppState } from 'react-native';
import { useAuthStore } from '@/stores/auth';
import { useS3Store } from '@/stores/s3';
import { useGoogleDriveStore } from '@/stores/google-drive';
import { useLocalMusicStore } from '@/stores/local-music';
import { useDisplayPreferences } from '@/stores/display-preferences';
import { useLibraryPreferences } from '@/stores/library-preferences';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import { usePlaylistStore } from '@/stores/playlists';
import { privacyScope } from '@/features/hidden-music/rules';
import { checkSleepTimer, reconcilePlaybackVisibility } from '@/services/playback/controller';

export function useAppBootstrap() {
  const { ready, mode, session, bootstrap } = useAuthStore();
  const displayReady = useDisplayPreferences((state) => state.ready);
  const loadDisplayPreferences = useDisplayPreferences((state) => state.load);
  useEffect(() => { void loadDisplayPreferences(); }, [loadDisplayPreferences]);
  const loadLibraryPreferences = useLibraryPreferences((state) => state.load);
  useEffect(() => { void loadLibraryPreferences(); }, [loadLibraryPreferences]);
  const privacy = useHiddenMusicStore();
  const loadPrivacy = privacy.load;
  const loadPlaylists = usePlaylistStore((state) => state.load);
  const scope = privacyScope(mode, session);
  const s3Connection = useS3Store(state => state.connection);
  const s3Ready = useS3Store(state => state.ready);
  const bootstrapS3 = useS3Store(state => state.bootstrap);
  useEffect(() => { void bootstrapS3(); }, [bootstrapS3]);
  useEffect(() => { reconcilePlaybackVisibility(song => song.source === 's3' && (!s3Connection || song.s3.connectionId !== s3Connection.id || !song.s3.key.startsWith(s3Connection.prefix))); }, [s3Connection]);
  const driveAccountId = useGoogleDriveStore((state) => state.account?.id);
  const driveReady = useGoogleDriveStore((state) => state.ready);
  const bootstrapDrive = useGoogleDriveStore((state) => state.bootstrap);
  useEffect(() => { void bootstrapDrive(); }, [bootstrapDrive]);
  useEffect(() => { reconcilePlaybackVisibility(song => song.source === 'drive' && song.drive.accountId !== driveAccountId); }, [driveAccountId]);
  const loadLocalMusic = useLocalMusicStore((state) => state.load);
  const allLocalSongs = useLocalMusicStore((state) => state.allSongs);
  const localSongs = useLocalMusicStore((state) => state.songs);
  const localReady = useLocalMusicStore((state) => state.ready);
  const excludedLocalIds = useMemo(() => {
    const visibleIds = new Set(localSongs.map(song => song.id));
    return new Set(allLocalSongs.filter(song => !visibleIds.has(song.id)).map(song => song.id));
  }, [allLocalSongs, localSongs]);
  useEffect(() => { reconcilePlaybackVisibility(song => song.source === 'local' && excludedLocalIds.has(song.id)); }, [excludedLocalIds]);
  useEffect(() => { void loadLocalMusic(); }, [loadLocalMusic]);
  useEffect(() => { void bootstrap(); }, [bootstrap]);
  useEffect(() => { if (ready && mode === 'setup') reconcilePlaybackVisibility(); }, [ready, mode]);
  useEffect(() => {
    const current = useHiddenMusicStore.getState();
    // Android recreates the React tree after dismissing the activity. Reloading
    // the same profile temporarily clears ready and can stop the live player.
    if (ready && !(current.ready && current.scope === scope)) void loadPrivacy(scope);
  }, [ready, scope, loadPrivacy]);
  useEffect(() => { if (ready) void loadPlaylists(scope); }, [ready, scope, loadPlaylists]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'background') useHiddenMusicStore.getState().lock(); if (state === 'active') checkSleepTimer(); });
    return () => subscription.remove();
  }, []);
  useEffect(() => { if (privacy.ready && privacy.scope === scope) reconcilePlaybackVisibility(); }, [privacy.ready, privacy.scope, privacy.profile.presets, scope]);
  return { ready, displayReady, privacy, scope, localReady, driveReady, driveAccountId, s3Ready };
}
