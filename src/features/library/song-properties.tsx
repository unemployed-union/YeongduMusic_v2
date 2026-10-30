import { useState } from 'react';
import { ActionMenu, useMenuAction } from '@/components/action-menu';
import type { ActionMenuAnchor } from '@/components/action-menu-position';
import { MetadataEditor } from '@/features/metadata/metadata-editor';
import { AddToPlaylistDialog } from '@/features/playlists/dialogs';
import { DeleteLocalSongDialog } from '@/features/offline-music/delete-local-song-dialog';
import { enqueue } from '@/services/playback/controller';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import { hiddenMatcher } from '@/features/hidden-music/rules';
import type { Song } from '@/types/music';

export function SongProperties({
  song,
  anchor,
  onClose,
}: {
  song: Song;
  anchor: ActionMenuAnchor;
  onClose: () => void;
}) {
  const menu = useMenuAction<'playlist' | 'metadata' | 'artwork' | 'delete-local'>();
  const privacy = useHiddenMusicStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!privacy.ready || hiddenMatcher(privacy.profile.presets)(song)) {
    return null;
  }
  if (menu.action === 'playlist') {
    return <AddToPlaylistDialog songs={[song]} onClose={onClose} />;
  }
  if (menu.action === 'metadata' || menu.action === 'artwork') {
    return <MetadataEditor song={song} initialTab={menu.action} onClose={onClose} />;
  }
  if (menu.action === 'delete-local' && song.source === 'local') {
    return <DeleteLocalSongDialog song={song} onClose={onClose} />;
  }
  const select = (id: 'playlist' | 'metadata' | 'artwork' | 'queue' | 'delete-local') => {
    if (busy) {
      return;
    }
    if (id !== 'queue') {
      menu.select(id);
      return;
    }
    setBusy(true);
    setError(null);
    void enqueue(song)
      .then(onClose)
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : '대기열에 추가하지 못했습니다.');
        setBusy(false);
      });
  };
  return (
    <ActionMenu
      title={song.title}
      anchor={anchor}
      visible={menu.visible}
      onDismiss={menu.onDismiss}
      onClose={onClose}
      onSelect={select}
      error={error}
      items={[
        {
          id: 'playlist',
          label: '플레이리스트에 추가',
          icon: 'add-circle-outline',
          disabled: busy,
        },
        { id: 'queue', label: '다음 재생 대기열에 추가', icon: 'list-outline', disabled: busy },
        { id: 'metadata', label: '메타데이터 수정', icon: 'create-outline', disabled: busy },
        { id: 'artwork', label: '앨범아트 수정', icon: 'image-outline', disabled: busy },
        ...(song.source === 'local'
          ? [
              {
                id: 'delete-local' as const,
                label: song.local.downloadedFrom ? '다운로드 삭제' : '기기 음악 삭제',
                icon: 'trash-outline' as const,
                disabled: busy,
              },
            ]
          : []),
      ]}
    />
  );
}
