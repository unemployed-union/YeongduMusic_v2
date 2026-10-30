import { METADATA_FIELDS, metadataDraft, originalMetadata, parseMetadata } from './rules';
import type { MetadataDraft } from './rules';
import type { Song, SongMetadata } from '@/types/music';

export type MetadataCandidate = {
  id: string;
  recordingId: string;
  fields: SongMetadata;
  duration?: number;
  score: number;
};
export const normalizeMetadataText = (value: string) =>
  value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
export function missingMetadataText(value: string | undefined): boolean {
  return (
    !value?.trim() ||
    /^(알 수 없는 (아티스트|앨범)|unknown( artist| album)?|<unknown>)$/i.test(value.trim())
  );
}
export function lookupFingerprint(song: Song): string {
  const original = originalMetadata(song);
  return JSON.stringify([
    ...METADATA_FIELDS.map(({ key }) => original[key] ?? null),
    original.albumSource ?? null,
    song.duration,
  ]);
}
export function needsAutomaticMetadata(song: Song): boolean {
  return (
    !missingMetadataText(song.title) &&
    !missingMetadataText(song.artist) &&
    Number.isFinite(song.duration) &&
    song.duration > 0 &&
    (missingMetadataText(song.album) ||
      song.albumSource === 'fallback' ||
      !song.albumArtist ||
      !song.year ||
      !song.trackNumber ||
      !song.discNumber)
  );
}
/** Version/remix qualifiers remain significant. Different releases are never chosen arbitrarily. */
export function automaticMetadata(
  song: Song,
  candidates: MetadataCandidate[],
): SongMetadata | null {
  const matches = candidates.filter(
    (candidate) =>
      candidate.score >= 95 &&
      normalizeMetadataText(candidate.fields.title) === normalizeMetadataText(song.title) &&
      normalizeMetadataText(candidate.fields.artist) === normalizeMetadataText(song.artist) &&
      candidate.duration !== undefined &&
      Math.abs(candidate.duration - song.duration) <= 2 &&
      (missingMetadataText(song.album) ||
        song.albumSource === 'fallback' ||
        normalizeMetadataText(candidate.fields.album) === normalizeMetadataText(song.album)),
  );
  if (!matches.length) {
    return null;
  }
  const draft = metadataDraft(song);
  // Only values shared by all plausible releases are safe to fill automatically.
  for (const { key } of METADATA_FIELDS) {
    if (key === 'title' || key === 'artist') {
      continue;
    }
    if (
      key === 'album'
        ? !missingMetadataText(song.album) && song.albumSource !== 'fallback'
        : !!song[key]
    ) {
      continue;
    }
    const values = [...new Set(matches.map((candidate) => String(candidate.fields[key] ?? '')))];
    if (values.length === 1 && values[0]) {
      draft[key] = values[0];
    }
  }
  return METADATA_FIELDS.some(({ key }) => draft[key] !== String(song[key] ?? ''))
    ? parseMetadata(draft)
    : null;
}
/** A manual choice fills known results but does not erase fields absent from the provider. */
export function candidateDraft(draft: MetadataDraft, candidate: MetadataCandidate): MetadataDraft {
  const next = { ...draft };
  for (const { key } of METADATA_FIELDS) {
    if (candidate.fields[key] !== undefined && candidate.fields[key] !== '') {
      next[key] = String(candidate.fields[key]);
    }
  }
  return next;
}
