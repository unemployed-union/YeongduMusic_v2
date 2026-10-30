import { useS3Store } from '@/stores/s3';
import { useMyboxStore } from '@/stores/mybox';
import { useGoogleDriveStore } from '@/stores/google-drive';
import { useDriveDocumentsStore } from '@/stores/drive-documents';
import type { MusicSourceFilter } from '@/types/music';

export async function refreshSelectedCloudLibraries(
  source: MusicSourceFilter,
  isActive: () => boolean,
) {
  let driveFailed = false,
    s3Failed = false,
    myboxFailed = false;
  if (source === 'all' || source === 'drive') {
    await useDriveDocumentsStore.getState().load();
    driveFailed = !!useDriveDocumentsStore.getState().error;
    if (!isActive()) return null;
  }
  if ((source === 'all' || source === 'mybox') && useMyboxStore.getState().connection) {
    try {
      await useMyboxStore.getState().refresh();
    } catch {
      myboxFailed = true;
    }
    if (!isActive()) return null;
  }
  if (source === 'mybox') return { driveFailed, s3Failed, myboxFailed };
  if ((source === 'all' || source === 'drive') && useGoogleDriveStore.getState().account) {
    try {
      await useGoogleDriveStore.getState().refresh();
    } catch {
      driveFailed = true;
    }
    if (!isActive()) return null;
  }
  if ((source === 'all' || source === 's3') && useS3Store.getState().connection) {
    try {
      await useS3Store.getState().refresh();
    } catch {
      s3Failed = true;
    }
    if (!isActive()) return null;
  }
  return { driveFailed, s3Failed, myboxFailed };
}
