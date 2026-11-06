import { cloudRequest, CloudRequestError } from '@/services/cloud-music/request';
import type { MusicLibrary, Page, PageRequest } from '@/types/music';

export type JellyfinSession = {
  baseUrl: string;
  userId: string;
  username: string;
  serverId: string;
  version: string;
  deviceId: string;
  token: string;
};

export type JellyfinItem = {
  Id?: string;
  Name?: string;
  Type?: string;
  CollectionType?: string;
  Artists?: string[];
  AlbumArtist?: string;
  Album?: string;
  AlbumId?: string;
  RunTimeTicks?: number;
  ProductionYear?: number;
  IndexNumber?: number;
  ParentIndexNumber?: number;
  ChildCount?: number;
  ImageTags?: Record<string, string>;
  AlbumPrimaryImageTag?: string;
  MediaStreams?: { Type?: string; Codec?: string }[];
};

function validItem(value: unknown): value is JellyfinItem {
  return value !== null && typeof value === 'object' && 'Id' in value && typeof value.Id === 'string' && value.Id.length > 0;
}

export class JellyfinError extends CloudRequestError {
  constructor(message: string, status?: number) {
    super(message, status);
    this.name = 'JellyfinError';
  }
}

export function normalizeJellyfinAddress(input: string, allowHttp = false): string {
  let url: URL;
  try {
    url = new URL(input.includes('://') ? input.trim() : 'https://' + input.trim());
  } catch {
    throw new JellyfinError('Jellyfin 서버 주소를 확인해 주세요.');
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new JellyfinError('서버 주소에는 HTTP(S) 주소와 Base URL 경로만 입력해 주세요.');
  }
  if (url.protocol === 'http:' && !allowHttp) {
    throw new JellyfinError('HTTP 연결을 사용하려면 암호화되지 않은 연결을 허용해 주세요.');
  }
  return url.toString().replace(/\/+$/, '');
}

export function jellyfinScope(
  session: Pick<JellyfinSession, 'baseUrl' | 'serverId' | 'userId'>,
): string {
  return JSON.stringify([session.baseUrl, session.serverId, session.userId]);
}

export function jellyfinEntityId(scope: string, kind: string, remoteId: string): string {
  return 'jellyfin:' + JSON.stringify([scope, kind, remoteId]);
}

