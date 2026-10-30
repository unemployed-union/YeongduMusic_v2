import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { AUDIO_EXTENSION } from '@/services/music-source';
import { S3RequestError, type S3Connection } from './connection';
import type { Song } from '@/types/music';

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: false,
  removeNSPrefix: true,
  isArray: (name) => name === 'Contents',
});
function parseXml(text: string): Record<string, unknown> {
  if (
    text.length > 4 * 1024 * 1024 ||
    /<!DOCTYPE|<!ENTITY/i.test(text) ||
    XMLValidator.validate(text) !== true
  ) {
    throw new S3RequestError('S3 XML 응답을 읽을 수 없습니다.');
  }
  const parsed: unknown = parser.parse(text);
  if (!record(parsed)) {
    throw new S3RequestError('예상하지 못한 S3 응답입니다.');
  }
  return parsed;
}
export function s3ResponseError(text: string, status: number): S3RequestError {
  let code: unknown;
  try {
    const error = parseXml(text).Error;
    if (record(error)) {
      code = error.Code;
    }
  } catch {
    /* Never display untrusted XML or signed URLs. */
  }
  let message: string;
  if (status === 301 || code === 'AuthorizationHeaderMalformed') {
    message = 'S3 리전과 엔드포인트가 버킷과 일치하는지 확인해 주세요.';
  } else if (code === 'SignatureDoesNotMatch') {
    message = 'S3 서명이 일치하지 않습니다. 키·리전·주소 방식을 확인해 주세요.';
  } else if (code === 'RequestTimeTooSkewed' || code === 'ExpiredToken') {
    message = 'S3 임시 토큰의 만료와 기기 시간을 확인해 주세요.';
  } else if (status === 403) {
    message = 'S3 읽기 권한을 확인해 주세요. 버킷 목록 조회(ListBucket) 권한이 필요합니다.';
  } else if (status === 404) {
    message = 'S3 버킷을 찾을 수 없습니다.';
  } else {
    message = 'S3 목록 조회 실패 (HTTP ' + status + ')';
  }

  return new S3RequestError(message, status);
}

export function parseS3List(
  text: string,
  connection: S3Connection,
): { songs: Song[]; next?: string; scanned: number } {
  const root = parseXml(text).ListBucketResult;
  if (
    !record(root) ||
    !['true', 'false'].includes(String(root.IsTruncated)) ||
    (root.EncodingType !== undefined && root.EncodingType !== 'url')
  ) {
    throw new S3RequestError('예상하지 못한 S3 목록 응답입니다.');
  }
  const contents = root.Contents ?? [];
  if (!Array.isArray(contents)) {
    throw new S3RequestError('예상하지 못한 S3 객체 목록입니다.');
  }
  const songs: Song[] = [];
  for (const object of contents) {
    if (
      !record(object) ||
      typeof object.Key !== 'string' ||
      typeof object.Size !== 'string' ||
      !Number.isSafeInteger(Number(object.Size)) ||
      Number(object.Size) < 0
    ) {
      throw new S3RequestError('예상하지 못한 S3 음악 파일 정보입니다.');
    }
    let key = object.Key;
    if (root.EncodingType === 'url') {
      try {
        key = decodeURIComponent(key);
      } catch {
        throw new S3RequestError('S3 객체 이름의 인코딩을 확인해 주세요.');
      }
    }
    if (!key.startsWith(connection.prefix)) {
      throw new S3RequestError('S3가 선택한 접두사 밖의 파일을 반환했습니다.');
    }
    if (!AUDIO_EXTENSION.test(key) || Number(object.Size) <= 0) {
      continue;
    }
    const folder = key.includes('/') ? key.slice(0, key.lastIndexOf('/')) : '';
    const fileName = key.slice(key.lastIndexOf('/') + 1);
    const id = 's3:' + connection.id + ':' + encodeURIComponent(key);
    songs.push({
      id,
      source: 's3',
      title: fileName.replace(AUDIO_EXTENSION, ''),
      artist: '알 수 없는 아티스트',
      album: folder.split('/').pop() || connection.bucket,
      albumSource: 'fallback',
      albumId: 's3:' + connection.id + ':album:' + encodeURIComponent(folder),
      duration: 0,
      s3: {
        connectionId: connection.id,
        key,
        size: Number(object.Size),
        modifiedTime: typeof object.LastModified === 'string' ? object.LastModified : undefined,
      },
    });
  }
  const next = root.IsTruncated === 'true' ? root.NextContinuationToken : undefined;
  if (root.IsTruncated === 'true' && (typeof next !== 'string' || !next)) {
    throw new S3RequestError('S3 다음 페이지 정보를 확인할 수 없습니다.');
  }
  return { songs, next: next as string | undefined, scanned: contents.length };
}
