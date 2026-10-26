import { useEffect, useMemo } from 'react';
import { AppState } from 'react-native';
import { useAuthStore } from '@/stores/auth';
import { useS3Store } from '@/stores/s3';
import { useMyboxStore } from '@/stores/mybox';
import { useGoogleDriveStore } from '@/stores/google-drive';
import { useDriveDocumentsStore } from '@/stores/drive-documents';
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
  const myboxConnection = useMyboxStore(state => state.connection), myboxReady = useMyboxStore(state => state.ready);
  const bootstrapMybox = useMyboxStore(state => state.bootstrap);
  useEffect(() => { void bootstrapMybox(); }, [bootstrapMybox]);
  useEffect(() => { reconcilePlaybackVisibility(song => song.source === 'mybox' && (!myboxConnection || song.mybox.connectionId !== myboxConnection.id || !song.path?.startsWith(myboxConnection.folder))); }, [myboxConnection]);
  useEffect(() => { void bootstrapS3(); }, [bootstrapS3]);
  useEffect(() => { reconcilePlaybackVisibility(song => song.source === 's3' && (!s3Connection || song.s3.connectionId !== s3Connection.id || !song.s3.key.startsWith(s3Connection.prefix))); }, [s3Connection]);
  const driveAccountId = useGoogleDriveStore((state) => state.account?.id);
  const driveFiles = useGoogleDriveStore(state => state.files);
  const driveFileIds = useMemo(() => new Set(driveFiles?.map(file => file.id)), [driveFiles]);
  const driveReady = useGoogleDriveStore((state) => state.ready);
  const bootstrapDrive = useGoogleDriveStore((state) => state.bootstrap);
  useEffect(() => { void bootstrapDrive(); }, [bootstrapDrive]);
  useEffect(() => { reconcilePlaybackVisibility(song => song.source === 'drive' && !song.drive.documentUri && (song.drive.accountId !== driveAccountId || !driveFileIds.has(song.drive.fileId))); }, [driveAccountId, driveFileIds]);
  const documentSongs = useDriveDocumentsStore(state => state.songs), documentsReady = useDriveDocumentsStore(state => state.ready);
  const loadDocuments = useDriveDocumentsStore(state => state.load);
  const documentIds = useMemo(() => new Set(documentSongs.map(song => song.id)), [documentSongs]);
  useEffect(() => { void loadDocuments(); }, [loadDocuments]);
  useEffect(() => { if (documentsReady) reconcilePlaybackVisibility(song => song.source === 'drive' && !!song.drive.documentUri && !documentIds.has(song.id)); }, [documentsReady, documentIds]);
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
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') useHiddenMusicStore.getState().lock();
      if (state === 'active') {
        checkSleepTimer();
        const documents = useDriveDocumentsStore.getState();
        if (documents.ready && !documents.busy && documents.documents.length) void documents.load();
      }
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => { if (privacy.ready && privacy.scope === scope) reconcilePlaybackVisibility(); }, [privacy.ready, privacy.scope, privacy.profile.presets, scope]);
  return { ready, displayReady, privacy, scope, localReady, driveReady: driveReady && documentsReady, driveAccountId, s3Ready, myboxReady };
}
