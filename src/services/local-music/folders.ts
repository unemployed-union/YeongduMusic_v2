import type { Song } from '@/types/music';

/** Metadata only: these keys are never used to read, delete or construct a playback URI. */
export function localFolderKey(uri: string): string {
  let value = uri;

  if (uri.startsWith('file://')) {
    const url = new URL(uri);
    value = decodeURIComponent(url.pathname);
  } else if (uri.startsWith('content://')) {
    const url = new URL(uri);
    let encodedId = url.pathname.match(/\/document\/([^/]+)/)?.[1];

    if (encodedId === undefined) {
      encodedId = url.pathname.match(/\/tree\/([^/]+)/)?.[1];
    }

    const documentId = encodedId ? decodeURIComponent(encodedId) : null;
    const externalStorageProvider = url.hostname === 'com.android.externalstorage.documents';

    if (externalStorageProvider && documentId) {
      const separator = documentId.indexOf(':');
      const volume = documentId.slice(0, separator);
      const relativePath = documentId.slice(separator + 1);
      const hasVolume = separator > 0;

      if (hasVolume && volume === 'primary') {
        value = '/storage/primary/' + relativePath;
      } else if (hasVolume && /^[a-f0-9]{4}-[a-f0-9]{4}$/i.test(volume)) {
        value = '/storage/' + volume.toLowerCase() + '/' + relativePath;
      } else {
        value = '/providers/' + url.hostname + '/' + encodeURIComponent(documentId);
      }
    } else {
      const providerPath = documentId || url.pathname;
      value = '/providers/' + url.hostname + '/' + encodeURIComponent(providerPath);
    }
  }

  const emulatedStoragePath = value.replace(
    /^\/storage\/emulated\/\d+(?=\/|$)/,
    '/storage/primary',
  );
  const primaryStoragePath = emulatedStoragePath.replace(
    /^\/storage\/self\/primary(?=\/|$)/,
    '/storage/primary',
  );
  const volumeNormalizedPath = primaryStoragePath.replace(
    /^\/storage\/([a-f0-9]{4}-[a-f0-9]{4})(?=\/|$)/i,
    (_, volume: string) => '/storage/' + volume.toLowerCase(),
  );
  const unicodeNormalizedPath = volumeNormalizedPath.normalize('NFC');
  const forwardSlashPath = unicodeNormalizedPath.replace(/\\/g, '/');
  const singleSlashPath = forwardSlashPath.replace(/\/{2,}/g, '/');
  const folderKey = singleSlashPath.replace(/\/+$/, '');

  return folderKey || '/';
}

export function sourceFolder(uri: string): string | undefined {
  // Opaque MediaStore content IDs do not reveal the physical parent folder.
  const hasFilePath = uri.startsWith('file://') || uri.startsWith('/');
  if (!hasFilePath) {
    return undefined;
  }

  const filePath = localFolderKey(uri);
  const separator = filePath.lastIndexOf('/');
  if (separator <= 0) {
    return undefined;
  }

  return filePath.slice(0, separator);
}

export function folderExcluded(folder: string, excluded: readonly string[]): boolean {
  return excluded.some((parent) => {
    if (folder === parent) {
      return true;
    }

    const childPrefix = parent === '/' ? '/' : parent + '/';
    if (folder.startsWith(childPrefix)) {
      return true;
    }
    return false;
  });
}

export function localSongExcluded(song: Song, excluded: readonly string[]): boolean {
  if (song.source !== 'local') {
    return false;
  }

  const originalFolders = song.local.originalFolders;
  if (!originalFolders?.length) {
    return false;
  }

  return originalFolders.every((folder) => folderExcluded(folder, excluded));
}

export function availableLocalFolders(songs: readonly Song[]): { path: string; count: number }[] {
  const counts = new Map<string, number>();

  for (const song of songs) {
    if (song.source !== 'local') {
      continue;
    }

    const parents = new Set<string>();
    for (const folder of song.local.originalFolders ?? []) {
      parents.add(folder);

      for (
        let separator = folder.indexOf('/', 1);
        separator !== -1;
        separator = folder.indexOf('/', separator + 1)
      ) {
        const parentPath = folder.slice(0, separator);
        parents.add(parentPath);
      }
    }

    for (const folder of parents) {
      const previousCount = counts.get(folder) ?? 0;
      counts.set(folder, previousCount + 1);
    }
  }

  return [...counts].map(([path, count]) => ({ path, count }));
}
