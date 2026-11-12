import type { Href } from 'expo-router';
import type { MusicSourceFilter } from '@/types/music';
import type { ImportKind } from '@/services/local-music/storage';

export interface MusicSourceMenuProps {
  sources: MusicSourceFilter[];
  selected: MusicSourceFilter;
  busy: boolean;
  error: string | null;
  setup: boolean;
  onSelect(source: MusicSourceFilter): void;
  onOpenConnection(href: Href): void;
  onImport(kind: ImportKind): void;
  onReload(): void;
}

export const SOURCE_CONNECTIONS = [
  {
    title: 'Jellyfin 연결 관리 (베타)',
    href: '/settings/cloud/jellyfin',
    icon: 'server-outline',
  },
  {
    title: 'Google Drive 연결 관리',
    href: '/settings/cloud/google-drive',
    icon: 'logo-google',
  },
  {
    title: 'S3 연결 관리 (베타)',
    href: '/settings/cloud/s3',
    icon: 'file-tray-stacked-outline',
  },
  {
    title: '네이버 MYBOX 연결 관리',
    href: '/settings/cloud/mybox',
    icon: 'cloud-outline',
  },
] as const;

export const SOURCE_SYMBOLS = {
  all: 'music.note',
  nas: 'server.rack',
  local: 'iphone',
  drive: 'externaldrive',
  s3: 'externaldrive.badge.icloud',
  mybox: 'cloud',
  jellyfin: 'play.rectangle',
} as const;
