import { Platform } from 'react-native';
import { create } from 'zustand';
import { parseArtworkStorage, validateArtwork, type ArtworkPatches } from '@/features/artwork/rules';
import { validateMetadataKey } from '@/features/metadata/rules';

const KEY = 'yeongdumusic-song-artwork-v1';
type State = { patches: ArtworkPatches; baseUri: string; ready: boolean; loading: boolean; busy: boolean; loadError: boolean; error: string | null;
  load: (force?: boolean) => Promise<void>; save: (keys: string[], image: string | undefined, allowed?: () => boolean) => Promise<void> };
export const useSongArtworkStore = create<State>((set, get) => {
  let loading: Promise<void> | null = null, tail: Promise<void> = Promise.resolve(), writes = 0;
  async function write(patches: ArtworkPatches) {
    const raw = JSON.stringify({ version: 1, patches });
    if (Platform.OS === 'web') localStorage.setItem(KEY, raw);
    else await (await import('expo-sqlite/kv-store')).default.setItem(KEY, raw);
  }
  return {
    patches: {}, baseUri: '', ready: false, loading: false, busy: false, loadError: false, error: null,
    load: (force = false) => {
      if (loading) return loading;
      if (get().ready && !force) return Promise.resolve();
      set({ loading: true, error: null });
      loading = tail.then(async () => {
        const raw = Platform.OS === 'web' ? (typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY)) : await (await import('expo-sqlite/kv-store')).default.getItem(KEY);
        const patches = parseArtworkStorage(raw);
        const baseUri = Platform.OS === 'web' ? '' : (await import('@/services/artwork/files')).artworkBaseUri();
        set({ patches, baseUri, ready: true, loadError: false });
      }).catch(() => set({ ready: true, loadError: true, error: '앨범아트 수정 내용을 불러오지 못했습니다. 다시 불러와 주세요.' }))
        .finally(() => { loading = null; set({ loading: false }); });
      return loading;
    },
    save: async (keys, image, allowed) => {
      const unique = [...new Set(keys)]; unique.forEach(validateMetadataKey);
      if (!unique.length) throw new Error('앨범아트를 적용할 곡을 찾을 수 없습니다.');
      if (image !== undefined) validateArtwork(image);
      await get().load();
      if (get().loadError) throw new Error('앨범아트 수정 내용을 다시 불러와 주세요.');
      writes++; set({ busy: true, error: null });
      const operation = tail.then(async () => {
        if (allowed && !allowed()) throw new Error('앨범아트 수정이 취소되었습니다. 곡 메뉴에서 다시 열어 주세요.');
        const patches = { ...get().patches };
        for (const key of unique) { if (image === undefined) delete patches[key]; else patches[key] = image; }
        if (Object.keys(patches).length > 10000) throw new Error('앨범아트는 최대 10,000곡에 저장할 수 있습니다.');
        await write(patches);
        if (allowed && !allowed()) { await write(get().patches); throw new Error('앨범아트 수정이 취소되었습니다.'); }
        set({ patches, error: null });
      });
      tail = operation.catch(() => {});
      try { await operation; }
      catch (cause) { const error = cause instanceof Error && cause.message.includes('취소') ? cause.message : '앨범아트를 저장하지 못했습니다. 저장 공간을 확인한 뒤 다시 시도해 주세요.'; set({ error }); throw new Error(error); }
      finally { writes--; set({ busy: writes > 0 }); }
    },
  };
});
