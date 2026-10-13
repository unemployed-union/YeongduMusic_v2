import type { QueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth';
import { useS3Store } from '@/stores/s3';
import { useGoogleDriveStore } from '@/stores/google-drive';
import { useLocalMusicStore } from '@/stores/local-music';
import { libraryIdentity, musicRepository } from './repository';
import { refreshLibrary } from './refresh-library';

export function captureRefreshContext() {
  const auth = useAuthStore.getState();
  const source = useLocalMusicStore.getState().source;
  const drive = useGoogleDriveStore.getState();
  const s3 = useS3Store.getState();
  return {
    mode: auth.mode, source, identity: libraryIdentity(auth.mode, auth.session),
    isCurrent: () => {
      const currentAuth = useAuthStore.getState(), currentDrive = useGoogleDriveStore.getState(), currentS3 = useS3Store.getState();
      return currentAuth.generation === auth.generation && currentAuth.mode === auth.mode && currentAuth.session === auth.session
        && useLocalMusicStore.getState().source === source
        && currentDrive.generation === drive.generation && currentDrive.account?.id === drive.account?.id && currentDrive.folders === drive.folders
        && currentS3.generation === s3.generation && currentS3.connection === s3.connection;
    },
  };
}

/** Refresh the selected sources; publication and notices require the original context. */
export async function refreshMusicLibrary(queryClient: QueryClient, context: ReturnType<typeof captureRefreshContext>, isActive = context.isCurrent): Promise<string | null> {
  const { source, mode, identity } = context;
  if (!isActive()) return null;
  let driveFailed = false, s3Failed = false;
  if ((source === 'all' || source === 'drive') && useGoogleDriveStore.getState().account) {
    try { await useGoogleDriveStore.getState().refresh(); } catch { driveFailed = true; }
    if (!isActive()) return null;
  }
  if ((source === 'all' || source === 's3') && useS3Store.getState().connection) {
    try { await useS3Store.getState().refresh(); } catch { s3Failed = true; }
    if (!isActive()) return null;
  }
  const cloudRetry = s3Failed ? 'S3' + (driveFailed ? ' · Google Drive' : '') : 'Google Drive';
  if (source === 's3' || source === 'drive') {
    await queryClient.invalidateQueries({ queryKey: ['local-library'] });
    if (!isActive() || (source === 's3' ? s3Failed : driveFailed)) return null;
    if (source === 's3') return useS3Store.getState().connection ? 'S3 음악 목록을 불러왔습니다.' : '설정에서 S3를 연결해 주세요.';
    const drive = useGoogleDriveStore.getState();
    return !drive.account ? '설정에서 Google Drive를 연결해 주세요.' : !drive.folders.length ? '설정에서 Google Drive 음악 폴더를 선택해 주세요.' : 'Google Drive 음악 목록을 불러왔습니다.';
  }
  await useLocalMusicStore.getState().load();
  if (!isActive()) return null;
  if (source === 'local' || mode === 'setup') {
    await queryClient.invalidateQueries({ queryKey: ['local-library'] });
    if (!isActive()) return null;
    return driveFailed || s3Failed ? '기기 목록을 갱신했습니다. ' + cloudRetry + '는 다시 시도해 주세요.' : '음악 목록을 불러왔습니다.';
  }
  const result = await refreshLibrary(queryClient, musicRepository({ allowCachedFallback: false }), identity, isActive);
  if (!result || !isActive()) return null;
  return driveFailed || s3Failed ? 'Audio Station 목록을 갱신했습니다. ' + cloudRetry + '는 다시 시도해 주세요.' : mode === 'mock' ? '데모 목록을 새로고침했습니다.' : 'Audio Station에서 음악 목록을 불러왔습니다.';
}
