import { useDriveDocumentsStore } from '@/stores/drive-documents';
import { useLocalMusicStore } from '@/stores/local-music';

export async function addDriveDocuments(blocked: boolean) {
  const documents = useDriveDocumentsStore.getState();
  if (blocked || documents.busy) {
    return;
  }
  const revision = documents.revision;
  await documents.add();
  const current = useDriveDocumentsStore.getState();
  if (!current.error && current.revision !== revision && current.songs.length) {
    useLocalMusicStore.getState().setSource('drive');
  }
}
