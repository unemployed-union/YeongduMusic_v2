import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import {
  checkBackupSize,
  MAX_BACKUP_BYTES,
  parseSettingsBackup,
  type SettingsBackup,
} from './backup-format';

export async function saveBackupFile(text: string, prefix: string): Promise<string | null> {
  checkBackupSize(text);
  const name = prefix + '-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return name;
  }
  let directory: Directory;
  try {
    directory = await Directory.pickDirectoryAsync();
  } catch (cause) {
    const code = (cause as { code?: string })?.code ?? '';
    if (
      /cancel/i.test(code) ||
      (cause instanceof Error && /cancelled by the user/i.test(cause.message))
    ) {
      return null;
    }
    throw new Error('저장 폴더를 열지 못했습니다. 다른 폴더를 선택해 주세요.');
  }
  const file = directory.createFile(name, 'application/json');
  try {
    file.write(text);
  } catch {
    try {
      file.delete();
    } catch {
      /* Only remove this newly created incomplete backup. */
    }
    throw new Error('백업을 저장하지 못했습니다. 저장 공간과 폴더 권한을 확인해 주세요.');
  }
  return name;
}

export async function pickBackupFile<T>(
  parse: (text: string) => T,
): Promise<{ name: string; backup: T } | null> {
  const selection = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    multiple: false,
    copyToCacheDirectory: true,
    base64: false,
  });
  if (selection.canceled) {
    return null;
  }
  const asset = selection.assets[0];
  let file: File | undefined;
  try {
    if ((asset.size ?? 0) > MAX_BACKUP_BYTES) {
      throw new Error('백업 파일은 2MB 이하만 사용할 수 있습니다.');
    }
    let text: string;
    if (Platform.OS === 'web') {
      if (!asset.file) {
        throw new Error('선택한 백업 파일을 읽을 수 없습니다.');
      }
      text = await asset.file.text();
    } else {
      file = new File(asset.uri);
      if (file.size > MAX_BACKUP_BYTES) {
        throw new Error('백업 파일은 2MB 이하만 사용할 수 있습니다.');
      }
      text = await file.text();
    }
    checkBackupSize(text);
    return { name: asset.name, backup: parse(text) };
  } finally {
    // Never delete the selected original; the picker copies into app cache.
    if (Platform.OS !== 'web' && asset.uri.startsWith(Paths.cache.uri.replace(/\/?$/, '/'))) {
      try {
        (file ?? new File(asset.uri)).delete();
      } catch {
        /* Cache cleanup may fail independently. */
      }
    }
  }
}

export function saveSettingsBackup(text: string): Promise<string | null> {
  return saveBackupFile(text, 'yeongdu-music-settings');
}

export function pickSettingsBackup(): Promise<{ name: string; backup: SettingsBackup } | null> {
  return pickBackupFile(parseSettingsBackup);
}
