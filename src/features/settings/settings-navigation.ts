import type { ComponentProps } from 'react';
import type Ionicons from '@expo/vector-icons/Ionicons';

export const SETTINGS_NAVIGATION: {
  title: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  path: string;
  matches?: string[];
  hidden?: boolean;
}[] = [
  { title: '설정 전체', icon: 'grid-outline', path: 'settings' },
  { title: '클라우드 연결', icon: 'cloud-outline', path: 'settings/cloud' },
  {
    title: '재생 및 화면',
    icon: 'musical-notes-outline',
    path: 'settings/playback',
    matches: ['settings/colors', 'settings/player-menu'],
  },
  { title: '햅틱 피드백', icon: 'phone-portrait-outline', path: 'settings/haptics' },
  { title: '하단 메뉴', icon: 'reorder-three-outline', path: 'settings/bottom-menu' },
  { title: '보관함', icon: 'library-outline', path: 'settings/library' },
  { title: '설정 백업 및 복구', icon: 'save-outline', path: 'settings/backup' },
  { title: '플레이리스트 백업', icon: 'copy-outline', path: 'settings/playlist-backup' },
  { title: '오픈소스 라이선스', icon: 'document-text-outline', path: 'settings/licenses' },
  {
    title: '기타',
    icon: 'ellipsis-horizontal-circle-outline',
    path: 'settings/other',
    matches: ['settings/quick-hide-preset', 'hidden-music', 'hidden-playlists'],
    hidden: true,
  },
];

export function selectedSettingsPath(route: string): string | undefined {
  return SETTINGS_NAVIGATION.find((item) =>
    [item.path, ...(item.matches ?? [])].some(
      (path) => route === path || (path !== 'settings' && route.startsWith(path + '/')),
    ),
  )?.path;
}
