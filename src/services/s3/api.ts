import { cloudRequest } from '@/services/cloud-music/request';
import { signedS3Url, S3RequestError, type S3Connection } from './connection';
import { parseS3List, s3ResponseError } from './response';
import type { Song } from '@/types/music';

// Preserve the existing entry point for stores and callers.
export { prepareS3Connection, publicS3Connection, signedS3Url, S3RequestError } from './connection';
export type { S3Input, S3Connection, S3PublicConnection } from './connection';

export async function listS3Page(
  connection: S3Connection,
  signal?: AbortSignal,
  continuation?: string,
): Promise<{ songs: Song[]; next?: string; scanned: number }> {
  return cloudRequest(
    'S3',
    async (requestSignal) => {
      const query: Record<string, string> = {
        'list-type': '2',
        'max-keys': '1000',
        'encoding-type': 'url',
        prefix: connection.prefix,
      };
      if (continuation) {
        query['continuation-token'] = continuation;
      }
      const url = await signedS3Url(connection, undefined, query, 900);
      if (requestSignal.aborted) {
        throw new S3RequestError('S3 요청이 취소되었습니다.');
      }
      const response = await fetch(url, { signal: requestSignal, redirect: 'error' });
      const text = await response.text();
      if (!response.ok) {
        throw s3ResponseError(text, response.status);
      }
      return parseS3List(text, connection);
    },
    signal,
    (message) => new S3RequestError(message),
  );
}
export async function loadS3Songs(
  connection: S3Connection,
  signal?: AbortSignal,
  onProgress?: (scanned: number) => void,
): Promise<Song[]> {
  const songs = new Map<string, Song>();
  const pages = new Set<string>();
  let next: string | undefined;
  let scanned = 0;
  do {
    const page = await listS3Page(connection, signal, next);
    if (signal?.aborted) {
      throw new S3RequestError('S3 요청이 취소되었습니다.');
    }
    page.songs.forEach((song) => songs.set(song.id, song));
    scanned += page.scanned;
    onProgress?.(scanned);
    next = page.next;
    if (next && pages.has(next)) {
      throw new S3RequestError('S3 페이지 정보가 반복됩니다. 다시 시도해 주세요.');
    }
    if (next) {
      pages.add(next);
    }
  } while (next);
  return [...songs.values()];
}
