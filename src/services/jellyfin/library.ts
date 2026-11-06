import type { Page, PageRequest, ServerPlaylist, Song } from '@/types/music';
import {
  JellyfinClient,
  JellyfinError,
  jellyfinEntityId,
  jellyfinScope,
  type JellyfinItem,
} from './api';
import { jellyfinSong } from './mapping';
import { jellyfinArtwork } from './artwork';

export async function collectJellyfinItems(
  read: (page: PageRequest) => Promise<Page<JellyfinItem>>,
  signal?: AbortSignal,
): Promise<JellyfinItem[]> {
  const items: JellyfinItem[] = [];
  while (true) {
    if (signal?.aborted) {
      throw new JellyfinError('Jellyfin 목록 요청이 취소되었습니다.');
    }
    const page = await read({ offset: items.length, limit: 100, signal });
    if (signal?.aborted) {
      throw new JellyfinError('Jellyfin 목록 요청이 취소되었습니다.');
    }
    if (!page.items.length && items.length < page.total) {
      throw new JellyfinError('Jellyfin 목록이 변경되었습니다. 다시 불러와 주세요.');
    }
    items.push(...page.items);
    if (items.length >= page.total) {
      return items;
    }
  }
}

export function mapJellyfinSongs(items: JellyfinItem[], client: JellyfinClient): Song[] {
  return items
    .filter((item) => !item.Type || item.Type === 'Audio')
    .map((item) => ({
      ...jellyfinSong(item, client.session),
      artworkUrl: jellyfinArtwork(item, client),
    }));
}

export async function loadJellyfinPlaylists(
  client: JellyfinClient,
  signal?: AbortSignal,
): Promise<ServerPlaylist[]> {
  const items = await collectJellyfinItems(
    (page) => client.items(page, { IncludeItemTypes: 'Playlist', MediaTypes: 'Audio' }),
    signal,
  );
  const scope = jellyfinScope(client.session);
  return items.map((item) => ({
    id: jellyfinEntityId(scope, 'playlist', item.Id!),
    name: item.Name || '이름 없는 플레이리스트',
    ref: { providerId: 'jellyfin', accountScope: scope, remoteId: item.Id! },
    songCount: item.ChildCount,
  }));
}
