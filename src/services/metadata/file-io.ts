import {
  File,
  FileMode,
  UploadTask,
  UploadType,
  type UploadOptions,
  type UploadResult,
} from 'expo-file-system';
import { buildTagPlan, type TagArtwork } from './tag-writer';
import { CloudRequestError } from '@/services/cloud-music/request';
import type { SongMetadata } from '@/types/music';

export type FileProgress = (message: string) => void;
export type FileTarget = {
  name: string;
  size: number;
  md5?: string;
  download: { uri: string; headers?: Record<string, string> };
  unchanged: () => Promise<void>;
  commit: (file: File, progress: FileProgress) => Promise<string>;
};
export function checkCancelled(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error('파일 저장이 취소되었거나 연결이 변경되었습니다.');
  }
}
export async function rewriteTags(
  input: File,
  output: File,
  format: 'mp3' | 'flac',
  fields: SongMetadata | undefined,
  signal: AbortSignal,
  artwork?: TagArtwork,
): Promise<void> {
  checkCancelled(signal);
  const source = input.open(FileMode.ReadOnly);
  try {
    const size = source.size;
    if (!size) {
      throw new Error('음악 파일이 비어 있습니다.');
    }
    const plan = buildTagPlan(
      {
        size,
        read: (offset, length) => {
          source.offset = offset;
          return source.readBytes(length);
        },
      },
      format,
      fields,
      artwork,
    );
    output.create();
    const destination = output.open(FileMode.WriteOnly);
    try {
      let written = 0;
      for (const part of plan.parts) {
        if (part instanceof Uint8Array) {
          checkCancelled(signal);
          destination.writeBytes(part);
          written += part.length;
        } else {
          for (let offset = 0; offset < part.length; ) {
            checkCancelled(signal);
            source.offset = part.offset + offset;
            const amount = Math.min(256 * 1024, part.length - offset);
            const bytes = source.readBytes(amount);
            if (bytes.length !== amount) {
              throw new Error('음악 파일을 끝까지 읽지 못했습니다.');
            }
            destination.writeBytes(bytes);
            offset += amount;
            written += amount;
            // Yield regularly so long lossless files do not freeze playback controls.
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
          }
        }
      }
      if (written !== plan.size || destination.size !== plan.size) {
        throw new Error('수정한 파일 크기가 일치하지 않습니다.');
      }
    } finally {
      destination.close();
    }
  } finally {
    source.close();
  }
}
export async function uploadFile(
  file: File,
  url: string,
  options: UploadOptions,
  progress: FileProgress,
): Promise<UploadResult> {
  let result: UploadResult;
  try {
    result = await new UploadTask(file, url, {
      ...options,
      sessionType: 'foreground',
      onProgress: ({ bytesSent, totalBytes }) => {
        progress(
          totalBytes > 0
            ? `파일 업로드 중 · ${Math.min(100, Math.floor((bytesSent / totalBytes) * 100))}%`
            : '파일 업로드 중',
        );
      },
    }).uploadAsync();
  } catch {
    // Native errors can contain credential-bearing transfer URLs. Also, a lost
    // acknowledgement does not establish that the server kept the old file.
    throw new Error(
      '파일 업로드 완료를 확인하지 못했습니다. 원본 파일을 확인한 뒤 다시 시도해 주세요.',
    );
  }
  if (result.status === 412 || result.status === 409) {
    throw new Error(
      '원본 파일이 다른 곳에서 변경되었습니다. 목록을 새로고침한 뒤 다시 수정해 주세요.',
    );
  }
  if (result.status < 200 || result.status >= 300) {
    let message: string;
    if (result.status === 403) {
      message = '원본 파일을 수정할 권한이 없습니다.';
    } else if (result.status === 502 || result.status === 503 || result.status === 504) {
      message = `파일 업로드 실패 (HTTP ${result.status}). 중계 서버와 저장소 사이의 연결을 확인해 주세요.`;
    } else {
      message = `파일 업로드 실패 (HTTP ${result.status}).`;
    }

    throw new CloudRequestError(message, result.status);
  }
  return result;
}

/** File Station's multipart parser needs plain field/file headers, with the file last.
 * Build on disk to avoid native multipart additions and keep large FLACs out of JS memory. */
export async function uploadMultipartFile(
  file: File,
  url: string,
  parameters: Record<string, string>,
  filename: string,
  headers: Record<string, string>,
  signal: AbortSignal,
  progress: FileProgress,
): Promise<UploadResult> {
  checkCancelled(signal);
  if (
    !filename ||
    /["\\\r\n\0]/.test(filename) ||
    Object.keys(parameters).some((key) => !/^[\w-]+$/.test(key))
  ) {
    throw new Error('파일 업로드 요청 형식을 확인할 수 없습니다.');
  }
  const suffix = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  const boundary = 'yeongdu-form-' + suffix;
  const encode = new TextEncoder();
  const prefix = encode.encode(
    Object.entries(parameters)
      .map(
        ([key, value]) =>
          `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`,
      )
      .join('') +
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
  );
  const ending = encode.encode(`\r\n--${boundary}--\r\n`);
  const body = new File(file.parentDirectory, 'upload-body-' + suffix);
  try {
    const source = file.open(FileMode.ReadOnly);
    try {
      const size = source.size;
      if (!size || !Number.isSafeInteger(size)) {
        throw new Error('업로드할 파일 크기를 확인할 수 없습니다.');
      }
      body.create();
      const destination = body.open(FileMode.WriteOnly);
      try {
        destination.writeBytes(prefix);
        for (let offset = 0; offset < size; ) {
          checkCancelled(signal);
          source.offset = offset;
          const length = Math.min(256 * 1024, size - offset);
          const bytes = source.readBytes(length);
          if (bytes.length !== length) {
            throw new Error('업로드할 파일을 끝까지 읽지 못했습니다.');
          }
          destination.writeBytes(bytes);
          offset += bytes.length;
          progress(`업로드 요청 준비 중 · ${Math.floor((offset / size) * 100)}%`);
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
        checkCancelled(signal);
        destination.writeBytes(ending);
        if (destination.size !== prefix.length + size + ending.length) {
          throw new Error('파일 업로드 요청 크기가 일치하지 않습니다.');
        }
      } finally {
        destination.close();
      }
    } finally {
      source.close();
    }
    // BINARY_CONTENT sends the prepared body unchanged, with a known total
    // Content-Length; Content-Type belongs only to the outer request and file part.
    return await uploadFile(
      body,
      url,
      {
        httpMethod: 'POST',
        uploadType: UploadType.BINARY_CONTENT,
        headers: { ...headers, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
        signal,
      },
      progress,
    );
  } finally {
    try {
      if (body.exists) {
        body.delete();
      }
    } catch {
      /* The caller also removes its temporary directory. */
    }
  }
}
