import { loadDriveSongs, type DriveFile, type TokenProvider } from '@/services/google-drive/api';
import { enrichDriveSongs } from '@/services/google-drive/metadata';
import type { Song } from '@/types/music';

interface LibraryObserver {
  isCurrent(): boolean;
  onSongs(songs: Song[], missing: number): void;
  onMetadata(songs: Song[]): void;
  onWarning(message: string): void;
  onSettled(): void;
}

/** Returns after listing; bounded tag reads continue without blocking playback. */
export async function refreshDriveLibrary(
  accountId: string,
  files: DriveFile[],
  token: TokenProvider,
  signal: AbortSignal,
  observer: LibraryObserver,
): Promise<boolean> {
  let missing = 0;
  const songs = await loadDriveSongs(
    accountId,
    files.map((file) => file.id),
    token,
    signal,
    (ids) => {
      missing = ids.length;
    },
  );
  if (!observer.isCurrent()) return false;
  observer.onSongs(songs, missing);
  void enrichDriveSongs(songs, token, signal, (updated) => {
    if (observer.isCurrent()) observer.onMetadata(updated);
  })
    .then((failures) => {
      if (observer.isCurrent() && failures)
        observer.onWarning(
          '일부 곡의 태그·앨범아트를 읽지 못했습니다. 음악 목록 다시 불러오기로 재시도할 수 있습니다.',
        );
    })
    .catch(() => {
      if (observer.isCurrent())
        observer.onWarning(
          '태그·앨범아트를 읽지 못했습니다. 음악 목록 다시 불러오기로 재시도해 주세요.',
        );
    })
    .finally(() => {
      if (observer.isCurrent()) observer.onSettled();
    });
  return true;
}
