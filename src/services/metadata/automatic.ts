import { useWebMetadataStore } from '@/stores/web-metadata';
import { useSongMetadataStore } from '@/stores/song-metadata';
import { metadataKey } from '@/features/metadata/rules';
import { automaticMetadata, lookupFingerprint, needsAutomaticMetadata } from '@/features/metadata/web-rules';
import { searchWebMetadata } from './web-search';
import type { Song } from '@/types/music';

/** The caller supplies only the current visible library, and revalidates it before saving. */
export async function runAutomaticMetadata(getSongs: () => readonly Song[], scope: string | null, signal: AbortSignal): Promise<void> {
  let scanned = 0, applied = 0;
  const valid = () => {
    const preferences = useWebMetadataStore.getState(), metadata = useSongMetadataStore.getState();
    return !signal.aborted && preferences.ready && preferences.enabled && !preferences.loadError && !preferences.saving
      && metadata.ready && !metadata.loadError;
  };
  try {
    if (!valid()) return;
    const initial = useWebMetadataStore.getState(), patches = useSongMetadataStore.getState().patches;
    // Build one pass, avoiding repeated serialization of every already-checked song.
    // Library changes during the pass schedule a new pass in the calling hook.
    const queue = getSongs().filter(song => {
      const key = metadataKey(song, scope);
      return key && !initial.excluded[key] && !patches[key] && needsAutomaticMetadata(song) && initial.checked[key] !== lookupFingerprint(song);
    });
    for (const song of queue) {
      if (!valid()) break;
      const preferences = useWebMetadataStore.getState(), metadata = useSongMetadataStore.getState();
      const key = metadataKey(song, scope)!, fingerprint = lookupFingerprint(song);
      if (preferences.excluded[key] || metadata.patches[key] || preferences.checked[key] === fingerprint) continue;
      const allowed = () => valid() && !useWebMetadataStore.getState().excluded[key]
        && getSongs().some(item => metadataKey(item, scope) === key && lookupFingerprint(item) === fingerprint);
      if (!allowed()) continue;
      useWebMetadataStore.setState({ status: `웹 곡 정보 검색 중: ${song.title}` });
      const candidates = await searchWebMetadata(song.title, song.artist, signal);
      if (!allowed()) continue;
      const fields = automaticMetadata(song, candidates);
      if (fields) {
        if (await useSongMetadataStore.getState().saveAutomatic(key, fields, allowed)) applied++;
      }
      if (allowed()) { await useWebMetadataStore.getState().markChecked(key, fingerprint); scanned++; }
    }
    if (!signal.aborted && scanned) useWebMetadataStore.setState({ status: `${scanned}곡 확인 · ${applied}곡 정보 적용` });
  } catch (cause) {
    if (!signal.aborted) useWebMetadataStore.setState({ status: null, automaticError: cause instanceof Error ? cause.message : '웹 곡 정보를 찾지 못했습니다.' });
  }
}
