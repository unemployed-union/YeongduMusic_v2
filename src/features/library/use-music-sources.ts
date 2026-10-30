import { useMemo } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useGoogleDriveStore } from '@/stores/google-drive';
import { useDriveDocumentsStore } from '@/stores/drive-documents';
import { useS3Store } from '@/stores/s3';
import { useMyboxStore } from '@/stores/mybox';
import type { MusicSourceFilter } from '@/types/music';

// Use existing connection state, without network probes or library scans.
export function useMusicSources(): MusicSourceFilter[] {
  const nas = useAuthStore((state) => state.mode === 'nas' && state.session !== null);
  const drive = useGoogleDriveStore((state) => state.account !== null);
  const documents = useDriveDocumentsStore((state) => state.songs.length > 0);
  const s3 = useS3Store((state) => state.connection !== null);
  const mybox = useMyboxStore((state) => state.connection !== null);
  const hasDrive = drive || documents;
  return useMemo(() => {
    const sources: MusicSourceFilter[] = ['all'];
    if (nas) {
      sources.push('nas');
    }
    sources.push('local');
    if (hasDrive) {
      sources.push('drive');
    }
    if (s3) {
      sources.push('s3');
    }
    if (mybox) {
      sources.push('mybox');
    }
    return sources;
  }, [nas, hasDrive, s3, mybox]);
}
