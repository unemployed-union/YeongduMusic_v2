import { Image, Platform } from 'react-native';
import { Directory, File, FileMode, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { cloudRequest, CloudRequestError } from '@/services/cloud-music/request';
import { fingerprintFile, withVerifiedCopy } from '@/services/local-music/file-copy';
import { coverArtUrl } from './search';
import { artworkUri, validateArtwork } from '@/features/artwork/rules';
import type { TagArtwork } from '@/services/metadata/tag-writer';

const LIMIT = 8 * 1024 * 1024, WEB_LIMIT = 2 * 1024 * 1024;
export function artworkBaseUri(): string { return new Directory(Paths.document, 'album-art').uri.replace(/\/?$/, '/'); }
export function imageFormat(bytes: Uint8Array): 'jpg' | 'png' | 'webp' {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return 'png';
  if (String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'webp';
  throw new Error('JPEG·PNG·WebP 이미지 파일을 선택해 주세요.');
}
function check(signal?: AbortSignal) { if (signal?.aborted) throw new CloudRequestError('앨범아트 수정이 취소되었습니다.'); }
async function checkDimensions(uri: string, signal?: AbortSignal): Promise<{ width: number; height: number }> {
  return cloudRequest('앨범아트 확인', async () => {
    const size = await Image.getSize(uri);
    if (!size.width || !size.height || size.width * size.height > 16000000) throw new CloudRequestError('이미지는 1,600만 화소 이하로 선택해 주세요.');
    return size;
  }, signal);
}
export async function readArtworkForTags(image: string, signal?: AbortSignal): Promise<TagArtwork> {
  validateArtwork(image); check(signal);
  if (Platform.OS === 'web' || image.startsWith('data:')) throw new Error('파일 저장은 Android·iOS 앱에서 사용할 수 있습니다.');
  const uri = artworkUri(image, artworkBaseUri()), file = new File(uri);
  if (!file.exists || file.size <= 0 || file.size > LIMIT) throw new Error('저장할 앨범아트 파일을 확인할 수 없습니다. 이미지를 다시 선택해 주세요.');
  const handle = file.open(FileMode.ReadOnly);
  let bytes: Uint8Array;
  try { bytes = handle.readBytes(file.size); } finally { handle.close(); }
  if (bytes.length !== file.size) throw new Error('앨범아트 파일을 끝까지 읽지 못했습니다.');
  const format = imageFormat(bytes);
  const { width, height } = await checkDimensions(uri, signal); check(signal);
  return { bytes, mime: format === 'jpg' ? 'image/jpeg' : format === 'png' ? 'image/png' : 'image/webp', width, height };
}
async function persistNative(uri: string, signal?: AbortSignal): Promise<string> {
  check(signal);
  const source = new File(uri);
  if (!source.exists || source.size <= 0 || source.size > LIMIT) throw new Error('이미지는 8MB 이하로 선택해 주세요.');
  const handle = source.open();
  let format: ReturnType<typeof imageFormat>;
  try { format = imageFormat(handle.readBytes(Math.min(32, source.size))); } finally { handle.close(); }
  await checkDimensions(uri, signal); check(signal);
  const fingerprint = await fingerprintFile(uri, '이미지 파일을 확인할 수 없습니다.');
  if (fingerprint.size > LIMIT) throw new Error('이미지는 8MB 이하로 선택해 주세요.');
  const directory = new Directory(Paths.document, 'album-art'); directory.create({ idempotent: true, intermediates: true });
  const name = `art-${fingerprint.digest}.${format}`, destination = new File(directory, name);
  return withVerifiedCopy({ from: uri, to: destination.uri, fingerprint, check: () => check(signal), message: '앨범아트 이미지를 보관하지 못했습니다.' }, async () => name);
}
async function webImage(bytes: Uint8Array, signal?: AbortSignal): Promise<string> {
  check(signal);
  if (!bytes.length || bytes.length > WEB_LIMIT) throw new Error('웹에서는 2MB 이하의 이미지를 선택해 주세요.');
  const format = imageFormat(bytes);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  const uri = `data:image/${format === 'jpg' ? 'jpeg' : format};base64,${btoa(binary)}`;
  await checkDimensions(uri, signal); check(signal);
  return uri;
}
export async function pickArtwork(signal?: AbortSignal): Promise<string | null> {
  const selection = await DocumentPicker.getDocumentAsync({ type: ['image/jpeg', 'image/png', 'image/webp'], multiple: false, copyToCacheDirectory: true, base64: false });
  if (selection.canceled) { check(signal); return null; }
  const asset = selection.assets[0];
  try {
    check(signal);
    if ((asset.size ?? 0) > (Platform.OS === 'web' ? WEB_LIMIT : LIMIT)) throw new Error('선택한 이미지 파일이 너무 큽니다.');
    if (Platform.OS === 'web') {
      if (!asset.file) throw new Error('선택한 이미지를 읽을 수 없습니다.');
      return await webImage(new Uint8Array(await asset.file.arrayBuffer()), signal);
    }
    return await persistNative(asset.uri, signal);
  } finally {
    if (Platform.OS !== 'web') {
      try { const copy = new File(asset.uri); if (asset.uri.startsWith(Paths.cache.uri) && copy.exists) copy.delete(); } catch { /* Only dispose the picker's app cache copy. */ }
    }
  }
}
export async function downloadArtwork(id: string, signal?: AbortSignal): Promise<string> {
  const uri = coverArtUrl(id);
  return cloudRequest('앨범아트 다운로드', async operationSignal => {
    if (Platform.OS === 'web') {
      const response = await fetch(uri, { signal: operationSignal });
      if (!response.ok) throw new CloudRequestError('이 후보의 앨범아트를 가져올 수 없습니다. 다른 후보를 선택해 주세요.', response.status);
      if (Number(response.headers.get('Content-Length')) > WEB_LIMIT) throw new CloudRequestError('앨범아트 이미지가 너무 큽니다.');
      return webImage(new Uint8Array(await response.arrayBuffer()), operationSignal);
    }
    const directory = new Directory(Paths.cache, 'album-art-' + Date.now() + '-' + Math.random().toString(36).slice(2));
    directory.create();
    const request = new AbortController(), abort = () => request.abort();
    operationSignal.addEventListener('abort', abort, { once: true }); if (operationSignal.aborted) abort();
    let oversized = false;
    try {
      const source = new File(directory, 'cover');
      try { await File.downloadFileAsync(uri, source, { signal: request.signal, onProgress: ({ bytesWritten, totalBytes }) => {
        if (bytesWritten > LIMIT || totalBytes > LIMIT) { oversized = true; request.abort(); }
      } }); } catch { throw new CloudRequestError(oversized ? '앨범아트 이미지가 너무 큽니다.' : '이 후보의 앨범아트를 가져올 수 없습니다. 다른 후보를 선택해 주세요.'); }
      check(operationSignal);
      return await persistNative(source.uri, operationSignal);
    } finally {
      operationSignal.removeEventListener('abort', abort);
      try { directory.delete(); } catch { /* Confine cleanup to this unique app cache directory. */ }
    }
  }, signal, undefined, 45000);
}
