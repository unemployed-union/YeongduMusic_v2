import type { LibraryTab } from './library-page';
import type { LibrarySortOrder } from './sort-library';

export const SORT_LABELS: Record<LibrarySortOrder, string> = {
  default: '기본',
  ascending: '오름차순',
  descending: '내림차순',
};

export const SORT_TAB_LABELS: Record<LibraryTab, string> = {
  songs: '노래',
  albums: '앨범',
  artists: '아티스트',
  favorites: '좋아요',
};

export const SORT_ORDERS: LibrarySortOrder[] = ['default', 'ascending', 'descending'];

export function librarySortFieldLabel(tab: LibraryTab): string {
  if (tab === 'artists') {
    return '아티스트 이름';
  }
  if (tab === 'albums') {
    return '앨범 제목';
  }
  return '노래 제목';
}
