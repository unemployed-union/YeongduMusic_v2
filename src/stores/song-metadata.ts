import { Platform } from 'react-native';
import { create } from 'zustand';
import { parseMetadata, parseMetadataStorage, validateMetadataKey, type MetadataPatches } from '@/features/metadata/rules';
import type { SongMetadata } from '@/types/music';

const KEY = 'yeongdumusic-song-metadata-v1';
type MetadataState = {
  patches: MetadataPatches; ready: boolean; loading: boolean; busy: boolean; error: string | null; loadError: boolean;
  load: (force?: boolean) => Promise<void>; save: (key: string, fields: SongMetadata) => Promise<void>; reset: (key: string) => Promise<void>;
  saveAutomatic: (key: string, fields: SongMetadata, allowed: () => boolean) => Promise<boolean>;
};
async function read() {
  return Platform.OS === 'web' ? (typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY)) : (await import('expo-sqlite/kv-store')).default.getItem(KEY);
}
async function write(patches: MetadataPatches) {
  const value = JSON.stringify({ version: 1, patches });
  if (Platform.OS === 'web') localStorage.setItem(KEY, value);
  else await (await import('expo-sqlite/kv-store')).default.setItem(KEY, value);
}
export const useSongMetadataStore = create<MetadataState>((set, get) => {
  let loading: Promise<void> | null = null, tail: Promise<void> = Promise.resolve(), writes = 0;
  async function change(key: string, fields?: SongMetadata, allowed?: () => boolean) {
    validateMetadataKey(key);
    const patch = fields ? parseMetadata(fields) : undefined;
    await get().load();
    if (get().loadError) throw new Error(get().error ?? '곡 정보를 다시 불러온 뒤 저장해 주세요.');
    writes++; set({ busy: true, error: null });
    const operation = tail.then(async () => {
      if (allowed && (!allowed() || get().patches[key])) return false;
      const patches = { ...get().patches };
      if (patch) patches[key] = patch; else delete patches[key];
      if (Object.keys(patches).length > 10000) throw new Error('수정할 수 있는 곡은 최대 10,000곡입니다.');
      await write(patches);
      // A switch/account/visibility change during native storage I/O must also
      // leave no automatic edit to reappear on the next app launch.
      if (allowed && !allowed()) { await write(get().patches); return false; }
      set({ patches, error: null });
      return true;
    });
    tail = operation.then(() => {}, () => {});
    try { return await operation; }
    catch { const error = '곡 정보를 저장하지 못했습니다. 다시 시도해 주세요.'; set({ error }); throw new Error(error); }
    finally { writes--; set({ busy: writes > 0 }); }
  }
  return {
    patches: {}, ready: false, loading: false, busy: false, error: null, loadError: false,
    load: (force = false) => {
      if (loading) return loading;
      if (get().ready && !force) return Promise.resolve();
      set({ loading: true, error: null });
      loading = tail.then(async () => { const patches = parseMetadataStorage(await read()); set({ patches, ready: true, loadError: false }); })
        .catch(() => set({ ready: true, loadError: true, error: '수정한 곡 정보를 불러오지 못했습니다. 다시 불러온 뒤 편집해 주세요.' }))
        .finally(() => { loading = null; set({ loading: false }); });
      return loading;
    },
    save: async (key, fields) => { await change(key, fields); }, reset: async key => { await change(key); },
    saveAutomatic: (key, fields, allowed) => change(key, fields, allowed),
  };
});
