import * as FileSystem from 'expo-file-system/legacy';
import { localMusicDirectory } from './files';
import { saveLocalSong } from './database';
import type { Song } from '@/types/music';

export async function recoverLocalMetadata(song: Song): Promise<Song> {
  if (song.source !== 'local') {
    return song;
  }
  const uri = localMusicDirectory() + song.local.fileName;

  const journal = uri + '.metadata-journal';

  const backup = uri + '.metadata-backup';

  const staged = uri + '.metadata-new';
  if (!(await FileSystem.getInfoAsync(journal)).exists) {
    return song;
  }
  const entry = JSON.parse(await FileSystem.readAsStringAsync(journal)) as {
    before: Song;
    after: Song;
    digest: string;
  };
  if (
    entry.before?.source !== 'local' ||
    entry.after?.source !== 'local' ||
    entry.before.id !== song.id ||
    entry.after.id !== song.id ||
    entry.before.local.fileName !== song.local.fileName ||
    entry.after.local.fileName !== song.local.fileName ||
    !/^[a-f0-9]{32}$/.test(entry.digest)
  ) {
    throw new Error('음악 태그 저장 복구 정보를 읽지 못했습니다.');
  }
  const current = await FileSystem.getInfoAsync(uri, { md5: true });
  const committed =
    JSON.stringify(song) === JSON.stringify(entry.after) &&
    current.exists &&
    current.md5 === entry.digest;
  if (!committed) {
    if ((await FileSystem.getInfoAsync(backup)).exists) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
      await FileSystem.moveAsync({ from: backup, to: uri });
    } else if (!current.exists || current.size !== entry.before.local.size) {
      throw new Error('음악 태그 저장 복구에 실패했습니다. 원본 백업을 유지했습니다.');
    }
    await saveLocalSong(entry.before);
  }
  await FileSystem.deleteAsync(staged, { idempotent: true });
  await FileSystem.deleteAsync(backup, { idempotent: true });
  await FileSystem.deleteAsync(journal, { idempotent: true });
  return committed ? entry.after : entry.before;
}
