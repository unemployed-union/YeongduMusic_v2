import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { audioExtension } from './formats';
import { storeDownloadedSong } from '@/services/local-music/storage';
import { SynologyClient } from '@/services/synology/api';
import { useAuthStore } from '@/stores/auth';
import { driveSource } from '@/stores/google-drive';
import type { Song } from '@/types/music';

export type DownloadProgress = { written: number; total: number };
let sequence = 0;
export async function downloadSong(song: Song, signal: AbortSignal, onProgress: (progress: DownloadProgress) => void, onSaving: () => void) {
  if (Platform.OS === 'web' || !FileSystem.cacheDirectory) throw new Error('음악 보관은 Android·iOS 앱에서 사용할 수 있습니다.');
  if (song.source === 'local') throw new Error('이미 이 기기에 저장된 음악입니다.');
  const auth = useAuthStore.getState();
  if (song.source !== 'drive' && (auth.mode !== 'nas' || !auth.session)) throw new Error('NAS 연결 후 음악을 보관해 주세요.');
  const check = () => { if (signal.aborted) throw new Error('음악 보관을 취소했습니다.'); };
  const uri = FileSystem.cacheDirectory + 'offline-download-' + Date.now() + '-' + (++sequence) + '.part';
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      check();
      const source: { uri: string; headers?: Record<string, string> } = song.source === 'drive' ? await driveSource(song, attempt > 0) : new SynologyClient(auth.session!).streamSource(song, 'original');
      check();
      let lastProgress = 0;
      const task = FileSystem.createDownloadResumable(source.uri, uri, { headers: source.headers, cache: false }, ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
        const now = Date.now();
        if (!signal.aborted && (now - lastProgress >= 200 || totalBytesWritten === totalBytesExpectedToWrite)) {
          lastProgress = now;
          onProgress({ written: totalBytesWritten, total: totalBytesExpectedToWrite });
        }
      });
      const cancel = () => { void task.cancelAsync().catch(() => {}); };
      signal.addEventListener('abort', cancel, { once: true });
      let result: FileSystem.FileSystemDownloadResult | undefined;
      try { result = await task.downloadAsync(); }
      catch { check(); throw new Error('음악을 내려받지 못했습니다. 네트워크와 저장 공간을 확인하고 다시 시도해 주세요.'); }
      finally { signal.removeEventListener('abort', cancel); }
      check();
      if (!result) throw new Error('음악을 내려받지 못했습니다. 다시 시도해 주세요.');
      if (song.source === 'drive' && result.status === 401 && attempt === 0) continue;
      if (result.status === 401) {
        if (song.source !== 'drive' && auth.session) await useAuthStore.getState().expire(auth.session, auth.generation);
        throw new Error('인증이 만료되었습니다. 계정을 다시 연결하고 보관해 주세요.');
      }
      if (result.status === 403) throw new Error('음악 파일을 내려받을 권한이 없습니다.');
      if (result.status === 404) throw new Error('음악 파일이 삭제되었거나 찾을 수 없습니다.');
      if (result.status !== 200) throw new Error('전체 음악 파일을 내려받지 못했습니다. 다시 시도해 주세요. (HTTP ' + result.status + ')');
      const header = (name: string) => Object.entries(result.headers).find(([key]) => key.toLowerCase() === name)?.[1];
      const mime = result.mimeType || header('content-type') || '';
      const extension = audioExtension(song, mime);
      const info = await FileSystem.getInfoAsync(uri);
      const expected = Number(header('content-length'));
      if (!info.exists || info.isDirectory || !info.size || (Number.isFinite(expected) && expected > 0 && info.size !== expected)
        || (song.source === 'drive' && song.drive.size && info.size !== song.drive.size)) {
        throw new Error('내려받은 음악이 비어 있거나 불완전합니다. 다시 보관해 주세요.');
      }
      check();
      onSaving();
      return await storeDownloadedSong(song, uri, extension, mime, signal);
    }
    throw new Error('Google 인증 정보를 갱신하지 못했습니다. 다시 연결해 주세요.');
  } finally {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  }
}
