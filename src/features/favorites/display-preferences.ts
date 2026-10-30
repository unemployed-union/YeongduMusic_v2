export type FavoriteButtonLocation = 'songs' | 'player' | 'album';
export type FavoriteDisplayPreferences = { enabled: boolean } & Record<
  FavoriteButtonLocation,
  boolean
>;
export const DEFAULT_FAVORITE_DISPLAY: FavoriteDisplayPreferences = {
  enabled: true,
  songs: true,
  player: true,
  album: true,
};

export function parseFavoriteDisplay(value: unknown): FavoriteDisplayPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('좋아요 버튼 표시 설정이 올바르지 않습니다.');
  }
  const raw = value as Record<string, unknown>;
  if (['enabled', 'songs', 'player', 'album'].some((key) => typeof raw[key] !== 'boolean')) {
    throw new Error('좋아요 버튼 표시 설정이 올바르지 않습니다.');
  }
  return {
    enabled: raw.enabled as boolean,
    songs: raw.songs as boolean,
    player: raw.player as boolean,
    album: raw.album as boolean,
  };
}
