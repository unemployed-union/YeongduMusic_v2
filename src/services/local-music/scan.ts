import { Platform } from 'react-native';
import { localFolderKey, sourceFolder } from './folders';
import { Directory } from 'expo-file-system';
import { AssetField, MediaType, Query, requestPermissionsAsync } from 'expo-media-library';
import { isAudioFile } from '@/services/music-source';
import type { ImportAsset } from './import-types';

const PAGE_SIZE = 100;
const describe = (error: unknown) =>
  error instanceof Error ? error.message : '음악 목록에 접근할 수 없습니다.';

// Android audio MediaStore only. iOS Photos cannot enumerate the Music library.
export async function* deviceAssets(failures: string[]): AsyncGenerator<ImportAsset> {
  if (Platform.OS !== 'android')
    throw new Error('이 기기에서는 폴더 또는 파일 선택으로 음악을 가져와 주세요.');
  const permission = await requestPermissionsAsync(false, ['audio']);
  if (!permission.granted)
    throw new Error(
      '음악 접근 권한이 필요합니다. 설정에서 음악 및 오디오 권한을 허용하거나 폴더를 선택해 주세요.',
    );
  const seen = new Set<string>();
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await new Query()
      .eq(AssetField.MEDIA_TYPE, MediaType.AUDIO)
      .orderBy(AssetField.CREATION_TIME)
      .limit(PAGE_SIZE)
      .offset(offset)
      .exe();
    if (!page.length) return;
    let unseen = 0;
    for (const asset of page) {
      if (seen.has(asset.id)) continue;
      seen.add(asset.id);
      unseen++;
      try {
        const name = await asset.getFilename();
        if (!isAudioFile(name)) continue;
        const duration = await asset.getDuration().catch(() => null);
        const location = await asset.getUri().catch(() => null);
        const originFolder = location ? sourceFolder(location) : undefined;
        // Android Asset.id is the MediaStore content URI; avoid relying on raw storage paths.
        if (!asset.id.startsWith('content://'))
          throw new Error('오디오 접근 주소를 확인할 수 없습니다.');
        yield {
          uri: asset.id,
          name,
          originFolder,
          duration: duration === null ? undefined : duration / 1000,
          stage: true,
        };
      } catch (error) {
        failures.push('기기 음악 · ' + describe(error));
      }
    }
    if (page.length < PAGE_SIZE) return;
    if (!unseen) throw new Error('음악 목록이 반복 반환되었습니다. 다시 가져오기를 실행해 주세요.');
  }
}

export async function folderAssets(failures: string[]): Promise<AsyncIterable<ImportAsset> | null> {
  if (Platform.OS === 'web')
    throw new Error('폴더 가져오기는 iOS·Android 앱에서 사용할 수 있습니다.');
  let root: Directory;
  try {
    root = await Directory.pickDirectoryAsync();
  } catch (error) {
    const code = (error as { code?: string } | null)?.code ?? '';
    if (/^ERR_(FILE_PICKING|PICKER)_CANCELLED$/.test(code)) return null;
    throw error;
  }
  return walk(root, failures);
}

async function* walk(root: Directory, failures: string[]): AsyncGenerator<ImportAsset> {
  const pending = [{ directory: root, path: localFolderKey(root.uri) }],
    seen = new Set<string>();
  while (pending.length) {
    const location = pending.pop()!;
    const folder = location.directory;
    if (seen.has(folder.uri)) continue;
    seen.add(folder.uri);
    try {
      for (const entry of folder.list()) {
        if (entry instanceof Directory)
          pending.push({ directory: entry, path: location.path + '/' + entry.name });
        else if (isAudioFile(entry.name))
          yield { uri: entry.uri, name: entry.name, stage: true, originFolder: location.path };
      }
    } catch (error) {
      failures.push(folder.name + ' · ' + describe(error));
    }
    // Directory.list is synchronous. Yield between folders so the import UI remains responsive.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}
