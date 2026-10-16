export const BOTTOM_MENU_IDS = ['library', 'playlists', 'search'] as const;
export const LIBRARY_MENU_IDS = ['albums', 'songs', 'artists', 'favorites'] as const;
export const PLAYER_MENU_IDS = ['lyrics', 'download', 'add-song', 'save-queue', 'equalizer', 'sleep-timer', 'section-repeat', 'playback-speed', 'delete-local', 'edit-metadata'] as const;
export type BottomMenuId = typeof BOTTOM_MENU_IDS[number];
export type LibraryMenuId = typeof LIBRARY_MENU_IDS[number];
export type PlayerMenuId = typeof PLAYER_MENU_IDS[number];
export type MenuId = BottomMenuId | LibraryMenuId | PlayerMenuId;
export type MenuItem<T extends MenuId = MenuId> = { id: T; visible: boolean };
export type MenuLayout = { bottom: MenuItem<BottomMenuId>[]; library: MenuItem<LibraryMenuId>[]; player: MenuItem<PlayerMenuId>[] };
export type MenuGroup = keyof MenuLayout;

export const MENU_LABELS: Record<MenuId, string> = {
  library: '보관함', playlists: '플레이리스트', search: '검색', albums: '앨범', songs: '노래', artists: '아티스트',
  favorites: '좋아요',
  lyrics: '가사 보기', download: '이 기기에 보관', 'add-song': '플레이리스트에 추가', 'save-queue': '대기열을 플레이리스트로 저장',
  equalizer: '시스템 이퀄라이저', 'sleep-timer': '수면 타이머', 'section-repeat': '구간 반복', 'delete-local': '기기의 음악 복사본 삭제',
  'playback-speed': '배속',
  'edit-metadata': '메타데이터 수정',
};
export const BOTTOM_MENU_ROUTES = { library: '(library)', playlists: '(playlists)', search: 'search' } as const;
export const BOTTOM_MENU_HREFS = { library: '/(tabs)/(library)', playlists: '/(tabs)/(playlists)/playlists', search: '/(tabs)/search' } as const;

export function defaultMenuLayout(): MenuLayout {
  return { bottom: BOTTOM_MENU_IDS.map(id => ({ id, visible: true })), library: LIBRARY_MENU_IDS.map(id => ({ id, visible: true })), player: PLAYER_MENU_IDS.map(id => ({ id, visible: true })) };
}

function parseItems<T extends MenuId>(value: unknown, ids: readonly T[]): MenuItem<T>[] {
  if (!Array.isArray(value) || value.length !== ids.length) throw new Error('메뉴 설정 형식이 올바르지 않습니다.');
  const seen = new Set<T>();
  const items = value.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('메뉴 설정 형식이 올바르지 않습니다.');
    const { id, visible } = item as Record<string, unknown>;
    if (!ids.includes(id as T) || seen.has(id as T) || typeof visible !== 'boolean') throw new Error('메뉴 설정 형식이 올바르지 않습니다.');
    seen.add(id as T);
    return { id: id as T, visible };
  });
  if (!items.some(item => item.visible)) throw new Error('각 메뉴에서 최소 하나의 항목은 켜져 있어야 합니다.');
  return items;
}

export function parseMenuLayout(value: unknown): MenuLayout {
  if (!value || typeof value !== 'object') throw new Error('메뉴 설정 형식이 올바르지 않습니다.');
  const layout = value as Record<string, unknown>;
  return { bottom: parseItems(layout.bottom, BOTTOM_MENU_IDS), library: parseLibraryItems(layout.library),
    // Settings saved before player-menu customization retain all playback actions.
    player: parsePlayerItems(layout.player) };
}

function parseLibraryItems(value: unknown): MenuItem<LibraryMenuId>[] {
  const legacyIds = LIBRARY_MENU_IDS.filter(id => id !== 'favorites');
  if (Array.isArray(value) && value.length === legacyIds.length && value.every(item => item?.id !== 'favorites')) {
    return [...parseItems(value, legacyIds), { id: 'favorites', visible: true }];
  }
  return parseItems(value, LIBRARY_MENU_IDS);
}

function parsePlayerItems(value: unknown): MenuItem<PlayerMenuId>[] {
  if (value === undefined) return PLAYER_MENU_IDS.map(id => ({ id, visible: true }));
  for (const additions of [['edit-metadata'], ['playback-speed', 'edit-metadata']] as const) {
    const legacyIds = PLAYER_MENU_IDS.filter(id => !(additions as readonly string[]).includes(id));
    if (Array.isArray(value) && value.length === legacyIds.length && value.every(item => !additions.some(id => item?.id === id))) {
      return [...parseItems(value, legacyIds), ...additions.map(id => ({ id, visible: true }))];
    }
  }
  return parseItems(value, PLAYER_MENU_IDS);
}

export function visibleMenuIds<T extends MenuId>(items: readonly MenuItem<T>[]): T[] {
  return items.filter(item => item.visible).map(item => item.id);
}

export function selectedMenuId<T extends MenuId>(items: readonly MenuItem<T>[], selected: T): T {
  const visible = visibleMenuIds(items);
  return visible.includes(selected) ? selected : visible[0];
}
