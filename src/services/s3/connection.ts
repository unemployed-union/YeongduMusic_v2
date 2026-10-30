import { S3RequestPresigner } from '@aws-sdk/s3-request-presigner';
import { formatUrl } from '@aws-sdk/util-format-url';
import { HttpRequest } from '@smithy/protocol-http';
import { Sha256 } from '@aws-crypto/sha256-js';
import { CloudRequestError } from '@/services/cloud-music/request';

export type S3Input = {
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  pathStyle: boolean;
  allowHttp: boolean;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
};
export type S3Connection = S3Input & { id: string };
export type S3PublicConnection = Omit<
  S3Connection,
  'accessKeyId' | 'secretAccessKey' | 'sessionToken'
>;
export class S3RequestError extends CloudRequestError {
  constructor(message: string, status?: number) {
    super(message, status);
    this.name = 'S3RequestError';
  }
}
export async function prepareS3Connection(input: S3Input): Promise<S3Connection> {
  if (
    !input ||
    typeof input !== 'object' ||
    ['endpoint', 'region', 'bucket', 'prefix', 'accessKeyId', 'secretAccessKey'].some(
      (key) => typeof input[key as keyof S3Input] !== 'string',
    ) ||
    typeof input.pathStyle !== 'boolean' ||
    typeof input.allowHttp !== 'boolean' ||
    (input.sessionToken !== undefined && typeof input.sessionToken !== 'string')
  ) {
    throw new S3RequestError('S3 연결 정보를 확인해 주세요.');
  }
  const region = input.region.trim();
  const bucket = input.bucket.trim();
  const accessKeyId = input.accessKeyId.trim();
  if (!/^[a-z0-9-]+$/.test(region) || !region || region.length > 64) {
    throw new S3RequestError(
      'S3 리전을 입력해 주세요. AWS는 버킷의 실제 리전, 호환 서비스는 해당 서비스의 리전을 사용합니다.',
    );
  }
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,254}$/.test(bucket) ||
    (!input.pathStyle && !/^[a-z0-9][a-z0-9.-]*$/.test(bucket))
  ) {
    throw new S3RequestError('S3 버킷 이름과 주소 방식을 확인해 주세요.');
  }
  if (
    !accessKeyId ||
    !input.secretAccessKey ||
    /[\r\n]/.test(accessKeyId + input.secretAccessKey + (input.sessionToken ?? ''))
  ) {
    throw new S3RequestError('S3 Access Key와 Secret Key를 입력해 주세요.');
  }
  let endpoint: URL;
  try {
    endpoint = new URL(
      input.endpoint.trim() ||
        'https://s3.' +
          region +
          (region.startsWith('cn-') ? '.amazonaws.com.cn' : '.amazonaws.com'),
    );
  } catch {
    throw new S3RequestError('S3 엔드포인트 URL을 확인해 주세요.');
  }
  if (
    !['https:', 'http:'].includes(endpoint.protocol) ||
    (endpoint.protocol === 'http:' && !input.allowHttp) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.pathname !== '/'
  ) {
    throw new S3RequestError(
      'S3 엔드포인트는 경로 없는 HTTPS 주소를 사용하세요. HTTP는 별도로 허용해야 합니다.',
    );
  }
  if (
    input.prefix.length > 1024 ||
    accessKeyId.length > 256 ||
    input.secretAccessKey.length > 1024 ||
    (input.sessionToken?.length ?? 0) > 8192
  ) {
    throw new S3RequestError('S3 연결 정보가 너무 깁니다.');
  }
  const hash = new Sha256();
  // Keep object IDs stable when changing the selected prefix or rotating a secret.
  hash.update(JSON.stringify([endpoint.origin, region, bucket, accessKeyId]));
  const id = Array.from(await hash.digest(), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return {
    endpoint: endpoint.origin,
    region,
    bucket,
    prefix: input.prefix,
    pathStyle: input.pathStyle,
    allowHttp: input.allowHttp,
    accessKeyId,
    secretAccessKey: input.secretAccessKey,
    sessionToken: input.sessionToken || undefined,
    id,
  };
}
export function publicS3Connection(connection: S3Connection): S3PublicConnection {
  const {
    accessKeyId: _access,
    secretAccessKey: _secret,
    sessionToken: _token,
    ...visible
  } = connection;
  return visible;
}
const encode = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => '%' + char.charCodeAt(0).toString(16).toUpperCase(),
  );
export async function signedS3Url(
  connection: S3Connection,
  key?: string,
  query: Record<string, string> = {},
  expiresIn = 86400,
  request: { method: 'GET' | 'HEAD' | 'PUT'; headers?: Record<string, string> } = { method: 'GET' },
): Promise<string> {
  if (
    key !== undefined &&
    (!key ||
      !key.startsWith(connection.prefix) ||
      key.split('/').some((part) => part === '.' || part === '..'))
  ) {
    throw new S3RequestError(
      'S3 음악 경로나 선택한 접두사가 변경되었습니다. 목록을 다시 불러와 주세요.',
    );
  }
  const endpoint = new URL(connection.endpoint);
  if (!connection.pathStyle && endpoint.hostname.includes(':')) {
    throw new S3RequestError('IP 주소 엔드포인트에는 Path-style을 사용하세요.');
  }
  const path =
    (connection.pathStyle ? '/' + encode(connection.bucket) : '') +
    (key === undefined ? '/' : '/' + key.split('/').map(encode).join('/'));
  const presigner = new S3RequestPresigner({
    region: connection.region,
    sha256: Sha256,
    credentials: {
      accessKeyId: connection.accessKeyId,
      secretAccessKey: connection.secretAccessKey,
      sessionToken: connection.sessionToken,
    },
  });
  return formatUrl(
    await presigner.presign(
      new HttpRequest({
        protocol: endpoint.protocol,
        hostname: connection.pathStyle
          ? endpoint.hostname
          : connection.bucket + '.' + endpoint.hostname,
        port: endpoint.port ? Number(endpoint.port) : undefined,
        path,
        query,
        method: request.method,
        headers: request.headers ?? {},
      }),
      {
        expiresIn,
        unhoistableHeaders: new Set(
          Object.keys(request.headers ?? {}).filter((header) => header.startsWith('x-amz-')),
        ),
      },
    ),
  );
}
