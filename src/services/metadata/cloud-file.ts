import { File } from 'expo-file-system';
import { cloudRequest, CloudRequestError } from '@/services/cloud-music/request';
import { useS3Store } from '@/stores/s3';
import { checkCancelled, uploadFile, type FileProgress, type FileTarget } from './file-io';
import type { Song } from '@/types/music';

export async function prepareS3File(song: Song, signal: AbortSignal): Promise<FileTarget> {
  if (song.source !== 's3') {
    throw new Error('S3 음악이 아닙니다.');
  }
  const inspect = () =>
    cloudRequest(
      'S3 원본 파일',
      async (requestSignal) => {
        const source = await useS3Store.getState().fileRequest(song, 'HEAD');
        const response = await fetch(source.uri, {
          method: 'HEAD',
          signal: requestSignal,
          redirect: 'error',
          cache: 'no-store',
        });
        if (!response.ok) {
          throw new CloudRequestError(
            'S3 원본 파일의 읽기 권한과 연결을 확인해 주세요.',
            response.status,
          );
        }
        const etag = response.headers.get('etag');
        const size = Number(response.headers.get('content-length'));
        if (!etag || !Number.isSafeInteger(size) || size <= 0) {
          throw new CloudRequestError('S3 원본의 크기와 변경 확인용 ETag가 필요합니다.');
        }
        // A replacement must not silently discard object tags or retention settings.
        if (
          Number(response.headers.get('x-amz-tagging-count') ?? 0) > 0 ||
          response.headers.get('x-amz-object-lock-mode')
        ) {
          throw new CloudRequestError(
            '객체 태그 또는 보존 잠금이 설정된 S3 파일은 앱 표시 정보만 저장할 수 있습니다.',
          );
        }
        const headers: Record<string, string> = {};
        const retained = new Set([
          'content-type',
          'cache-control',
          'content-disposition',
          'content-encoding',
          'content-language',
          'expires',
          'x-amz-storage-class',
          'x-amz-server-side-encryption',
          'x-amz-server-side-encryption-aws-kms-key-id',
          'x-amz-server-side-encryption-bucket-key-enabled',
        ]);
        response.headers.forEach((value, key) => {
          if (retained.has(key.toLowerCase()) || key.toLowerCase().startsWith('x-amz-meta-')) {
            headers[key.toLowerCase()] = value;
          }
        });
        if (headers['content-encoding'] && headers['content-encoding'] !== 'identity') {
          throw new CloudRequestError('압축된 S3 객체는 앱 표시 정보만 저장할 수 있습니다.');
        }
        return { etag, size, headers };
      },
      signal,
    );
  const original = await inspect();
  const unchanged = async () => {
    const latest = await inspect();
    if (latest.etag !== original.etag || latest.size !== original.size) {
      throw new Error('S3 원본 파일이 변경되었습니다. 목록을 새로고침한 뒤 다시 수정해 주세요.');
    }
  };
  return {
    name: song.s3.key.slice(song.s3.key.lastIndexOf('/') + 1),
    size: original.size,
    download: await useS3Store.getState().source(song),
    unchanged,
    commit: async (output: File, progress: FileProgress) => {
      await unchanged();
      checkCancelled(signal);
      const headers = { ...original.headers, 'if-match': original.etag };
      const target = await useS3Store.getState().fileRequest(song, 'PUT', headers);
      checkCancelled(signal);
      await uploadFile(output, target.uri, { httpMethod: 'PUT', headers, signal }, progress);
      return 'S3 원본 파일에 저장했습니다.';
    },
  };
}
