import { createSerialQueue } from '@/services/async/serial-queue';
import { create } from 'zustand';
import {
  documentSong,
  driveDocumentPermissions,
  persistDriveDocuments,
  pickDriveDocuments,
  readDriveDocuments,
  releaseDriveDocuments,
  writeDriveDocuments,
  type DriveDocument,
} from '@/services/google-drive/documents';
import type { Song } from '@/types/music';

type State = {
  ready: boolean;
  busy: boolean;
  revision: number;
  documents: DriveDocument[];
  songs: Song[];
  error: string | null;
  message: string | null;
  load: () => Promise<void>;
  add: () => Promise<void>;
  remove: (id: string) => Promise<void>;
};
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'Drive 파일에 접근하지 못했습니다. 파일 앱에서 다시 선택해 주세요.';
const { run: exclusive } = createSerialQueue();
export const useDriveDocumentsStore = create<State>((set, get) => {
  function publish(documents: DriveDocument[], grants: string[]) {
    const allowed = new Set(grants);
    const available = documents.filter((item) => allowed.has(item.uri));
    const missing = documents.length - available.length;
    const songs = available.map(documentSong);
    set((state) => {
      const changed =
        JSON.stringify(state.documents) !== JSON.stringify(documents) ||
        state.songs.map((item) => item.id).join() !== songs.map((item) => item.id).join();
      return {
        ready: true,
        documents: changed ? documents : state.documents,
        songs: changed ? songs : state.songs,
        revision: state.revision + (changed ? 1 : 0),
        message: missing
          ? `${missing}곡의 읽기 권한이 해제되었습니다. 파일 앱에서 다시 선택해 주세요.`
          : null,
      };
    });
  }
  return {
    ready: false,
    busy: false,
    revision: 0,
    documents: [],
    songs: [],
    error: null,
    message: null,
    load: () =>
      exclusive(async () => {
        try {
          const documents = await readDriveDocuments();
          const grants = documents.length ? await driveDocumentPermissions() : [];
          publish(documents, grants);
          set({ error: null });
        } catch (error) {
          set({ ready: true, error: message(error) });
        }
      }),
    add: async () => {
      if (get().busy) {
        return;
      }
      set({ busy: true, error: null, message: null });
      try {
        await exclusive(async () => {
          // Read first so a failed/corrupt load can never overwrite stored selections.
          const previous = await readDriveDocuments();
          const picked = await pickDriveDocuments();
          if (!picked) {
            return;
          }
          const before = new Set(await driveDocumentPermissions());
          const previousIds = new Set(previous.map((item) => item.id));
          const merged = new Map(previous.map((item) => [item.id, item]));
          picked.documents.forEach((item) => merged.set(item.id, item));
          const documents = [...merged.values()];
          if (documents.length > 10000) {
            throw new Error('선택한 음악은 최대 10,000개까지 저장할 수 있습니다.');
          }
          await persistDriveDocuments(picked.documents);
          let grants: string[];
          try {
            grants = await driveDocumentPermissions();
            const granted = new Set(grants);
            if (picked.documents.some((item) => !granted.has(item.uri))) {
              throw new Error('선택한 파일의 읽기 권한을 유지하지 못했습니다. 다시 선택해 주세요.');
            }
            await writeDriveDocuments(documents);
          } catch (error) {
            await releaseDriveDocuments(
              picked.documents.map((item) => item.uri).filter((uri) => !before.has(uri)),
            ).catch(() => {});
            throw error;
          }
          publish(documents, grants);
          const added = picked.documents.filter((item) => !previousIds.has(item.id)).length;
          const warning = get().message;
          set({
            message: `${added}곡 추가 · 음원은 기기에 별도 보관하지 않습니다.${picked.skipped ? ` Drive 음악이 아닌 ${picked.skipped}개 항목은 제외했습니다.` : ''}${warning ? ` ${warning}` : ''}`,
          });
        });
      } catch (error) {
        set({ error: message(error) });
      } finally {
        set({ busy: false });
      }
    },
    remove: async (id) => {
      if (get().busy) {
        return;
      }
      set({ busy: true, error: null, message: null });
      try {
        await exclusive(async () => {
          const previous = await readDriveDocuments();
          const removed = previous.find((item) => item.id === id);
          if (!removed) {
            return;
          }
          const documents = previous.filter((item) => item.id !== id);
          const grants = await driveDocumentPermissions();
          await writeDriveDocuments(documents);
          publish(documents, grants);
          // Unpublish first: even failed grant cleanup cannot play a removed item.
          await releaseDriveDocuments([removed.uri]);
        });
      } catch (error) {
        set({ error: message(error) });
      } finally {
        set({ busy: false });
      }
    },
  };
});
export async function driveDocumentSource(song: Song): Promise<{ uri: string }> {
  if (song.source !== 'drive' || !song.drive.documentUri || song.drive.accountId !== 'saf') {
    throw new Error('Drive 파일 선택 정보가 올바르지 않습니다.');
  }
  if (!useDriveDocumentsStore.getState().ready) {
    await useDriveDocumentsStore.getState().load();
  }
  const selected = () =>
    useDriveDocumentsStore
      .getState()
      .documents.some(
        (item) =>
          'drive:saf:' + item.id === song.id &&
          item.id === song.drive.fileId &&
          item.uri === song.drive.documentUri,
      );
  const grants = await driveDocumentPermissions();
  if (!selected() || !grants.includes(song.drive.documentUri)) {
    throw new Error(
      'Drive 파일의 읽기 권한이 없거나 목록에서 제외되었습니다. 파일 앱에서 다시 선택해 주세요.',
    );
  }
  return { uri: song.drive.documentUri };
}
