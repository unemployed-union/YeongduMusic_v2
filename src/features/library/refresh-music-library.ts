import { refreshSelectedCloudLibraries } from './refresh-source-libraries';
import type { QueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth';
import { useS3Store } from '@/stores/s3';
import { useMyboxStore } from '@/stores/mybox';
import { useGoogleDriveStore } from '@/stores/google-drive';
import { useDriveDocumentsStore } from '@/stores/drive-documents';
import { useLocalMusicStore } from '@/stores/local-music';
import { libraryIdentity, musicRepository } from './repository';
import { refreshLibrary } from './refresh-library';

export function captureRefreshContext() {
  const auth = useAuthStore.getState();
  const source = useLocalMusicStore.getState().source;
  const drive = useGoogleDriveStore.getState();
  const documentRevision = useDriveDocumentsStore.getState().revision;
  const s3 = useS3Store.getState();
  const mybox = useMyboxStore.getState();
  return {
    mode: auth.mode,
    source,
    identity: libraryIdentity(auth.mode, auth.session),
    isCurrent: () => {
      const currentAuth = useAuthStore.getState();
      const currentDrive = useGoogleDriveStore.getState();
      const currentS3 = useS3Store.getState();
      return (
        currentAuth.generation === auth.generation &&
        currentAuth.mode === auth.mode &&
        currentAuth.session === auth.session &&
        useLocalMusicStore.getState().source === source &&
        currentDrive.generation === drive.generation &&
        currentDrive.account?.id === drive.account?.id &&
        currentDrive.files === drive.files &&
        useDriveDocumentsStore.getState().revision === documentRevision &&
        currentS3.generation === s3.generation &&
        currentS3.connection === s3.connection &&
        useMyboxStore.getState().generation === mybox.generation &&
        useMyboxStore.getState().connection === mybox.connection
      );
    },
  };
}

/** Refresh the selected sources; publication and notices require the original context. */
export async function refreshMusicLibrary(
  queryClient: QueryClient,
  context: ReturnType<typeof captureRefreshContext>,
  isActive = context.isCurrent,
): Promise<string | null> {
  const { source, mode, identity } = context;
  if (!isActive()) {
    return null;
  }
  const cloudResult = await refreshSelectedCloudLibraries(source, isActive);
  if (!cloudResult) {
    return null;
  }
  const { driveFailed, s3Failed, myboxFailed } = cloudResult;
  if (source === 'mybox') {
    await queryClient.invalidateQueries({ queryKey: ['local-library'] });
    if (!isActive() || myboxFailed) {
      return null;
    }
    return useMyboxStore.getState().connection
      ? 'MYBOX 음악 목록을 불러왔습니다.'
      : '설정에서 MYBOX를 연결해 주세요.';
  }
  const cloudRetry = [myboxFailed && 'MYBOX', s3Failed && 'S3', driveFailed && 'Google Drive']
    .filter(Boolean)
    .join(' · ');
  if (source === 's3' || source === 'drive') {
    await queryClient.invalidateQueries({ queryKey: ['local-library'] });
    if (!isActive() || (source === 's3' ? s3Failed : driveFailed)) {
      return null;
    }
    if (source === 's3') {
      return useS3Store.getState().connection
        ? 'S3 음악 목록을 불러왔습니다.'
        : '설정에서 S3를 연결해 주세요.';
    }
    const drive = useGoogleDriveStore.getState();
    if (useDriveDocumentsStore.getState().songs.length) {
      return 'Google Drive 음악 목록과 파일 읽기 권한을 확인했습니다.';
    }
    if (useDriveDocumentsStore.getState().documents.length) {
      return '파일 앱에서 Google Drive 음원을 다시 선택해 읽기 권한을 복원해 주세요.';
    }
    return !drive.account || !drive.files.length
      ? '설정에서 Google Drive 음원을 선택해 주세요.'
      : 'Google Drive 음악 목록을 불러왔습니다.';
  }
  await useLocalMusicStore.getState().load();
  if (!isActive()) {
    return null;
  }
  if (source === 'local' || mode === 'setup') {
    await queryClient.invalidateQueries({ queryKey: ['local-library'] });
    if (!isActive()) {
      return null;
    }
    return driveFailed || s3Failed || myboxFailed
      ? '기기 목록을 갱신했습니다. ' + cloudRetry + '는 다시 시도해 주세요.'
      : '음악 목록을 불러왔습니다.';
  }
  const result = await refreshLibrary(
    queryClient,
    musicRepository({ allowCachedFallback: false }),
    identity,
    isActive,
  );
  if (!result || !isActive()) {
    return null;
  }
  if (driveFailed || s3Failed || myboxFailed) {
    return 'Audio Station 목록을 갱신했습니다. ' + cloudRetry + '는 다시 시도해 주세요.';
  } else if (mode === 'mock') {
    return '데모 목록을 새로고침했습니다.';
  } else {
    return 'Audio Station에서 음악 목록을 불러왔습니다.';
  }
}
