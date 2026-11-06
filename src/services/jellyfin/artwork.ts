import { Sha256 } from '@aws-crypto/sha256-js';
import { Directory, File, Paths } from 'expo-file-system';
import { cloudRequest } from '@/services/cloud-music/request';
import { JellyfinClient, JellyfinError, jellyfinScope, type JellyfinItem } from './api';

const PREFIX = 'jellyfin-artwork:';
const pending = new Map<string, Promise<string>>();

export function jellyfinArtwork(item: JellyfinItem, client: JellyfinClient): string | undefined {
  const id = item.ImageTags?.Primary ? item.Id : item.AlbumId;
  const tag = item.ImageTags?.Primary || item.AlbumPrimaryImageTag;
  if (!id || !tag) {
    return undefined;
  }
  return PREFIX + JSON.stringify([jellyfinScope(client.session), id, tag]);
}

export function artworkScope(uri: string): string | null {
  if (!uri.startsWith(PREFIX)) {
    return null;
  }
  const parts: unknown = JSON.parse(uri.slice(PREFIX.length));
  if (
    !Array.isArray(parts) ||
    parts.length !== 3 ||
    !parts.every((part) => typeof part === 'string' && part.length > 0)
  ) {
    throw new JellyfinError('앨범 아트 참조가 올바르지 않습니다.');
  }
  return parts[0];
}

export async function resolveJellyfinArtwork(uri: string, client: JellyfinClient): Promise<string> {
  if (artworkScope(uri) !== jellyfinScope(client.session)) {
    throw new JellyfinError('앨범 아트의 Jellyfin 계정 연결이 변경되었습니다.');
  }
  let task = pending.get(uri);
  if (!task) {
    task = downloadArtwork(uri, client);
    pending.set(uri, task);
    void task.finally(() => pending.delete(uri)).catch(() => {});
  }
  return task;
}

async function downloadArtwork(uri: string, client: JellyfinClient): Promise<string> {
  const [, id, tag] = JSON.parse(uri.slice(PREFIX.length)) as string[];
  const hash = new Sha256();
  hash.update(uri);
  const name = Array.from(await hash.digest(), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
  const directory = new Directory(Paths.cache, 'jellyfin-artwork');
  directory.create({ idempotent: true, intermediates: true });
  const file = new File(directory, name + '.jpg');
  if (file.exists && file.size > 0) {
    return file.uri;
  }
  const bytes = await cloudRequest('Jellyfin 앨범 아트', async (signal) => {
    const response = await fetch(
      client.url(`Items/${encodeURIComponent(id)}/Images/Primary`, {
        Tag: tag,
        MaxWidth: 1024,
        Format: 'Jpg',
      }),
      {
        headers: client.headers(),
        signal,
        redirect: 'error',
      },
    );
    if (!response.ok || !/^image\//i.test(response.headers.get('content-type') ?? '')) {
      throw new JellyfinError('Jellyfin 앨범 아트를 불러오지 못했습니다.', response.status);
    }
    if (Number(response.headers.get('content-length')) > 6 * 1024 * 1024) {
      throw new JellyfinError('앨범 아트가 너무 큽니다.');
    }
    const result = new Uint8Array(await response.arrayBuffer());
    if (!result.length || result.length > 6 * 1024 * 1024) {
      throw new JellyfinError('앨범 아트 크기가 올바르지 않습니다.');
    }
    return result;
  });
  // Bound disk use; these files are disposable and never contain authentication data.
  const previous = directory
    .list()
    .filter((entry): entry is File => entry instanceof File && entry.name.endsWith('.jpg'));
  previous.sort((a, b) => (a.modificationTime ?? 0) - (b.modificationTime ?? 0));
  for (const old of previous.slice(0, Math.max(0, previous.length - 127))) {
    await old.delete();
  }
  await file.write(bytes);
  return file.uri;
}