function quoted(value: string): string {
  return value.replace(/[\\"\r\n]/g, '');
}

export function jellyfinHeaders(deviceId: string, token?: string): Record<string, string> {
  let authorization = `MediaBrowser Client="YeongduMusic", Device="YeongduMusic", DeviceId="${quoted(deviceId)}", Version="1.0.0"`;
  if (token) {
    authorization += `, Token="${quoted(token)}"`;
  }
  return { Authorization: authorization };
}

export class JellyfinClient {
  constructor(readonly session: JellyfinSession) {}

  url(
    path: string,
    parameters: Record<string, string | number | boolean | undefined> = {},
  ): string {
    const url = new URL(this.session.baseUrl + '/' + path.replace(/^\/+/, ''));
    for (const [key, value] of Object.entries(parameters)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  headers(): Record<string, string> {
    return jellyfinHeaders(this.session.deviceId, this.session.token);
  }

  request<T>(
    path: string,
    options: {
      signal?: AbortSignal;
      body?: unknown;
      method?: string;
      query?: Record<string, string | number | boolean | undefined>;
    } = {},
  ): Promise<T> {
    return cloudRequest(
      'Jellyfin',
      async (signal) => {
        const response = await fetch(this.url(path, options.query), {
          method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
          headers: {
            ...this.headers(),
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal,
          redirect: 'error',
        });
        const contentType = response.headers.get('content-type') ?? '';
        if (/text\/html/i.test(contentType)) {
          throw new JellyfinError(
            'Jellyfin 대신 웹 인증 화면이 응답했습니다. Cloudflare Access 또는 프록시 설정을 확인해 주세요.',
          );
        }
        if (!response.ok) {
          if (response.status === 401) {
            throw new JellyfinError(
              'Jellyfin 인증이 만료되었거나 로그인 정보가 올바르지 않습니다. 다시 로그인해 주세요.',
              401,
            );
          }
          if (response.status === 403) {
            throw new JellyfinError('이 Jellyfin 항목에 접근할 권한이 없습니다.', 403);
          }
          throw new JellyfinError(
            'Jellyfin 요청에 실패했습니다. 서버 상태를 확인해 주세요.',
            response.status,
          );
        }
        if (response.status === 204) {
          return undefined as T;
        }
        if (!/application\/(?:[\w.+-]*\+)?json/i.test(contentType)) {
          throw new JellyfinError(
            'Jellyfin API 응답을 확인할 수 없습니다. 서버 주소와 Base URL을 확인해 주세요.',
          );
        }
        try {
          return (await response.json()) as T;
        } catch {
          throw new JellyfinError('Jellyfin 응답 형식이 올바르지 않습니다.');
        }
      },
      options.signal,
      (message) => new JellyfinError(message),
    );
  }

  async check(signal?: AbortSignal): Promise<void> {
    const user = await this.request<{ Id?: string }>('Users/Me', { signal });
    if (user.Id !== this.session.userId) {
      throw new JellyfinError('Jellyfin 사용자 정보를 확인할 수 없습니다.', 401);
    }
  }

  async libraries(signal?: AbortSignal): Promise<MusicLibrary[]> {
    const result = await this.request<{ Items?: JellyfinItem[] }>('UserViews', {
      signal,
      query: { UserId: this.session.userId },
    });
    if (!Array.isArray(result.Items) || !result.Items.every(validItem)) {
      throw new JellyfinError('음악 라이브러리 응답이 올바르지 않습니다.');
    }
    return result.Items.filter((item) => item.CollectionType === 'music' && item.Id).map(
      (item) => ({ id: item.Id!, name: item.Name || '음악 라이브러리' }),
    );
  }

  async items(
    page: PageRequest,
    query: Record<string, string | number | boolean | undefined> = {},
    playlistId?: string,
  ): Promise<Page<JellyfinItem>> {
    const path = playlistId ? `Playlists/${encodeURIComponent(playlistId)}/Items` : 'Items';
    const result = await this.request<{ Items?: JellyfinItem[]; TotalRecordCount?: number }>(path, {
      signal: page.signal,
      query: {
        UserId: this.session.userId,
        Recursive: true,
        IncludeItemTypes: 'Audio',
        Fields: 'MediaStreams',
        SortBy: playlistId ? undefined : 'SortName',
        SortOrder: 'Ascending',
        StartIndex: page.offset,
        Limit: page.limit,
        ...query,
      },
    });
    if (
      !Array.isArray(result.Items) ||
      !Number.isSafeInteger(result.TotalRecordCount) ||
      result.TotalRecordCount! < 0 ||
      !result.Items.every(validItem)
    ) {
      throw new JellyfinError('Jellyfin 목록 응답이 올바르지 않습니다.');
    }
    return { items: result.Items, total: result.TotalRecordCount! };
  }
}

export async function loginJellyfin(
  address: string,
  username: string,
  password: string,
  deviceId: string,
  allowHttp = false,
  signal?: AbortSignal,
): Promise<JellyfinSession> {
  const baseUrl = normalizeJellyfinAddress(address, allowHttp);
  const client = new JellyfinClient({
    baseUrl,
    deviceId,
    userId: '',
    username: '',
    serverId: '',
    version: '',
    token: '',
  });
  const info = await client.request<{ Id?: string; Version?: string }>('System/Info/Public', {
    signal,
  });
  if (typeof info.Id !== 'string' || !info.Id || typeof info.Version !== 'string' || !info.Version) {
    throw new JellyfinError('Jellyfin 서버 정보를 확인할 수 없습니다.');
  }
  const auth = await client.request<{
    AccessToken?: string;
    User?: { Id?: string; Name?: string };
  }>('Users/AuthenticateByName', { signal, body: { Username: username.trim(), Pw: password } });
  if (typeof auth.AccessToken !== 'string' || !auth.AccessToken || typeof auth.User?.Id !== 'string' || !auth.User.Id) {
    throw new JellyfinError('Jellyfin 로그인 응답이 올바르지 않습니다.');
  }
  return {
    baseUrl,
    deviceId,
    serverId: info.Id,
    version: info.Version,
    token: auth.AccessToken,
    userId: auth.User.Id,
    username: auth.User.Name || username.trim(),
  };
}
