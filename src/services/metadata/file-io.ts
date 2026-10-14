import { File, FileMode, UploadTask, type UploadOptions, type UploadResult } from 'expo-file-system';
import { buildTagPlan, type TagArtwork } from './tag-writer';
import type { SongMetadata } from '@/types/music';

export type FileProgress = (message: string) => void;
export type FileTarget = { name: string; size: number; md5?: string; download: { uri: string; headers?: Record<string, string> };
  unchanged: () => Promise<void>; commit: (file: File, progress: FileProgress) => Promise<string> };
export function checkCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new Error('파일 저장이 취소되었거나 연결이 변경되었습니다.');
}
export async function rewriteTags(input: File, output: File, format: 'mp3' | 'flac', fields: SongMetadata | undefined, signal: AbortSignal, artwork?: TagArtwork): Promise<void> {
  checkCancelled(signal);
  const source = input.open(FileMode.ReadOnly);
  try {
    const size = source.size;
    if (!size) throw new Error('음악 파일이 비어 있습니다.');
    const plan = buildTagPlan({ size, read: (offset, length) => { source.offset = offset; return source.readBytes(length); } }, format, fields, artwork);
    output.create(); const destination = output.open(FileMode.WriteOnly);
    try {
      let written = 0;
      for (const part of plan.parts) {
        if (part instanceof Uint8Array) { checkCancelled(signal); destination.writeBytes(part); written += part.length; }
        else {
          for (let offset = 0; offset < part.length;) {
            checkCancelled(signal); source.offset = part.offset + offset;
            const amount = Math.min(256 * 1024, part.length - offset), bytes = source.readBytes(amount);
            if (bytes.length !== amount) throw new Error('음악 파일을 끝까지 읽지 못했습니다.');
            destination.writeBytes(bytes); offset += amount; written += amount;
            // Yield regularly so long lossless files do not freeze playback controls.
            await new Promise<void>(resolve => setTimeout(resolve, 0));
          }
        }
      }
      if (written !== plan.size || destination.size !== plan.size) throw new Error('수정한 파일 크기가 일치하지 않습니다.');
    } finally { destination.close(); }
  } finally { source.close(); }
}
export async function uploadFile(file: File, url: string, options: UploadOptions, progress: FileProgress): Promise<UploadResult> {
  let result: UploadResult;
  try {
    result = await new UploadTask(file, url, { ...options, sessionType: 'foreground', onProgress: ({ bytesSent, totalBytes }) => {
      progress(totalBytes > 0 ? `파일 업로드 중 · ${Math.min(100, Math.floor(bytesSent / totalBytes * 100))}%` : '파일 업로드 중');
    } }).uploadAsync();
  } catch {
    // Native errors can contain credential-bearing transfer URLs. Also, a lost
    // acknowledgement does not establish that the server kept the old file.
    throw new Error('파일 업로드 완료를 확인하지 못했습니다. 원본 파일을 확인한 뒤 다시 시도해 주세요.');
  }
  if (result.status === 412 || result.status === 409) throw new Error('원본 파일이 다른 곳에서 변경되었습니다. 목록을 새로고침한 뒤 다시 수정해 주세요.');
  if (result.status < 200 || result.status >= 300) throw new Error(result.status === 403 ? '원본 파일을 수정할 권한이 없습니다.' : `파일 업로드 실패 (HTTP ${result.status}).`);
  return result;
}
