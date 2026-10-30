import { useMemo } from 'react';
import { useLocalMusicStore } from '@/stores/local-music';
import { useGoogleDriveStore } from '@/stores/google-drive';
import { useDriveDocumentsStore } from '@/stores/drive-documents';
import { useS3Store } from '@/stores/s3';
import { useMyboxStore } from '@/stores/mybox';

export function useSourceLibraries() {
  const preferredSource = useLocalMusicStore((state) => state.source);
  const local = useLocalMusicStore((state) => state.songs);
  const localReady = useLocalMusicStore((state) => state.ready);
  const apiSongs = useGoogleDriveStore((state) => state.songs);
  const documents = useDriveDocumentsStore((state) => state.songs);
  const documentsReady = useDriveDocumentsStore((state) => state.ready);
  const documentError = useDriveDocumentsStore((state) => state.error);
  const drive = useMemo(() => [...apiSongs, ...documents], [apiSongs, documents]);
  const driveLoading = useGoogleDriveStore((state) => state.loading);
  const driveError = useGoogleDriveStore((state) => state.error);
  const s3 = useS3Store((state) => state.songs);
  const s3Loading = useS3Store((state) => state.loading);
  const s3Error = useS3Store((state) => state.error);
  const mybox = useMyboxStore((state) => state.songs);
  const myboxLoading = useMyboxStore((state) => state.loading || state.busy);
  const myboxError = useMyboxStore((state) => state.error);
  const libraries = useMemo(() => ({ local, drive, s3, mybox }), [local, drive, s3, mybox]);
  return {
    preferredSource,
    libraries,
    ready: localReady && documentsReady,
    driveLoading,
    driveError,
    documentError,
    s3Loading,
    s3Error,
    myboxLoading,
    myboxError,
  };
}
