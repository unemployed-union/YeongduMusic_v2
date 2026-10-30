import { applyMetadataLibrary, type MetadataPatches } from '@/features/metadata/rules';
import { applyArtworkLibrary, type ArtworkPatches } from '@/features/artwork/rules';
import type { MusicSourceFilter, Page, Song } from '@/types/music';

export type DeviceLibraries = Record<'local' | 'drive' | 's3' | 'mybox', Song[]>;
export type LibraryEdits = {
  metadata: MetadataPatches;
  artwork: ArtworkPatches;
  scope: string | null;
  artworkBaseUri: string;
};

export function combineSongLibraries(
  nas: Page<Song>,
  libraries: DeviceLibraries,
  source: MusicSourceFilter,
  includeNas: boolean,
): Page<Song> {
  if (source === 'nas') return nas;
  const items = includeNas ? [...nas.items] : [];
  for (const kind of ['local', 'drive', 's3', 'mybox'] as const) {
    if (source === 'all' || source === kind) items.push(...libraries[kind]);
  }
  return { ...nas, items, total: items.length };
}

export function applyLibraryEdits(library: Page<Song>, edits: LibraryEdits): Page<Song> {
  return applyArtworkLibrary(
    applyMetadataLibrary(library, edits.metadata, edits.scope),
    edits.artwork,
    edits.scope,
    edits.artworkBaseUri,
  );
}
