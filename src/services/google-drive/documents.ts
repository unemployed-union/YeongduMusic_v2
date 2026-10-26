import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import * as DocumentPicker from 'expo-document-picker';
import storage from 'expo-sqlite/kv-store';
import { Sha256 } from '@aws-crypto/sha256-js';
import { AUDIO_EXTENSION } from '@/services/music-source';
import type { Song } from '@/types/music';

const KEY = 'google-drive-documents-v1';
export type DriveDocument = { id: string; uri: string; name: string; mimeType: string; size?: number };
type Access = {
  documentPermissions: () => Promise<string[]>;
  persistDocuments: (uris: string[]) => Promise<string[]>;
  releaseDocuments: (uris: string[]) => Promise<void>;
};
function native(): Access {
  if (Platform.OS !== 'android') throw new Error('파일 앱을 통한 Drive 직접 재생은 Android에서 사용할 수 있습니다.');
  const module = requireOptionalNativeModule<Access>('YeongduDrivePicker');
  if (!module?.persistDocuments || !module.documentPermissions || !module.releaseDocuments) throw new Error('Drive 파일 읽기 권한을 지원하는 새 네이티브 빌드를 설치해 주세요.');
  return module;
}
export function isDriveDocumentUri(uri: unknown): uri is string {
  if (typeof uri !== 'string' || uri.length > 8192) return false;
  return /^content:\/\/com\.google\.android\.apps\.docs\.storage(?:\.legacy)?\/document\/[^#]+$/.test(uri);
}
async function documentId(uri: string): Promise<string> {
  const hash = new Sha256(); hash.update(uri);
  return [...await hash.digest()].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function pickDriveDocuments(): Promise<{ documents: DriveDocument[]; skipped: number } | null> {
  native(); // Fail before opening a picker if URI grants cannot survive a restart.
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['audio/*', 'application/ogg', 'application/octet-stream', 'video/mp4'],
    multiple: true, copyToCacheDirectory: false, base64: false,
  });
  if (picked.canceled) return null;
  const documents = new Map<string, DriveDocument>();
  let skipped = 0;
  for (const asset of picked.assets) {
    if (!isDriveDocumentUri(asset.uri) || !AUDIO_EXTENSION.test(asset.name) || !asset.name || asset.name.length > 1000 || asset.size === 0) { skipped++; continue; }
    const id = await documentId(asset.uri);
    documents.set(id, { id, uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? 'application/octet-stream',
      ...(Number.isSafeInteger(asset.size) && asset.size! > 0 ? { size: asset.size } : {}) });
  }
  if (!documents.size) throw new Error('Google Drive에서 MP3·M4A·FLAC 등의 음악 파일을 선택해 주세요.');
  return { documents: [...documents.values()], skipped };
}
export async function readDriveDocuments(): Promise<DriveDocument[]> {
  if (Platform.OS !== 'android') return [];
  const raw = await storage.getItem(KEY);
  if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 || !('documents' in value) || !Array.isArray(value.documents) || value.documents.length > 10000) throw new Error('Drive 파일 선택 목록을 읽지 못했습니다.');
  const result = new Map<string, DriveDocument>();
  for (const item of value.documents) {
    if (!item || typeof item !== 'object' || !isDriveDocumentUri(item.uri) || typeof item.name !== 'string' || !AUDIO_EXTENSION.test(item.name) || item.name.length > 1000
      || typeof item.mimeType !== 'string' || item.mimeType.length > 200 || typeof item.id !== 'string' || item.id !== await documentId(item.uri)
      || (item.size !== undefined && (!Number.isSafeInteger(item.size) || item.size <= 0))) throw new Error('Drive 파일 선택 목록 형식을 확인할 수 없습니다.');
    result.set(item.id, { id: item.id, uri: item.uri, name: item.name, mimeType: item.mimeType, ...(item.size === undefined ? {} : { size: item.size }) });
  }
  return [...result.values()];
}
export async function writeDriveDocuments(documents: DriveDocument[]): Promise<void> {
  if (documents.length > 10000) throw new Error('선택한 음악은 최대 10,000개까지 저장할 수 있습니다.');
  await storage.setItem(KEY, JSON.stringify({ version: 1, documents }));
}
export const driveDocumentPermissions = () => native().documentPermissions();
export const persistDriveDocuments = (documents: DriveDocument[]) => native().persistDocuments(documents.map(item => item.uri));
export const releaseDriveDocuments = (uris: string[]) => native().releaseDocuments(uris);
export function documentSong(document: DriveDocument): Song {
  return { id: 'drive:saf:' + document.id, source: 'drive', path: document.name, title: document.name.replace(/\.[^.]+$/, ''), artist: '알 수 없는 아티스트',
    album: 'Google Drive', albumSource: 'fallback', duration: 0,
    drive: { accountId: 'saf', fileId: document.id, mimeType: document.mimeType, size: document.size, documentUri: document.uri } };
}
