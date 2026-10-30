export type LibraryDetailPreferences = { artistPhotos: boolean; albumColors: boolean };
export const DEFAULT_DETAIL_PREFERENCES: LibraryDetailPreferences = {
  artistPhotos: true,
  albumColors: true,
};

export function parseDetailPreferences(value: unknown): LibraryDetailPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('보관함 상세 화면 설정이 올바르지 않습니다.');
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.artistPhotos !== 'boolean' || typeof raw.albumColors !== 'boolean') {
    throw new Error('보관함 상세 화면 설정이 올바르지 않습니다.');
  }
  return { artistPhotos: raw.artistPhotos, albumColors: raw.albumColors };
}
