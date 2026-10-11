import { create } from 'zustand';
import { emptyPlaylists, playlistName } from '@/features/playlists/rules';
import { readPlaylists, writePlaylists } from '@/services/playlists/storage';
import type { PlaylistProfile, PlaylistPreset } from '@/types/playlists';

type State = {
  scope: string | null; ready: boolean; busy: boolean; error: string | null; profile: PlaylistProfile;
  load: (scope: string | null) => Promise<void>;
  createPreset: (name: string, songIds?: string[]) => Promise<string>;
  renamePreset: (id: string, name: string) => Promise<void>;
  addSongs: (id: string, songIds: string[]) => Promise<void>;
  removeSong: (id: string, songId: string) => Promise<void>;
  moveSong: (id: string, songId: string, direction: -1 | 1, visibleOrder?: string[]) => Promise<void>;
  removePreset: (id: string) => Promise<void>;
};
let generation = 0;
let writes: Promise<void> = Promise.resolve();
export const usePlaylistStore = create<State>((set, get) => {
  async function persist(change: (profile: PlaylistProfile) => PlaylistProfile) {
    const state = get();
    if (!state.ready || !state.scope) throw new Error('플레이리스트를 먼저 불러와 주세요.');
    if (state.busy) throw new Error('저장 중입니다. 잠시 후 다시 시도해 주세요.');
    const profile = change(state.profile);
    const current = generation;
    set({ busy: true, error: null });
    const operation = writes.catch(() => {}).then(() => writePlaylists(state.scope!, profile));
    writes = operation;
    try {
      await operation;
      if (current !== generation) throw new Error('계정이 변경되었습니다. 현재 계정에서 다시 시도해 주세요.');
      set({ profile });
    } catch (error) {
      if (current === generation) set({ error: error instanceof Error ? error.message : '플레이리스트를 저장하지 못했습니다.' });
      throw error;
    } finally { if (current === generation) set({ busy: false }); }
  }
  function edit(id: string, change: (preset: PlaylistPreset) => PlaylistPreset) {
    return persist((profile) => {
      if (!profile.presets.some((item) => item.id === id)) throw new Error('플레이리스트가 삭제되었습니다.');
      return { ...profile, presets: profile.presets.map((item) => item.id === id ? change(item) : item) };
    });
  }
  return {
    scope: null, ready: false, busy: false, error: null, profile: emptyPlaylists(),
    load: async (scope) => {
      const current = ++generation;
      set({ scope, ready: false, busy: false, error: null, profile: emptyPlaylists() });
      try {
        await writes.catch(() => {});
        if (current !== generation) return;
        const profile = scope ? await readPlaylists(scope) : emptyPlaylists();
        if (current === generation) set({ profile, ready: true });
      } catch (error) {
        if (current === generation) set({ error: error instanceof Error ? error.message : '플레이리스트를 불러오지 못했습니다.' });
      }
    },
    createPreset: async (name, songIds = []) => {
      const clean = playlistName(name);
      const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
      await persist((profile) => {
        if (profile.presets.some((item) => item.name === clean)) throw new Error('같은 이름의 플레이리스트가 있습니다. 다른 이름을 입력해 주세요.');
        return { ...profile, presets: [...profile.presets, { id, name: clean, songIds: [...new Set(songIds)] }] };
      });
      return id;
    },
    renamePreset: async (id, name) => {
      const clean = playlistName(name);
      if (get().profile.presets.some((item) => item.id !== id && item.name === clean)) return Promise.reject(new Error('같은 이름의 플레이리스트가 있습니다.'));
      return edit(id, (item) => ({ ...item, name: clean }));
    },
    addSongs: (id, songIds) => edit(id, (item) => ({ ...item, songIds: [...new Set([...item.songIds, ...songIds])] })),
    removeSong: (id, songId) => edit(id, (item) => ({ ...item, songIds: item.songIds.filter((value) => value !== songId) })),
    moveSong: (id, songId, direction, visibleOrder) => edit(id, (item) => {
      const songIds = [...item.songIds];
      const order = visibleOrder ? songIds.filter((id) => visibleOrder.includes(id)) : songIds;
      const index = order.indexOf(songId);
      const target = order[index + direction];
      const from = songIds.indexOf(songId), to = target ? songIds.indexOf(target) : -1;
      if (from >= 0 && to >= 0 && to < songIds.length) [songIds[from], songIds[to]] = [songIds[to], songIds[from]];
      return { ...item, songIds };
    }),
    removePreset: (id) => persist((profile) => ({ ...profile, presets: profile.presets.filter((item) => item.id !== id) })),
  };
});
