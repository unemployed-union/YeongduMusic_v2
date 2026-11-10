import type { Song } from '@/types/music';

export type AlbumTrack = {
  song: Song;
  queueIndex: number;
  trackNumber: number;
};

export type AlbumTrackRow = {
  key: string;
  discNumber: number;
  showDiscHeading: boolean;
  tracks: AlbumTrack[];
};

export function songDiscNumber(song: Song): number {
  const number = song.discNumber;
  return number !== undefined && Number.isSafeInteger(number) && number > 0 ? number : 1;
}

/** Keep the queue index independent of disk headings and tablet grid padding. */
export function albumDiscLayout(songs: readonly Song[], columns: number) {
  const discs = new Map<number, AlbumTrack[]>();
  songs.forEach((song, queueIndex) => {
    const disc = songDiscNumber(song);
    const tracks = discs.get(disc) ?? [];
    const taggedTrack = song.trackNumber;
    const trackNumber = taggedTrack !== undefined && Number.isSafeInteger(taggedTrack) && taggedTrack > 0
      ? taggedTrack
      : tracks.length + 1;

    tracks.push({ song, queueIndex, trackNumber });
    discs.set(disc, tracks);
  });

  const showDiscs = discs.size > 1 || [...discs.keys()].some((disc) => disc > 1);
  const rows: AlbumTrackRow[] = [];
  const rowSize = Math.max(1, Math.floor(columns));
  for (const [discNumber, tracks] of [...discs].sort(([a], [b]) => a - b)) {
    for (let offset = 0; offset < tracks.length; offset += rowSize) {
      rows.push({
        key: `${discNumber}:${offset}`,
        discNumber,
        showDiscHeading: showDiscs && offset === 0,
        tracks: tracks.slice(offset, offset + rowSize),
      });
    }
  }

  return { rows, discCount: discs.size, showDiscs };
}
