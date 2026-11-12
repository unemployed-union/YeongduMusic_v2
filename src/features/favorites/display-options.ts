import type { FavoriteDisplayPreferences } from './display-preferences';

export const FAVORITE_DISPLAY_OPTIONS = [
  {
    key: 'enabled',
    title: '좋아요 버튼 전체 표시',
    hint: '전체 표시를 꺼도 화면별 선택과 좋아요한 곡은 유지됩니다.',
    icon: 'heart-outline',
  },
  {
    key: 'songs',
    title: '노래 목록',
    hint: '노래·아티스트·검색·플레이리스트 등 곡 목록의 좋아요 버튼',
    icon: 'musical-notes-outline',
  },
  {
    key: 'player',
    title: '재생 화면',
    hint: '재생 중인 곡 제목 옆의 좋아요 버튼',
    icon: 'play-circle-outline',
  },
  {
    key: 'album',
    title: '앨범',
    hint: '앨범 상세의 곡 목록에 있는 좋아요 버튼',
    icon: 'albums-outline',
  },
] as const satisfies readonly {
  key: keyof FavoriteDisplayPreferences;
  title: string;
  hint: string;
  icon: string;
}[];
