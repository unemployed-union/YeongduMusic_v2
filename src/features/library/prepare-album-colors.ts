import { useDisplayPreferences } from '@/stores/display-preferences';
import { useLibraryDetailPreferences } from '@/stores/library-detail-preferences';
import { readArtworkColors } from '@/services/artwork/palette';

/** Warm only the album being touched, without delaying navigation or scanning the library. */
export async function prepareAlbumColors(uri: string | undefined) {
  if (!uri || useDisplayPreferences.getState().hideArtwork) {
    return;
  }
  try {
    await useLibraryDetailPreferences.getState().load();
    const current = useLibraryDetailPreferences.getState();
    if (
      current.loadError ||
      !current.preferences.albumColors ||
      useDisplayPreferences.getState().hideArtwork
    ) {
      return;
    }
    await readArtworkColors(uri, new AbortController().signal);
  } catch {
    /* The detail screen can retry or use its fallback. */
  }
}
