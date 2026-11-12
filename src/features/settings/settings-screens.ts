/** Route names stay internal; public settings and hidden-menu URLs are unchanged. */
export const SETTINGS_SCREENS = [
  {
    name: 'settings/index',
    title: '설정',
    backTitle: '뒤로',
  },
  {
    name: 'settings/cloud',
    title: '클라우드 연결',
    backTitle: '설정',
  },
  {
    name: 'settings/cloud/synology',
    title: 'Synology',
    backTitle: '클라우드 연결',
  },
  {
    name: 'settings/cloud/jellyfin',
    title: 'Jellyfin (베타)',
    backTitle: '클라우드 연결',
  },
  {
    name: 'settings/cloud/google-drive',
    title: 'Google Drive',
    backTitle: '클라우드 연결',
  },
  {
    name: 'settings/cloud/s3',
    title: 'S3 호환 저장소 (베타)',
    backTitle: '클라우드 연결',
  },
  {
    name: 'settings/cloud/mybox',
    title: '네이버 MYBOX',
    backTitle: '클라우드 연결',
  },
  {
    name: 'settings/playback',
    title: '재생 및 화면',
    backTitle: '설정',
  },
  {
    name: 'settings/colors',
    title: '색상 설정',
    backTitle: '재생 및 화면',
  },
  {
    name: 'settings/haptics',
    title: '햅틱 피드백',
    backTitle: '설정',
  },
  {
    name: 'settings/library',
    title: '보관함 설정',
    backTitle: '설정',
  },
  {
    name: 'settings/bottom-menu',
    title: '하단 메뉴 설정',
    backTitle: '설정',
  },
  {
    name: 'settings/player-menu',
    title: '재생 화면 메뉴 설정',
    backTitle: '설정',
  },
  {
    name: 'settings/backup',
    title: '설정 백업 및 복구',
    backTitle: '설정',
  },
  {
    name: 'settings/playlist-backup',
    title: '플레이리스트 백업 및 복구',
    backTitle: '뒤로',
  },
  {
    name: 'settings/licenses',
    title: '오픈소스 라이선스',
    backTitle: '설정',
  },
  {
    name: 'settings/other',
    title: '기타',
    backTitle: '설정',
  },
  {
    name: 'settings/quick-hide-preset',
    title: '빠른 숨기기 대상',
    backTitle: '기타',
  },
  {
    name: 'hidden-music',
    title: '음악 숨기기',
    backTitle: '기타',
  },
  {
    name: 'hidden-playlists',
    title: '플레이리스트 숨기기',
    backTitle: '기타',
  },
] as const;
