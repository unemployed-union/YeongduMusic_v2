import type { Song } from '@/types/music';

/** Metadata only: these keys are never used to read, delete or construct a playback URI. */
export function localFolderKey(uri: string): string {
  let value = uri;
  if (uri.startsWith('file://')) value = decodeURIComponent(new URL(uri).pathname);
  else if (uri.startsWith('content://')) {
    const url = new URL(uri);
    const encodedId = url.pathname.match(/\/document\/([^/]+)/)?.[1] ?? url.pathname.match(/\/tree\/([^/]+)/)?.[1];
    const id = encodedId ? decodeURIComponent(encodedId) : null;
    if (url.hostname === 'com.android.externalstorage.documents' && id) {
      const colon = id.indexOf(':');
      const volume = id.slice(0, colon), relative = id.slice(colon + 1);
      if (colon > 0 && volume === 'primary') value = '/storage/primary/' + relative;
      else if (colon > 0 && /^[a-f0-9]{4}-[a-f0-9]{4}$/i.test(volume)) value = '/storage/' + volume.toLowerCase() + '/' + relative;
      else value = '/providers/' + url.hostname + '/' + encodeURIComponent(id);
    } else value = '/providers/' + url.hostname + '/' + (id ? encodeURIComponent(id) : encodeURIComponent(url.pathname));
  }
  value = value.replace(/^\/storage\/emulated\/\d+(?=\/|$)/, '/storage/primary').replace(/^\/storage\/self\/primary(?=\/|$)/, '/storage/primary').replace(/^\/storage\/([a-f0-9]{4}-[a-f0-9]{4})(?=\/|$)/i, (_, volume: string) => '/storage/' + volume.toLowerCase());
  return value.normalize('NFC').replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
}
export function sourceFolder(uri: string): string | undefined {
  // Opaque MediaStore content IDs do not reveal the physical parent folder.
  if (!uri.startsWith('file://') && !uri.startsWith('/')) return undefined;
  const file = localFolderKey(uri), slash = file.lastIndexOf('/');
  return slash > 0 ? file.slice(0, slash) : undefined;
}
export function folderExcluded(folder: string, excluded: readonly string[]): boolean {
  return excluded.some(parent => folder === parent || folder.startsWith(parent === '/' ? '/' : parent + '/'));
}
export function localSongExcluded(song: Song, excluded: readonly string[]): boolean {
  return song.source === 'local' && !!song.local.originalFolders?.length && song.local.originalFolders.every(folder => folderExcluded(folder, excluded));
}
export function availableLocalFolders(songs: readonly Song[]): { path: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const song of songs) {
    if (song.source !== 'local') continue;
    const parents = new Set<string>();
    for (const folder of song.local.originalFolders ?? []) {
      parents.add(folder);
      for (let slash = folder.indexOf('/', 1); slash !== -1; slash = folder.indexOf('/', slash + 1)) parents.add(folder.slice(0, slash));
    }
    for (const folder of parents) counts.set(folder, (counts.get(folder) ?? 0) + 1);
  }
  return [...counts].map(([path, count]) => ({ path, count }));
}
