import { useEffect } from 'react';
import { router } from 'expo-router';
import { ActionMenu, useMenuAction } from '@/components/action-menu';
import type { ActionMenuAnchor } from '@/components/action-menu-position';
import { AlbumArtworkEditor } from '@/features/artwork/album-artwork-editor';
import { AddToPlaylistDialog } from '@/features/playlists/dialogs';
import { useAlbumSongs } from './queries';
import type { Album } from '@/types/music';

export function AlbumProperties({ album, anchor, onClose }: { album: Album; anchor: ActionMenuAnchor; onClose: () => void }) {
  const query = useAlbumSongs(album);
  const menu = useMenuAction<'open' | 'playlist' | 'artwork'>();
  const songs = query.data?.items ?? [];
  useEffect(() => {
    if (menu.action !== 'open') return;
    onClose(); router.push({ pathname: '/(tabs)/(library)/album/[id]', params: { id: album.id, title: album.title, artist: album.artist, artworkUrl: album.artworkUrl ?? '' } });
  }, [album, menu.action, onClose]);
  if (menu.action === 'open') return null;
  if (menu.action === 'playlist') return <AddToPlaylistDialog songs={songs} onClose={onClose} />;
  if (menu.action === 'artwork') return <AlbumArtworkEditor title="앨범아트 수정" album={album} songs={songs} onClose={onClose}
    loading={query.isPending && !query.data} error={query.isError && !query.data ? query.error.message : null} onRetry={() => { void query.refetch(); }} />;
  return <ActionMenu title={album.title} anchor={anchor} visible={menu.visible} onDismiss={menu.onDismiss} onClose={onClose} onSelect={menu.select} items={[
    { id: 'open', label: '앨범 열기', icon: 'disc-outline' },
    { id: 'playlist', label: '플레이리스트에 추가', icon: 'add-circle-outline', disabled: !songs.length },
    { id: 'artwork', label: '앨범아트 수정', icon: 'image-outline' },
  ]} />;
}
