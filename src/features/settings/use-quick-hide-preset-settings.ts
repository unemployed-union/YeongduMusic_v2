import { useMemo } from 'react';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import { usePlaylistStore } from '@/stores/playlists';
import type { HiddenPreset } from '@/types/hidden-music';
import type { PlaylistPreset } from '@/types/playlists';

type Choice =
  | { kind: 'preset'; id: string; preset: HiddenPreset }
  | { kind: 'playlist'; id: string; playlist: PlaylistPreset }
  | { kind: 'heading'; id: string; title: string; detail: string }
  | { kind: 'empty-presets' | 'empty-playlists' | 'playlist-status'; id: string };

export function useQuickHidePresetSettings() {
  const privacy = useHiddenMusicStore();
  const playlists = usePlaylistStore();
  const playlistsReady = playlists.ready && playlists.scope === privacy.scope;
  const choices = useMemo<Choice[]>(() => {
    let playlistChoices: Choice[];
    if (!playlistsReady) {
      playlistChoices = [{ kind: 'playlist-status' as const, id: 'playlist-status' }];
    } else if (playlists.profile.presets.length) {
      playlistChoices = playlists.profile.presets.map((playlist) => ({
        kind: 'playlist' as const,
        id: 'playlist:' + playlist.id,
        playlist,
      }));
    } else {
      playlistChoices = [{ kind: 'empty-playlists' as const, id: 'empty-playlists' }];
    }
    return [
      {
        kind: 'heading',
        id: 'music-heading',
        title: '음악 숨김 프리셋',
        detail: '‘특정 프리셋 숨기기’에서 적용할 프리셋을 하나 선택하세요.',
      },
      ...(privacy.profile.presets.length
        ? privacy.profile.presets.map((preset) => ({
            kind: 'preset' as const,
            id: 'preset:' + preset.id,
            preset,
          }))
        : [{ kind: 'empty-presets' as const, id: 'empty-presets' }]),
      {
        kind: 'heading',
        id: 'playlist-heading',
        title: '함께 숨길 플레이리스트',
        detail:
          '전체·특정 프리셋 숨기기 모두에서 함께 숨길 목록을 선택하세요. 목록에 포함된 곡을 별도로 숨기지는 않습니다.',
      },
      ...playlistChoices,
    ];
  }, [privacy.profile.presets, playlistsReady, playlists.profile.presets]);
  async function select(id: string) {
    try {
      await privacy.setQuickHidePreset(id);
    } catch {
      /* The store exposes the saved error for retry. */
    }
  }
  async function selectPlaylist(id: string) {
    const current = useHiddenMusicStore.getState();
    const lists = usePlaylistStore.getState();
    if (
      !lists.ready ||
      lists.scope !== current.scope ||
      current.scope !== privacy.scope ||
      !lists.profile.presets.some((item) => item.id === id)
    ) {
      return;
    }
    try {
      await current.setQuickHidePlaylist(id, !current.profile.quickHidePlaylistIds?.includes(id));
    } catch {
      /* The store exposes the saved error for retry. */
    }
  }
  return { privacy, playlists, playlistsReady, choices, select, selectPlaylist };
}
