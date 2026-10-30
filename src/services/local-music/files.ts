import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { useFolderExclusionStore } from '@/stores/folder-exclusions';
import { localSongExcluded } from './folders';
import { openLocalDatabase } from './database';
import type { Song } from '@/types/music';

export function localMusicDirectory(): string {
  if (Platform.OS === 'web' || !FileSystem.documentDirectory)
    throw new Error('로컬 음악 가져오기는 iOS·Android 앱에서 사용할 수 있습니다.');
  return FileSystem.documentDirectory + 'local-music/';
}
export async function localSource(song: Song): Promise<{ uri: string }> {
  if (
    song.source !== 'local' ||
    !song.local ||
    !/^[a-f0-9]{32}-\d+\.(mp3|m4a|flac|wav|aac|aiff|aif|ogg|opus|alac)$/.test(song.local.fileName)
  )
    throw new Error('로컬 음악 파일 정보가 올바르지 않습니다.');
  await useFolderExclusionStore.getState().load();
  const exclusions = useFolderExclusionStore.getState();
  if (!exclusions.ready)
    throw new Error(exclusions.error ?? '제외 폴더 설정을 불러오지 못했습니다.');
  const record = await (
    await openLocalDatabase()
  ).getFirstAsync<{ value: string }>('SELECT value FROM local_tracks WHERE id = ?', song.id);
  const latest = record ? (JSON.parse(record.value) as Song) : song;
  if (localSongExcluded(latest, exclusions.folders))
    throw new Error('가져오기 제외 폴더의 음악입니다. 설정에서 제외를 해제해 주세요.');
  const uri = localMusicDirectory() + song.local.fileName;
  let info: FileSystem.FileInfo;
  try {
    info = await FileSystem.getInfoAsync(uri);
  } catch {
    throw new Error('음악 파일에 접근할 수 없습니다. 파일을 다시 가져와 주세요.');
  }
  if (!info.exists || info.isDirectory || info.size <= 0 || info.size !== song.local.size)
    throw new Error('음악 파일이 없거나 비어 있습니다. 원본 파일을 다시 가져와 주세요.');
  return { uri };
}
