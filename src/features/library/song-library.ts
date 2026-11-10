import { applyMetadataLibrary, type MetadataPatches } from '@/features/metadata/rules';
import { applyArtworkLibrary, type ArtworkPatches } from '@/features/artwork/rules';
import type { MusicSourceFilter, Page, Song } from '@/types/music';

export type DeviceLibraries = Partial<
  Record<Exclude<MusicSourceFilter, 'all' | 'nas'>, readonly Song[]>
>;
export type LibraryEdits = {
  metadata: MetadataPatches;
  artwork: ArtworkPatches;
  scope: string | null;
  artworkBaseUri: string;
};

type Preparation = {
  libraries: DeviceLibraries;
  source: MusicSourceFilter;
  includeNas: boolean;
  nasOnly: boolean;
  edits: LibraryEdits;
  stale: boolean;
  accountKey: string;
};

// One current preparation per Query page, shared by its mounted observers.
// Old pages are weak keys; edits and account switches replace rather than accumulate entries.
const preparations = new WeakMap<Page<Song>, { input: Preparation; result: Page<Song> }>();

export function prepareSongLibrary(library: Page<Song>, input: Preparation): Page<Song> {
  const previous = preparations.get(library);
  if (previous) {
    const before = previous.input;
    const keys = Object.keys(input.libraries) as (keyof DeviceLibraries)[];
    const beforeKeys = Object.keys(before.libraries);
    const sameLibraries =
      keys.length === beforeKeys.length &&
      keys.every((key, index) =>
        key === beforeKeys[index] && input.libraries[key] === before.libraries[key],
      );
    const sameEdits =
      input.edits.metadata === before.edits.metadata &&
      input.edits.artwork === before.edits.artwork &&
      input.edits.scope === before.edits.scope &&
      input.edits.artworkBaseUri === before.edits.artworkBaseUri;
    if (
      sameLibraries &&
      sameEdits &&
      input.accountKey === before.accountKey &&
      input.source === before.source &&
      input.includeNas === before.includeNas &&
      input.nasOnly === before.nasOnly &&
      input.stale === before.stale
    ) {
      return previous.result;
    }
  }

  const combined = input.nasOnly
    ? library
    : combineSongLibraries(library, input.libraries, input.source, input.includeNas);
  const result = applyLibraryEdits(
    !input.nasOnly && input.stale ? { ...combined, stale: true } : combined,
    input.edits,
  );
  preparations.set(library, { input, result });
  return result;
}

export function combineSongLibraries(
  nas: Page<Song>,
  libraries: DeviceLibraries,
  source: MusicSourceFilter,
  includeNas: boolean,
): Page<Song> {
  if (source === 'nas') {
    return nas;
  }
  const items = includeNas ? [...nas.items] : [];
  for (const kind of Object.keys(libraries) as (keyof DeviceLibraries)[]) {
    if (source === 'all' || source === kind) {
      items.push(...(libraries[kind] ?? []));
    }
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
