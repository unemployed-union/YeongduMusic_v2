import * as FileSystem from 'expo-file-system/legacy';
import { audioExtension } from '@/services/offline-music/formats';
import { MyboxError } from './api';
import type { Song } from '@/types/music';

const entries = new Map<string, { uri: string; size: number }>();
const MAX_BYTES = 256 * 1024 * 1024;
let initialized: Promise<void> | null = null;
let sequence = 0;
let epoch = 0;
function directory() {
  if (!FileSystem.cacheDirectory) {
    throw new MyboxError('MYBOX 음악을 임시 저장할 공간을 찾을 수 없습니다.');
  }
  return FileSystem.cacheDirectory + 'mybox-playback/';
}
async function initialize() {
  if (!initialized) {
    initialized = (async () => {
      const folder = directory();
      await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
      for (const name of await FileSystem.readDirectoryAsync(folder)) {
        if (/^track-[a-z0-9-]+\.(part|mp3|m4a|flac|wav|aac|aiff|aif|ogg|opus|alac)$/.test(name)) {
          await FileSystem.deleteAsync(folder + name, { idempotent: true });
        }
      }
    })().catch((error) => {
      initialized = null;
      throw error;
    });
  }
  await initialized;
}
export async function clearMyboxPlaybackCache() {
  epoch++;
  const previous = [...entries.values()];
  entries.clear();
  await Promise.all(
    previous.map((item) => FileSystem.deleteAsync(item.uri, { idempotent: true }).catch(() => {})),
  );
}
/** A one-use download URL cannot be reused by native seeking/range reconnections. */
export async function prepareMyboxPlayback(
  song: Extract<Song, { source: 'mybox' }>,
  source: () => Promise<{ uri: string }>,
  signal: AbortSignal,
) {
  const version = epoch;
  const check = () => {
    if (signal.aborted || version !== epoch) {
      throw new MyboxError('MYBOX 음악 불러오기가 취소되었습니다.');
    }
  };
  check();
  await initialize();
  check();
  const key = JSON.stringify([song.id, song.mybox.size, song.mybox.modifiedTime]);
  const cached = entries.get(key);
  if (cached) {
    const info = await FileSystem.getInfoAsync(cached.uri);
    check();
    if (info.exists && !info.isDirectory && info.size === song.mybox.size) {
      entries.delete(key);
      entries.set(key, cached);
      return { uri: cached.uri };
    }
    entries.delete(key);
  }
  if ((await FileSystem.getFreeDiskStorageAsync()) < song.mybox.size + 16 * 1024 * 1024) {
    throw new MyboxError('MYBOX 음악을 재생할 임시 저장 공간이 부족합니다.');
  }
  const base = directory() + 'track-' + Date.now().toString(36) + '-' + (++sequence).toString(36);
  const part = base + '.part';
  let final: string | null = null;
  let published = false;
  try {
    check();
    const remote = await source();
    check();
    const task = FileSystem.createDownloadResumable(remote.uri, part, { cache: false });
    let cancellation: Promise<void> = Promise.resolve();
    const cancel = () => {
      cancellation = task.cancelAsync().then(
        () => {},
        () => {},
      );
    };
    signal.addEventListener('abort', cancel, { once: true });
    let result: FileSystem.FileSystemDownloadResult | undefined;
    try {
      check();
      result = await task.downloadAsync();
    } finally {
      signal.removeEventListener('abort', cancel);
      await cancellation;
    }
    check();
    if (!result || result.status !== 200) {
      throw new MyboxError('MYBOX 음악을 내려받지 못했습니다. 곡을 다시 선택해 주세요.');
    }
    const mime =
      result.mimeType ||
      Object.entries(result.headers).find(([name]) => name.toLowerCase() === 'content-type')?.[1] ||
      '';
    const extension = audioExtension(song, mime);
    const info = await FileSystem.getInfoAsync(part);
    check();
    if (!info.exists || info.isDirectory || info.size !== song.mybox.size) {
      throw new MyboxError(
        'MYBOX 음악 파일이 불완전합니다. 목록을 새로고침하고 다시 시도해 주세요.',
      );
    }
    final = base + '.' + extension;
    await FileSystem.moveAsync({ from: part, to: final });
    check();
    entries.set(key, { uri: final, size: info.size });
    published = true;
    // Keep at most two tracks. A current track larger than the budget is allowed alone.
    let bytes = [...entries.values()].reduce((total, item) => total + item.size, 0);
    for (const [oldKey, item] of entries) {
      if ((entries.size <= 2 && bytes <= MAX_BYTES) || oldKey === key) {
        break;
      }
      entries.delete(oldKey);
      bytes -= item.size;
      await FileSystem.deleteAsync(item.uri, { idempotent: true }).catch(() => {});
    }
    check();
    return { uri: final };
  } catch (error) {
    if (error instanceof MyboxError) {
      throw error;
    }
    throw new MyboxError('MYBOX 음악을 불러오지 못했습니다. 네트워크와 저장 공간을 확인해 주세요.');
  } finally {
    await FileSystem.deleteAsync(part, { idempotent: true }).catch(() => {});
    if (final && !published) {
      await FileSystem.deleteAsync(final, { idempotent: true }).catch(() => {});
    }
  }
}
